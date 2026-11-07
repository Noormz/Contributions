// Communication helpers: one-call thread view with access check (company reps
// can see attachments on their own company's threads).
import { getDoc, allDocs, db } from '../db.js';
import { isInternal } from '../rls.js';
import { HttpError } from '../functions.js';

export const functions = {
  // Marks all (or the given) notifications of the current user as read in one call.
  async markNotificationsRead(user, { ids } = {}) {
    const mine = allDocs('Notification').filter((n) => n.user_id === user.id && !n.is_read && (!ids || ids.includes(n.id)));
    const stmt = db.prepare("UPDATE docs SET data = json_set(data, '$.is_read', json('true')) WHERE id = ? AND entity = 'Notification'");
    db.exec('BEGIN');
    try { mine.forEach((n) => stmt.run(n.id)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { updated: mine.length };
  },

  async getThread(user, { thread_id }) {
    const thread = getDoc('CommunicationThread', thread_id);
    if (!thread) throw new HttpError(404, 'The requested conversation could not be found.');
    const allowed = isInternal(user) || (user.company_id && thread.company_id === user.company_id) || thread.created_by_id === user.id;
    if (!allowed) throw new HttpError(403, 'You do not have permission to access this conversation.');
    const messages = allDocs('CommunicationMessage').filter((m) => m.thread_id === thread.id)
      .sort((a, b) => String(a.sent_date || a.created_date).localeCompare(String(b.sent_date || b.created_date)));
    const attachments = allDocs('CommunicationAttachment').filter((a) => a.thread_id === thread.id);
    const company = thread.company_id ? getDoc('Company', thread.company_id) : null;
    return {
      thread,
      messages: messages.map((m) => ({ ...m, ...(isInternal(user) ? {} : { bcc_addresses: '' }), attachments: attachments.filter((a) => a.message_id === m.id) })),
      company_contacts: company && isInternal(user)
        ? [company.official_email, company.ceo_email, company.financial_manager_email].filter(Boolean)
        : [],
    };
  },
};
