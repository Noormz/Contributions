// Inline bilingual strings for screens added after the base dictionary:
//   const tr = useTr(); tr('Submit', 'إرسال')
import { useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';

export function useTr() {
  const { language } = useTranslation();
  return useCallback((en, ar) => (language === 'ar' && ar ? ar : en), [language]);
}

export const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} KWD`;
export const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const STATUS_LABELS = {
  draft: ['Draft', 'مسودة'], submitted: ['Submitted', 'مقدم'], assigned: ['Assigned', 'مسند'], under_review: ['Under Review', 'قيد المراجعة'],
  calculation_review: ['Calculation Review', 'مراجعة الحساب'], pending_manager_approval: ['Pending Approval', 'بانتظار الاعتماد'],
  approved: ['Approved', 'معتمد'], accounts_processing: ['Accounts Processing', 'لدى وحدة الحسابات'], completed: ['Completed', 'مكتمل'],
  returned: ['Returned', 'معاد'], pending: ['Pending', 'معلق'], verified: ['Verified', 'مؤكد'], rejected: ['Rejected', 'مرفوض'],
  issued: ['Issued', 'صادر'], open: ['Open', 'مفتوح'], awaiting_company: ['Awaiting Company', 'بانتظار الشركة'], replied: ['Replied', 'تم الرد'],
  closed: ['Closed', 'مغلق'], unmatched: ['Unmatched', 'غير مطابق'], responded: ['Responded', 'تم الرد'], initiated: ['Initiated', 'بدأت'],
  failed: ['Failed', 'فشلت'], cancelled: ['Cancelled', 'ملغاة'], in_review: ['In Review', 'قيد المراجعة'], pending_approval: ['Pending Approval', 'بانتظار الاعتماد'],
  active: ['Active', 'نشط'], suspended: ['Suspended', 'موقوف'],
};

export const PAYMENT_METHODS = [
  { value: 'cheque', en: 'Cheque', ar: 'شيك' },
  { value: 'bank_transfer', en: 'Bank Transfer', ar: 'تحويل بنكي' },
  { value: 'bank_deposit', en: 'Bank Deposit', ar: 'إيداع بنكي' },
  { value: 'payment_gateway', en: 'Payment Gateway (online)', ar: 'بوابة الدفع (إلكتروني)' },
];

export const errMsg = (e) => e?.message || 'Something went wrong. Please try again.';
