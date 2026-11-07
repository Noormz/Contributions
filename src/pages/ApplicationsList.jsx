import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtDate, errMsg, STATUS_LABELS } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Notice, yearOptions } from '@/components/application/shared';
import { Search, Loader2, Inbox, Download, FilePlus2, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE = 25;
const STATUSES = ['draft', 'submitted', 'assigned', 'under_review', 'pending_manager_approval', 'accounts_processing', 'completed', 'returned'];
const ALL = '__all';

export default function ApplicationsList() {
  const tr = useTr();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isRep = user?.role === 'company_representative';
  const canAssign = ['contributions_manager', 'system_admin'].includes(user?.role);

  const status = params.get('status') || '';
  const officer = params.get('officer') || '';
  const year = params.get('year') || '';
  const company = params.get('company') || '';
  const [search, setSearch] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(search);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [officers, setOfficers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assign, setAssign] = useState({ officer_id: '', reason: '' });
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(0); }, [debounced, status, officer, year, company]);
  useEffect(() => {
    if (!isRep) base44.functions.invoke('listOfficers').then((r) => setOfficers(Array.isArray(r) ? r : [])).catch(() => setOfficers([]));
  }, [isRep]);

  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    if (v && v !== ALL) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const buildQuery = useCallback(() => {
    const q = {};
    if (status) q.status = status.includes(',') ? { $in: status.split(',') } : status;
    if (officer) q.assigned_officer_id = officer === 'unassigned' ? { $exists: false } : officer;
    if (year) q.financial_year = year;
    if (company) q.company_id = company;
    if (debounced) {
      const esc = debounced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      q.$or = ['application_reference', 'company_name', 'financial_year'].map((k) => ({ [k]: { $regex: esc, $options: 'i' } }));
    }
    return q;
  }, [status, officer, year, company, debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.entities.ContributionApplication.filter(buildQuery(), { sort: '-created_date', limit: PAGE, skip: page * PAGE });
      setRows(res.items || []);
      setTotal(res.total ?? (res.items || []).length);
      setSelected([]);
    } catch (e) {
      setRows([]);
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    const res = await base44.entities.ContributionApplication.filter(buildQuery(), { sort: '-created_date', limit: 1000 });
    const cols = [['application_reference', 'Reference'], ['company_name', 'Company'], ['financial_year', 'Financial Year'], ['status', 'Status'], ['assigned_officer_name', 'Officer'], ['submitted_date', 'Submitted'], ['partial_calculation', 'Partial']];
    const lines = [cols.map((c) => c[1]).join(','), ...(res.items || []).map((r) => cols.map(([k]) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'contribution_applications.csv';
    a.click();
  };

  const assignable = rows.filter((r) => !['draft', 'completed'].includes(r.status));
  const toggleAll = (on) => setSelected(on ? assignable.map((r) => r.id) : []);
  const doAssign = async () => {
    setAssignError('');
    if (!assign.officer_id) { setAssignError(tr('Select an officer.', 'اختر الموظف.')); return; }
    setAssigning(true);
    try {
      const r = await base44.functions.invoke('bulkAssign', { application_ids: selected, officer_id: assign.officer_id, reason: assign.reason });
      setAssignOpen(false);
      setAssign({ officer_id: '', reason: '' });
      setFlash(tr(`${r.count} application(s) assigned.`, `تم إسناد ${r.count} طلب/طلبات.`));
      await load();
    } catch (e) {
      setAssignError(errMsg(e));
    } finally {
      setAssigning(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const statusLabel = (s) => (STATUS_LABELS[s] ? tr(...STATUS_LABELS[s]) : s);

  return (
    <div className="space-y-5" data-testid="applications-list">
      <PageHeader
        title={isRep ? tr('My Applications', 'طلباتي') : tr('Contribution Applications', 'طلبات المساهمة')}
        subtitle={loading ? '' : tr(`${total} applications`, `${total} طلب`)}
        actions={(
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
            {canAssign && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={!selected.length} onClick={() => setAssignOpen(true)} data-testid="bulk-assign">
                <UserCheck className="h-4 w-4" /> {tr(`Assign selected (${selected.length})`, `إسناد المحدد (${selected.length})`)}
              </Button>
            )}
            {isRep && <Button size="sm" asChild className="gap-1.5" data-testid="new-application"><Link to="/applications/new"><FilePlus2 className="h-4 w-4" /> {tr('New Application', 'طلب جديد')}</Link></Button>}
          </>
        )}
      />

      {flash && <Notice tone="success">{flash}</Notice>}

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Search reference or company', 'ابحث بالمرجع أو الشركة')} className="ps-9" data-testid="apps-search" />
        </div>
        <Select value={status && !status.includes(',') ? status : ALL} onValueChange={(v) => setFilter('status', v)}>
          <SelectTrigger data-testid="filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr('All statuses', 'جميع الحالات')}</SelectItem>
            {STATUSES.filter((s) => isRep || s !== 'draft').map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={year || ALL} onValueChange={(v) => setFilter('year', v)}>
          <SelectTrigger data-testid="filter-year"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr('All years', 'جميع السنوات')}</SelectItem>
            {yearOptions().map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isRep && (
          <Select value={officer || ALL} onValueChange={(v) => setFilter('officer', v)}>
            <SelectTrigger data-testid="filter-officer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{tr('All officers', 'جميع الموظفين')}</SelectItem>
              <SelectItem value="unassigned">{tr('Unassigned', 'غير مسند')}</SelectItem>
              {officers.map((o) => <SelectItem key={o.id} value={o.id}>{o.full_name || o.email}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {company && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
            {tr('Filtered by company', 'مصفاة حسب الشركة')} <Button variant="link" size="sm" onClick={() => setFilter('company', '')}>{tr('Clear', 'إزالة')}</Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {canAssign && <th className="w-10 px-4 py-3"><Checkbox checked={assignable.length > 0 && selected.length === assignable.length} onCheckedChange={(v) => toggleAll(!!v)} aria-label={tr('Select all', 'تحديد الكل')} /></th>}
                {[tr('Reference', 'المرجع'), tr('Company', 'الشركة'), tr('Year', 'السنة'), tr('Status', 'الحالة'), ...(isRep ? [] : [tr('Officer', 'الموظف')]), tr('Submitted', 'تاريخ التقديم'), ''].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : error ? (
                <tr><td colSpan={9} className="py-16 text-center text-destructive">{error} <Button variant="link" onClick={load}>{tr('Retry', 'إعادة المحاولة')}</Button></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{tr('No applications found', 'لا توجد طلبات')}</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30" data-testid="application-row">
                  {canAssign && (
                    <td className="px-4 py-3">
                      <Checkbox disabled={['draft', 'completed'].includes(r.status)} checked={selected.includes(r.id)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, r.id] : s.filter((x) => x !== r.id)))} aria-label={r.application_reference} />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link to={`/applications/${r.id}`} className="font-medium hover:text-accent hover:underline">{r.application_reference || tr('Draft', 'مسودة')}</Link>
                    {r.partial_calculation && <span className="ms-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{tr('Partial', 'جزئي')}</span>}
                  </td>
                  <td className="min-w-[10rem] break-words px-4 py-3">{r.company_name || '—'}</td>
                  <td className="px-4 py-3">{r.financial_year || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge value={r.status} /></td>
                  {!isRep && <td className="min-w-[8rem] break-words px-4 py-3">{r.assigned_officer_name || <span className="text-muted-foreground">{tr('Unassigned', 'غير مسند')}</span>}</td>}
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(r.submitted_date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-end">
                    {isRep && ['draft', 'returned'].includes(r.status) ? (
                      <Button asChild size="sm" variant="outline"><Link to={`/applications/${r.id}/edit`}>{tr('Continue', 'متابعة')}</Link></Button>
                    ) : (
                      <Button asChild size="sm" variant="ghost"><Link to={`/applications/${r.id}`}>{tr('Open', 'فتح')}</Link></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{tr(`Page ${page + 1} of ${pages}`, `صفحة ${page + 1} من ${pages}`)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 0}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page + 1 >= pages}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{tr(`Assign ${selected.length} application(s)`, `إسناد ${selected.length} طلب/طلبات`)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{tr('Officer', 'الموظف')} *</Label>
              <Select value={assign.officer_id} onValueChange={(v) => setAssign({ ...assign, officer_id: v })}>
                <SelectTrigger data-testid="bulk-assign-officer"><SelectValue placeholder={tr('Select officer', 'اختر الموظف')} /></SelectTrigger>
                <SelectContent>{officers.map((o) => <SelectItem key={o.id} value={o.id}>{o.full_name || o.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Reason', 'السبب')}</Label>
              <Input value={assign.reason} onChange={(e) => setAssign({ ...assign, reason: e.target.value })} />
            </div>
            {assignError && <Notice tone="error">{assignError}</Notice>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={doAssign} disabled={assigning} data-testid="bulk-assign-confirm">{assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Assign', 'إسناد')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
