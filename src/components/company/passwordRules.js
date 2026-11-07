// Same rules as server/auth.js passwordProblem.
export const passwordIssue = (p, tr) => {
  if (!p || p.length < 8) return tr('Password must be at least 8 characters.', 'يجب ألا تقل كلمة المرور عن 8 أحرف.');
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return tr('Password must contain letters and numbers.', 'يجب أن تحتوي كلمة المرور على أحرف وأرقام.');
  return '';
};
