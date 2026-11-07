// AI provider for the assistant: Azure OpenAI, OpenAI or Anthropic (Claude), chosen by environment
// variables. Without any of them the offline assistant answers from the portal's own data and FAQ
// (no data leaves the server).
//
//   AI_PROVIDER = azure | openai | anthropic | local           (default: the first one that has a key)
//   Azure:     AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION
//   OpenAI:    OPENAI_API_KEY, OPENAI_MODEL (default gpt-4o), OPENAI_BASE_URL
//   Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-sonnet-5-5)
//   AI_TIMEOUT_MS (default 45000)
//
// One neutral message format: { role: "user"|"assistant", content, toolCalls? } and
// { role: "tool", toolCallId, name, content }. chat() returns { text, toolCalls: [{ id, name, args }], model }.
import { localAssistantLlm } from './local.js';

const timeoutMs = () => Number(process.env.AI_TIMEOUT_MS) || 45000;

async function post(url, headers, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`AI provider answered ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally { clearTimeout(t); }
}
const parseArgs = (s) => { try { const v = typeof s === 'string' ? JSON.parse(s || '{}') : s; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

// ---- OpenAI-style (OpenAI and Azure OpenAI) ----
function toOpenAi(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    else if (m.role === 'assistant' && m.toolCalls?.length) out.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) });
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}
function openAiLike({ url, headers, model, bodyExtra = {} }) {
  return {
    model,
    async chat({ system, messages, tools, maxTokens = 1200 }) {
      const json = await post(url, headers, { ...bodyExtra, messages: toOpenAi(system, messages), ...(tools?.length ? { tools: tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}), max_tokens: maxTokens, temperature: 0.2 });
      const msg = json.choices?.[0]?.message || {};
      return { text: msg.content || '', toolCalls: (msg.tool_calls || []).map((c) => ({ id: c.id, name: c.function?.name, args: parseArgs(c.function?.arguments) })), model: json.model || model };
    },
  };
}

// ---- Anthropic Messages API ----
function toAnthropic(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const prev = out[out.length - 1];
      if (prev && prev.role === 'user' && Array.isArray(prev.content) && prev.content.every((b) => b.type === 'tool_result')) prev.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({ role: 'assistant', content: [...(m.content ? [{ type: 'text', text: m.content }] : []), ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} }))] });
    } else out.push({ role: m.role, content: m.content });
  }
  return out;
}
function anthropic({ key, model }) {
  return {
    model,
    async chat({ system, messages, tools, maxTokens = 1200 }) {
      const json = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, {
        model, system, max_tokens: maxTokens, messages: toAnthropic(messages),
        ...(tools?.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
      });
      const blocks = json.content || [];
      return { text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'), toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} })), model: json.model || model };
    },
  };
}

export function makeLlm(env = process.env) {
  const want = String(env.AI_PROVIDER || '').toLowerCase();
  const azure = env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_DEPLOYMENT;
  const pick = want || (azure ? 'azure' : env.OPENAI_API_KEY ? 'openai' : env.ANTHROPIC_API_KEY ? 'anthropic' : 'local');
  if (pick === 'azure' && azure) {
    const base = String(env.AZURE_OPENAI_ENDPOINT).replace(/\/+$/, '');
    return { provider: 'azure', ...openAiLike({ url: `${base}/openai/deployments/${encodeURIComponent(env.AZURE_OPENAI_DEPLOYMENT)}/chat/completions?api-version=${env.AZURE_OPENAI_API_VERSION || '2024-10-21'}`, headers: { 'api-key': env.AZURE_OPENAI_API_KEY }, model: env.AZURE_OPENAI_DEPLOYMENT }) };
  }
  if (pick === 'openai' && env.OPENAI_API_KEY) {
    const model = env.OPENAI_MODEL || 'gpt-4o';
    return { provider: 'openai', ...openAiLike({ url: `${(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`, headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, model, bodyExtra: { model } }) };
  }
  if (pick === 'anthropic' && env.ANTHROPIC_API_KEY) return { provider: 'anthropic', ...anthropic({ key: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' }) };
  return { provider: 'local', ...localAssistantLlm() };
}
