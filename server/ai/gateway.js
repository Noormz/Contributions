// AI gateway: the one entry point from the browser. Signs-in only, rate limits (per minute and a daily
// quota from Administration → Settings → ai_daily_limit), an AI audit log of every request, and the
// confirm / dismiss step for prepared emails and messages. The model is never involved in confirming.
import { allDocs, insertDoc, updateDoc, deleteDoc, getDoc } from '../db.js';
import { setting } from '../services.js';
import { runAssistant, confirmPending } from './assistant.js';
import { makeLlm } from './llm.js';

export const LLM = makeLlm();
const ACTIONS = ['assistant', 'confirm', 'dismiss', 'feedback'];
const PER_MINUTE = 15;
const recent = new Map();
const clip = (s, n) => String(s ?? '').slice(0, n);

function burstOk(userId, now) {
  const list = (recent.get(userId) || []).filter((t) => now - t < 60000);
  if (list.length >= PER_MINUTE) { recent.set(userId, list); return false; }
  list.push(now); recent.set(userId, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((t) => now - t < 60000)) recent.delete(k);
  return true;
}
export const kuwaitDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
export const dailyLimit = () => { const n = Number(setting('ai_daily_limit', '60')); return Number.isFinite(n) && n >= 0 ? n : 60; };
export const usedToday = (user, day = kuwaitDay()) => allDocs('AiUsage').filter((u) => u.user_id === user.id && u.day === day).length;

function log(user, entry) {
  return insertDoc('AiAuditLog', { user_id: user.id, user_email: user.email, user_role: user.role, ...entry }, user);
}

export async function handleAi({ user, body = {}, llm = LLM, now = new Date() }) {
  const started = Date.now();
  if (!user) return { status: 401, body: { error: 'UNAUTHORIZED', message: 'Please sign in.' } };
  const action = String(body.action || 'assistant');
  if (!ACTIONS.includes(action)) return { status: 400, body: { error: 'BAD_ACTION', message: 'Unknown action.' } };

  if (action === 'feedback') {
    const entry = getDoc('AiAuditLog', String(body.logId || ''));
    const feedback = ['helpful', 'not_helpful'].includes(body.feedback) ? body.feedback : null;
    if (!entry || entry.user_id !== user.id || !feedback) return { status: 404, body: { error: 'NOT_FOUND', message: 'Not found.' } };
    updateDoc('AiAuditLog', entry.id, { feedback });
    return { status: 200, body: { ok: true } };
  }

  // Confirming or cancelling a prepared email/message runs the normal workflow function as the person.
  if (action === 'confirm' || action === 'dismiss') {
    const out = await confirmPending({ user, token: body.token, dismiss: action === 'dismiss', now: now.getTime() });
    log(user, { feature: `assistant:${action}`, question: clip(out.body?.message, 400), status: out.status === 200 ? 'Success' : 'Error', duration_ms: Date.now() - started });
    return out;
  }

  const question = clip(body.question, 1000);
  if (!question.trim()) return { status: 400, body: { error: 'BAD_REQUEST', message: 'Please type a question.' } };
  if (!burstOk(user.id, now.getTime())) return { status: 429, body: { error: 'RATE_LIMIT', message: 'Too many questions in a minute. Wait a moment and try again.' } };
  const limit = dailyLimit();
  const day = kuwaitDay(now);
  if (usedToday(user, day) >= limit) {
    log(user, { feature: 'assistant', question: clip(question, 400), status: 'Rate Limited', duration_ms: 0 });
    return { status: 429, body: { error: 'RATE_LIMIT', message: limit === 0 ? 'The assistant is switched off (Administration → Settings → ai_daily_limit).' : `You have reached today's limit of ${limit} questions. Please try again tomorrow.` } };
  }
  const ticket = insertDoc('AiUsage', { user_id: user.id, day }, user); // reserved before the model is called (synchronous store)
  try {
    const out = await runAssistant({ user, question, history: body.history, context: body.context, llm, today: day, now: now.getTime() });
    const entry = log(user, { feature: 'assistant', question: clip(question, 400), status: 'Success', duration_ms: Date.now() - started, model: out.model, tools: out.toolsUsed.join(',').slice(0, 300), prepared: out.attachments.confirm.length });
    return { status: 200, body: { answer: out.answer, attachments: out.attachments, logId: entry.id, model: out.model, provider: llm.provider } };
  } catch (e) {
    deleteDoc('AiUsage', ticket.id); // a failed request doesn't use up the quota
    log(user, { feature: 'assistant', question: clip(question, 400), status: 'Error', duration_ms: Date.now() - started, error_message: clip(e?.message, 300) });
    return { status: 503, body: { error: 'AI_UNAVAILABLE', message: 'The assistant is temporarily unavailable. Please try again.' } };
  }
}
