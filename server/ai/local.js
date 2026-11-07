// Offline "model" used when no AI provider is configured. It answers from the portal itself: how-to
// questions from the FAQ, records by reference number or name, and an overview of counts. It goes
// through exactly the same tools (and therefore the same permission checks) as a real model. It does
// not draft emails or messages: that needs a configured AI provider.
const REF_RE = /\b[A-Z]{2,4}-\d{4}-\d{3,}\b/;
const STOP = new Set('the a an of for to in on and or is are was what which who show me my our list find please about with from this that how many much give tell any all have has can could would there their its it de في من على عن ما هل كم أريد اعرض لي'.split(' '));
const isArabic = (s) => /[؀-ۿ]/.test(s || '');

function lastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user' && typeof messages[i].content === 'string') return i;
  return -1;
}

function decide(q, toolNames) {
  const has = (n) => toolNames.includes(n);
  const ref = REF_RE.exec(String(q).toUpperCase())?.[0];
  if (ref && has('get_record')) return [{ name: 'get_record', args: { reference: ref } }];
  if (/\b(send|email|e-mail|reply|message|draft)\b|أرسل|ارسل|راسل|بريد|رسالة/i.test(q)) return 'compose';
  if (/\b(how|where|why|steps?|register|apply|submit|pay|clearance|reset)\b|كيف|أين|خطوات|تسجيل|سداد|مخالصة/i.test(q) && has('search_help')) return [{ name: 'search_help', args: { query: q } }];
  if (/\b(overview|summary|how many|count|status|pending|open)\b|ملخص|كم|عدد|معلق/i.test(q) && has('get_overview')) return [{ name: 'get_overview', args: {} }];
  if (/\b(access|permission|role|allowed|can i)\b|صلاحي|دوري/i.test(q) && has('my_access')) return [{ name: 'my_access', args: {} }];
  const words = String(q).split(/[^\p{L}\p{N}.-]+/u).filter((w) => w.length > 3 && !STOP.has(w.toLowerCase())).sort((a, b) => b.length - a.length).slice(0, 3);
  if (words.length && has('find_records')) return words.map((w) => ({ name: 'find_records', args: { text: w } }));
  return has('get_overview') ? [{ name: 'get_overview', args: {} }] : [];
}

const line = (o) => Object.entries(o).filter(([k]) => k !== 'link').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');

function render(results, ar) {
  const out = [];
  for (const { name, result: r } of results) {
    if (!r || r.error) continue;
    if (name === 'get_record') {
      out.push(`**${r.type}** ${r.link ? `[${r.fields?.application_reference || r.fields?.payment_reference || r.fields?.voucher_number || r.fields?.clearance_reference || r.fields?.thread_reference || r.fields?.inquiry_reference || r.type}](${r.link})` : ''}`);
      for (const [k, v] of Object.entries(r.fields || {}).slice(0, 14)) out.push(`- ${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      if (r.amount) out.push(`- amount due: ${r.amount.due} KWD · remaining: ${r.amount.remaining} KWD`);
      for (const h of (r.history || []).slice(0, 5)) out.push(`- ${h.when} · ${h.action} · ${h.by || ''}`);
    } else if (name === 'search_help') {
      for (const f of (r.results || []).slice(0, 3)) out.push(`**${ar ? f.question_ar || f.question : f.question}**\n${ar ? f.answer_ar || f.answer : f.answer}`);
    } else if (name === 'get_overview' || name === 'my_access') {
      for (const [k, v] of Object.entries(r)) out.push(`- ${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : Object.entries(v || {}).map(([a, b]) => `${a.replace(/_/g, ' ')} ${b}`).join(', ')) : v}`);
    } else if (name === 'find_records' || name === 'list_records') {
      for (const h of (r.results || r.rows || []).slice(0, 10)) out.push(`- ${h.link ? `[${h.reference || h.name}](${h.link})` : h.reference || h.name} · ${line({ ...h, reference: undefined })}`);
    }
  }
  return out.join('\n');
}

export function localAssistantLlm() {
  return {
    model: 'offline',
    async chat({ messages, tools }) {
      const ui = lastUserIndex(messages);
      const q = ui >= 0 ? messages[ui].content : '';
      const ar = isArabic(q);
      const after = messages.slice(ui + 1).filter((m) => m.role === 'tool');
      if (!after.length) {
        const plan = decide(q, (tools || []).map((t) => t.name));
        if (plan === 'compose') return { text: ar ? 'تجهيز الرسائل والبريد يتطلب تفعيل مزود الذكاء الاصطناعي من قبل المسؤول. يمكنك إرسال الرسالة من صفحة الرسائل.' : 'Drafting emails and messages needs an AI provider, which an administrator sets up. You can write the message yourself from the inbox page.', toolCalls: [], model: 'offline' };
        if (!plan.length) return { text: ar ? 'لم أجد ما يكفي من المعلومات المسموح لي باستخدامها.' : "I couldn't find enough information I'm allowed to use to answer that.", toolCalls: [], model: 'offline' };
        return { text: '', toolCalls: plan.map((c, i) => ({ id: `local_${i}`, ...c })), model: 'offline' };
      }
      const results = after.map((m) => { try { return { name: m.name, result: JSON.parse(m.content).result }; } catch { return { name: m.name, result: null }; } });
      const body = render(results, ar);
      const none = ar ? 'لم أجد شيئاً يطابق سؤالك ضمن ما يُسمح لك برؤيته.' : 'I found nothing matching that among the records you may see.';
      const note = ar ? '\n\n_المساعد يعمل دون اتصال: يجيب من بيانات البوابة فقط._' : '\n\n_Offline assistant: answers from the portal\'s data only._';
      return { text: (body || none) + note, toolCalls: [], model: 'offline' };
    },
  };
}
