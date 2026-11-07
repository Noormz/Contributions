// Outbound mail. Every message is recorded in the MailOutbox entity, which the
// admin "Mailbox" page shows; when SMTP_HOST is configured it is also delivered.
import nodemailer from 'nodemailer';
import { insertDoc, allDocs } from './db.js';

// Sender and reply-to addresses come from the environment (see README → Email).
export const FROM = process.env.MAIL_FROM || 'contributions@portal.local';
export const REPLY_TO = process.env.INBOUND_ADDRESS || FROM;
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  : null;

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((s) => s.trim()).filter(Boolean);

export async function sendMail({ to, cc, bcc, subject, text, html, from = FROM, headers = {}, category = 'system', related = {} }) {
  const rec = insertDoc('MailOutbox', {
    from_address: from,
    to_addresses: list(to),
    cc_addresses: list(cc),
    bcc_addresses: list(bcc),
    subject,
    body: text || '',
    html: html || '',
    headers,
    category,
    ...related,
    delivery: transport ? 'pending' : 'local',
    sent_date: new Date().toISOString(),
  }, null);
  if (transport) {
    try {
      await transport.sendMail({ from, to: list(to), cc: list(cc), bcc: list(bcc), subject, text, html, headers });
    } catch (e) {
      console.error('[mail] SMTP delivery failed:', e.message);
    }
  }
  return rec;
}

export const recentMail = (limit = 200) =>
  allDocs('MailOutbox').sort((a, b) => b.created_date.localeCompare(a.created_date)).slice(0, limit);
