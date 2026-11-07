import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtDate, fmtDateTime, humanize, errMsg } from '@/lib/tr';
import { passwordIssue } from '@/components/company/passwordRules';
import StatusBadge from '@/components/review/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Download, Inbox } from 'lucide-react';

function useList(loader, deps) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setRows(await loader()); } catch (e) { setRows([]); setError(errMsg(e)); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { rows, loading, error, reload: load };
}

function Table({ headers, loading, error, empty, children, count }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{headers.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={headers.length} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
            ) : error ? (
              <tr><td colSpan={headers.length} className="py-10 text-center text-destructive">{error}</td></tr>
            ) : count === 0 ? (
              <tr><td colSpan={headers.length} className="py-10 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />{empty}</td></tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Td = ({ children, className = '' }) => <td className={`px-4 py-3 ${className}`}>{children}</td>;
const DownloadLink = ({ url }) => {
  const tr = useTr();
  if (!url) return <span className="text-muted-foreground">—</span>;
  return <a href={`${url}${url.startsWith('/api/files/') ? '?download=1' : ''}`} className="inline-flex items-center gap-1 text-accent hover:underline"><Download className="h-3.5 w-3.5" /> {tr('Download', 'تنزيل')}</a>;
};

export function UsersTab({ company }) {
  const tr = useTr();
  const { user } = useAuth();
  const { rows, loading, error, reload } = useList(() => base44.functions.invoke('companyUsers', { company_id: company.id }), [company.id]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', job_title: '', password: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const canAdd = user?.role === 'system_admin' || user?.company_id === company.id;

  const add = async () => {
    if (!form.full_name.trim()) return setFormError(tr('Name is required.', 'الاسم مطلوب.'));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return setFormError(tr('Enter a valid email address.', 'أدخل بريداً إلكترونياً صحيحاً.'));
    const pw = passwordIssue(form.password, tr);
    if (pw) return setFormError(pw);
    setSaving(true);
    setFormError('');
    try {
      await base44.functions.invoke('addCompanyUser', { company_id: company.id, ...form, email: form.email.trim() });
      setOpen(false);
      setDone(tr(`User ${form.email} added. Share the initial password with them securely.`, `تمت إضافة المستخدم ${form.email}. شارك كلمة المرور الأولية معه بشكل آمن.`));
      setForm({ full_name: '', email: '', job_title: '', password: '' });
      reload();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{tr('People who can log in and act for this company.', 'الأشخاص الذين يمكنهم الدخول والتصرف نيابة عن الشركة.')}</p>
        {canAdd && <Button size="sm" className="gap-1.5" onClick={() => { setOpen(true); setFormError(''); }} data-testid="company-user-add"><Plus className="h-4 w-4" /> {tr('Add user', 'إضافة مستخدم')}</Button>}
      </div>
      {done && <p className="rounded-lg bg-success/10 p-3 text-sm text-success" role="status">{done}</p>}
      <Table headers={[tr('Name', 'الاسم'), tr('Email', 'البريد الإلكتروني'), tr('Job title', 'المسمى الوظيفي'), tr('Status', 'الحالة')]} loading={loading} error={error} count={rows.length} empty={tr('No users.', 'لا يوجد مستخدمون.')}>
        {rows.map((u) => (
          <tr key={u.id} data-testid="company-user-row">
            <Td>{u.full_name}{u.primary && <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{tr('Primary contact', 'جهة الاتصال الرئيسية')}</span>}</Td>
            <Td>{u.email}</Td>
            <Td>{u.job_title || '—'}</Td>
            <Td><StatusBadge value={u.is_active ? 'active' : 'suspended'} /></Td>
          </tr>
        ))}
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{tr('Add company user', 'إضافة مستخدم للشركة')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[['full_name', 'Full name', 'الاسم الكامل', 'text'], ['email', 'Email', 'البريد الإلكتروني', 'email'], ['job_title', 'Job title', 'المسمى الوظيفي', 'text'], ['password', 'Initial password', 'كلمة المرور الأولية', 'password']].map(([k, en, ar, type]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`cu-${k}`}>{tr(en, ar)}</Label>
                <Input id={`cu-${k}`} data-testid={`company-user-${k}`} type={type} autoComplete={type === 'password' ? 'new-password' : 'off'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{tr('At least 8 characters with letters and numbers.', '8 أحرف على الأقل تتضمن أحرفاً وأرقاماً.')}</p>
            {formError && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={add} disabled={saving} data-testid="company-user-save">{saving && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}{tr('Add user', 'إضافة')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ApplicationsTab({ company }) {
  const tr = useTr();
  const { user } = useAuth();
  const { rows, loading, error } = useList(async () => (await base44.entities.ContributionApplication.filter({ company_id: company.id }, { sort: '-financial_year', limit: 200 })).items || [], [company.id]);
  return (
    <div className="space-y-4">
      {user?.company_id === company.id && (
        <div className="flex justify-end"><Button asChild size="sm"><Link to="/applications/new"><Plus className="me-1.5 h-4 w-4" />{tr('New application', 'طلب جديد')}</Link></Button></div>
      )}
      <Table headers={[tr('Reference', 'المرجع'), tr('Financial year', 'السنة المالية'), tr('Status', 'الحالة'), tr('Officer', 'الموظف'), tr('Submitted', 'تاريخ التقديم')]} loading={loading} error={error} count={rows.length} empty={tr('No applications yet.', 'لا توجد طلبات بعد.')}>
        {rows.map((a) => (
          <tr key={a.id}>
            <Td><Link to={`/applications/${a.id}`} className="font-medium text-accent hover:underline">{a.application_reference || tr('Draft', 'مسودة')}</Link></Td>
            <Td>{a.financial_year || '—'}</Td>
            <Td><StatusBadge value={a.status} /></Td>
            <Td>{a.assigned_officer_name || '—'}</Td>
            <Td className="whitespace-nowrap">{fmtDate(a.submitted_date)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

export function DocumentsTab({ company }) {
  const tr = useTr();
  const { rows, loading, error } = useList(async () => {
    const [v, c, f] = await Promise.all([
      base44.entities.ReceiptVoucher.filter({ company_id: company.id }, { limit: 200 }),
      base44.entities.ClearanceLetter.filter({ company_id: company.id }, { limit: 200 }),
      base44.entities.FinancialStatement.filter({ company_id: company.id }, { limit: 200 }),
    ]);
    return [
      ...(v.items || []).map((r) => ({ id: r.id, entity: 'ReceiptVoucher', type: tr('Receipt voucher', 'سند قبض'), ref: r.voucher_number || r.voucher_reference, date: r.voucher_date, status: r.status, url: `/api/receipt-vouchers/${r.id}/voucher.pdf`, by: r.uploaded_by, app: r.application_reference })),
      ...(c.items || []).map((r) => ({ id: r.id, entity: 'ClearanceLetter', type: tr('Clearance letter', 'شهادة مخالصة'), ref: r.clearance_reference, date: r.clearance_date, status: r.clearance_status, url: `/api/clearance-letters/${r.id}/letter.pdf`, by: r.uploaded_by, app: r.application_reference })),
      ...(f.items || []).map((r) => ({ id: r.id, entity: 'FinancialStatement', type: tr('Financial statement', 'بيانات مالية'), ref: `${r.document_name || ''} (${r.financial_year || ''})`, date: r.statement_end_date, status: r.review_status, url: r.file_url, by: r.created_by, app: '' })),
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [company.id]);
  return (
    <Table headers={[tr('Type', 'النوع'), tr('Reference', 'المرجع'), tr('Date', 'التاريخ'), tr('Status', 'الحالة'), tr('Uploaded by', 'رفعه'), tr('File', 'الملف')]} loading={loading} error={error} count={rows.length} empty={tr('No documents yet.', 'لا توجد مستندات بعد.')}>
      {rows.map((d) => (
        <tr key={`${d.entity}-${d.id}`}>
          <Td className="whitespace-nowrap">{d.type}</Td>
          <Td><Link to={`/records/${d.entity}/${d.id}`} className="text-accent hover:underline">{d.ref || '—'}</Link>{d.app && <span className="block text-xs text-muted-foreground">{d.app}</span>}</Td>
          <Td className="whitespace-nowrap">{fmtDate(d.date)}</Td>
          <Td><StatusBadge value={d.status} /></Td>
          <Td>{d.by || '—'}</Td>
          <Td><DownloadLink url={d.url} /></Td>
        </tr>
      ))}
    </Table>
  );
}

export function HistoryTab({ company }) {
  const tr = useTr();
  const { rows, loading, error } = useList(async () => (await base44.entities.CompanyProfileChangeHistory.filter({ company_id: company.id }, { sort: '-created_date', limit: 300 })).items || [], [company.id, company.updated_date]);
  return (
    <Table headers={[tr('Date', 'التاريخ'), tr('Field', 'الحقل'), tr('Previous value', 'القيمة السابقة'), tr('New value', 'القيمة الجديدة'), tr('Changed by', 'عدّله'), tr('Reason / application', 'السبب / الطلب')]} loading={loading} error={error} count={rows.length} empty={tr('No profile changes recorded.', 'لا توجد تعديلات مسجلة.')}>
      {rows.map((h) => (
        <tr key={h.id}>
          <Td className="whitespace-nowrap">{fmtDateTime(h.modification_date || h.created_date)}</Td>
          <Td>{humanize(h.field_name)}</Td>
          <Td className="max-w-[16rem] break-words text-muted-foreground">{h.previous_value || '—'}</Td>
          <Td className="max-w-[16rem] break-words">{h.new_value || '—'}</Td>
          <Td>{h.modified_by || '—'}</Td>
          <Td>{[h.change_reason, h.related_application_reference].filter(Boolean).join(' · ') || '—'}</Td>
        </tr>
      ))}
    </Table>
  );
}
