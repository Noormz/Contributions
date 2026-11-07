import crypto from 'node:crypto';
import { db, getDoc, insertDoc, updateDoc, allDocs, now } from './db.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

export const passwordProblem = (p) => {
  if (!p || p.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Password must contain letters and numbers.';
  return null;
};

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created) VALUES (?,?,?)').run(token, userId, now());
  return token;
}

export function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  const user = getDoc('User', row.user_id);
  if (!user || user.is_active === false) return null;
  // Base44 platform admins carried role "admin"; treat as system_admin.
  if (user.role === 'admin') user.role = 'system_admin';
  return user;
}

export function findCredentialByEmail(email) {
  return db.prepare('SELECT * FROM credentials WHERE lower(email) = lower(?)').get(String(email || '').trim());
}

export function findUserByLogin(login) {
  const l = String(login || '').trim().toLowerCase();
  const byEmail = findCredentialByEmail(l);
  if (byEmail) return { cred: byEmail, user: getDoc('User', byEmail.user_id) };
  const user = allDocs('User').find((u) => (u.username || '').toLowerCase() === l);
  if (!user) return null;
  const cred = db.prepare('SELECT * FROM credentials WHERE user_id = ?').get(user.id);
  return cred ? { cred, user } : null;
}

export function createUser({ email, password, full_name, role = 'company_representative', verified = false, ...rest }) {
  const user = insertDoc('User', {
    email: email.trim().toLowerCase(), full_name: full_name || email.split('@')[0], role,
    is_active: true, language_preference: 'en', ...rest,
  }, null);
  db.prepare('INSERT INTO credentials (user_id, email, password_hash, verified) VALUES (?,?,?,?)')
    .run(user.id, user.email, password ? hashPassword(password) : null, verified ? 1 : 0);
  return user;
}

export function issueOtp(userId) {
  const otp = String(crypto.randomInt(100000, 999999));
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare('UPDATE credentials SET otp = ?, otp_expires = ? WHERE user_id = ?').run(otp, expires, userId);
  return otp;
}

export function setPassword(userId, password) {
  db.prepare('UPDATE credentials SET password_hash = ? WHERE user_id = ?').run(hashPassword(password), userId);
}

export function markVerified(userId) {
  db.prepare('UPDATE credentials SET verified = 1, otp = NULL, otp_expires = NULL WHERE user_id = ?').run(userId);
  updateDoc('User', userId, { email_verified: true });
}

export function issueResetToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE credentials SET reset_token = ?, reset_expires = ? WHERE user_id = ?').run(token, expires, userId);
  return token;
}

export function consumeResetToken(token) {
  const row = db.prepare('SELECT * FROM credentials WHERE reset_token = ?').get(token);
  if (!row || row.reset_expires < now()) return null;
  db.prepare('UPDATE credentials SET reset_token = NULL, reset_expires = NULL WHERE user_id = ?').run(row.user_id);
  return row.user_id;
}

export const publicUser = (u) => {
  if (!u) return null;
  const { ...rest } = u;
  return rest;
};
