import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtDate, errMsg } from '@/lib/tr';
import FileUpload from '@/components/common/FileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Trash2, GitBranch } from 'lucide-react';

const blank = {
  direction: 'subsidiary', other_company_id: '', other_company_name: '', ownership_percentage: '',
  relationship_start_date: '', relationship_end_date: '', financial_year: '', financial_statement_end_date: '',
  income_statement_page_reference: '', supporting_attachment: '',
};
const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function RelationshipsTab({ company, internal }) {
  const tr = useTr();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.entities.CompanyRelationship.filter({ $or: [{ parent_company_id: company.id }, { subsidiary_company_id: company.id }] }, { limit: 200 });
      setRows(r.items || []);
    } catch { setRows([]); }
    setLoading(false);
  }, [company.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (internal) base44.entities.Company.filter({}, { sort: 'company_name_en', limit: 1000 }).then((r) => setCompanies((r.items || []).filter((c) => c.id !== company.id))).catch(() => {});
  }, [internal, company.id]);

  const isAdmin = user?.role === 'system_admin';
  const canUpdate = (r) => isAdmin || user?.role === 'contributions_manager' || r.created_by_id === user?.id;
  const canDelete = (r) => isAdmin || r.created_by_id === user?.id;
  const canAdd = internal ? ['contributions_officer', 'contributions_manager', 'system_admin'].includes(user?.role) : user?.company_id === company.id;

  const openAdd = () => { setEditing(null); setForm(blank); setError(''); setOpen(true); };
  const openEdit = (r) => {
    const isParent = r.parent_company_id === company.id;
    setEditing(r);
    setForm({
      ...blank, ...Object.fromEntries(Object.keys(blank).filter((k) => r[k] !== undefined).map((k) => [k, r[k] ?? ''])),
      direction: isParent ? 'subsidiary' : 'parent',
      other_company_id: isParent ? r.subsidiary_company_id || '' : r.parent_company_id || '',
      other_company_name: isParent ? r.subsidiary_company_name || '' : r.parent_company_name || '',
      ownership_percentage: r.ownership_percentage ?? '',
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    const pct = Number(form.ownership_percentage);
    if (!form.other_company_id && !form.other_company_name.trim()) return setError(tr('Select or enter the related company.', 'اختر أو أدخل الشركة المرتبطة.'));
    if (form.ownership_percentage === '' || Number.isNaN(pct) || pct <= 0 || pct > 100) return setError(tr('Ownership must be between 0 and 100%.', 'يجب أن تكون نسبة الملكية بين 0 و100%.'));
    if (form.relationship_end_date && form.relationship_start_date && form.relationship_end_date < form.relationship_start_date) return setError(tr('End date cannot be before the start date.', 'لا يمكن أن يسبق تاريخ الانتهاء تاريخ البدء.'));
    const other = companies.find((c) => c.id === form.other_company_id);
    const otherName = other?.company_name_en || form.other_company_name.trim();
    const self = { id: company.id, name: company.company_name_en };
    const data = {
      ownership_percentage: pct,
      relationship_start_date: form.relationship_start_date || undefined,
      relationship_end_date: form.relationship_end_date || undefined,
      financial_year: form.financial_year || undefined,
      financial_statement_end_date: form.financial_statement_end_date || undefined,
      income_statement_page_reference: form.income_statement_page_reference || undefined,
      supporting_attachment: form.supporting_attachment || undefined,
      ...(form.direction === 'subsidiary'
        ? { parent_company_id: self.id, parent_company_name: self.name, subsidiary_company_id: form.other_company_id || '', subsidiary_company_name: otherName }
        : { subsidiary_company_id: self.id, subsidiary_company_name: self.name, parent_company_id: form.other_company_id || '', parent_company_name: otherName }),
      company_id: company.id,
    };
    setSaving(true);
    setError('');
    try {
      if (editing) await base44.entities.CompanyRelationship.update(editing.id, data);
      else await base44.entities.CompanyRelationship.create(data);
      setOpen(false);
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await base44.entities.CompanyRelationship.delete(confirmDel.id);
      setConfirmDel(null);
      load();
    } catch (e) {
      setConfirmDel(null);
      setError(errMsg(e));
    }
  };

  const otherLink = (id, name) => (internal && id ? <Link to={`/companies/${id}`} className="text-accent hover:underline">{name || id}</Link> : <span>{name || '—'}</span>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tr('Parent and subsidiary companies with ownership percentages.', 'الشركات الأم والتابعة ونسب الملكية.')}</p>
        {canAdd && <Button size="sm" onClick={openAdd} className="gap-1.5" data-testid="relationship-add"><Plus className="h-4 w-4" /> {tr('Add relationship', 'إضافة علاقة')}</Button>}
      </div>
      {error && !open && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[tr('Relationship', 'العلاقة'), tr('Company', 'الشركة'), tr('Ownership', 'الملكية'), tr('Period', 'الفترة'), tr('FS year / end', 'سنة / نهاية القوائم'), ''].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground"><GitBranch className="mx-auto mb-2 h-6 w-6 opacity-40" />{tr('No relationships recorded.', 'لا توجد علاقات مسجلة.')}</td></tr>
              ) : rows.map((r) => {
                const isParent = r.parent_company_id === company.id;
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-3">{isParent ? tr('Subsidiary', 'شركة تابعة') : tr('Parent', 'شركة أم')}</td>
                    <td className="px-4 py-3">{isParent ? otherLink(r.subsidiary_company_id, r.subsidiary_company_name) : otherLink(r.parent_company_id, r.parent_company_name)}</td>
                    <td className="px-4 py-3 tabular-nums">{r.ownership_percentage}%</td>
                    <td className="whitespace-nowrap px-4 py-3">{fmtDate(r.relationship_start_date)} – {r.relationship_end_date ? fmtDate(r.relationship_end_date) : tr('present', 'حتى الآن')}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.financial_year || '—'} / {fmtDate(r.financial_statement_end_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-end">
                      {r.supporting_attachment && <a href={`${r.supporting_attachment}?download=1`} className="me-2 text-xs text-accent hover:underline">{tr('Document', 'مستند')}</a>}
                      {canUpdate(r) && <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label={tr('Edit', 'تعديل')}><Pencil className="h-4 w-4" /></Button>}
                      {canDelete(r) && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfirmDel(r)} aria-label={tr('Delete', 'حذف')}><Trash2 className="h-4 w-4" /></Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? tr('Edit relationship', 'تعديل العلاقة') : tr('Add relationship', 'إضافة علاقة')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rel-dir">{tr('The other company is', 'الشركة الأخرى هي')}</Label>
              <select id="rel-dir" className={selectCls} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="subsidiary">{tr(`A subsidiary of ${company.company_name_en}`, `شركة تابعة لـ ${company.company_name_ar || company.company_name_en}`)}</option>
                <option value="parent">{tr(`The parent of ${company.company_name_en}`, `الشركة الأم لـ ${company.company_name_ar || company.company_name_en}`)}</option>
              </select>
            </div>
            {internal && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rel-co">{tr('Registered company', 'شركة مسجلة')}</Label>
                <select id="rel-co" className={selectCls} value={form.other_company_id} onChange={(e) => setForm({ ...form, other_company_id: e.target.value })}>
                  <option value="">{tr('Not registered — enter name below', 'غير مسجلة — أدخل الاسم أدناه')}</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name_en}{c.company_name_ar ? ` — ${c.company_name_ar}` : ''}</option>)}
                </select>
              </div>
            )}
            {!form.other_company_id && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rel-name">{tr('Company name', 'اسم الشركة')} *</Label>
                <Input id="rel-name" data-testid="relationship-name" value={form.other_company_name} onChange={(e) => setForm({ ...form, other_company_name: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rel-pct">{tr('Ownership %', 'نسبة الملكية %')} *</Label>
              <Input id="rel-pct" data-testid="relationship-pct" type="number" min="0" max="100" step="any" value={form.ownership_percentage} onChange={(e) => setForm({ ...form, ownership_percentage: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-fy">{tr('Financial year', 'السنة المالية')}</Label>
              <Input id="rel-fy" value={form.financial_year} onChange={(e) => setForm({ ...form, financial_year: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-start">{tr('Start date', 'تاريخ البدء')}</Label>
              <Input id="rel-start" type="date" value={form.relationship_start_date} onChange={(e) => setForm({ ...form, relationship_start_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-end">{tr('End date', 'تاريخ الانتهاء')}</Label>
              <Input id="rel-end" type="date" value={form.relationship_end_date} onChange={(e) => setForm({ ...form, relationship_end_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-fse">{tr('Statement end date', 'تاريخ نهاية القوائم')}</Label>
              <Input id="rel-fse" type="date" value={form.financial_statement_end_date} onChange={(e) => setForm({ ...form, financial_statement_end_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-page">{tr('Income statement page', 'صفحة قائمة الدخل')}</Label>
              <Input id="rel-page" value={form.income_statement_page_reference} onChange={(e) => setForm({ ...form, income_statement_page_reference: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{tr('Supporting document', 'مستند داعم')}</Label>
              <FileUpload value={form.supporting_attachment} companyId={company.id} onUploaded={(f) => setForm((s) => ({ ...s, supporting_attachment: f.file_url }))} onClear={() => setForm((s) => ({ ...s, supporting_attachment: '' }))} />
            </div>
          </div>
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={save} disabled={saving} data-testid="relationship-save">{saving && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}{tr('Save', 'حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr('Delete relationship?', 'حذف العلاقة؟')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{tr('This cannot be undone.', 'لا يمكن التراجع عن ذلك.')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button variant="destructive" onClick={remove}>{tr('Delete', 'حذف')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
