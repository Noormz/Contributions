import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtMoney, fmtDateTime, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import CalculationDetail, { parseInputs } from '@/components/review/CalculationDetail';
import ApplicationDocsPanel from '@/components/review/ApplicationDocsPanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Inbox, CheckCircle2, Undo2, AlertTriangle } from 'lucide-react';

export default function ApprovalManagement() {
  const { t } = useTranslation();
  const tr = useTr();
  const { user } = useAuth();
  const canApprove = ['contributions_manager', 'system_admin'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState({ approve: [], return_for_correction: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [previous, setPrevious] = useState([]);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const commentsRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [calcRes, appRes, hist] = await Promise.all([
        base44.entities.ContributionCalculation.filter({ status: 'pending_approval' }, { sort: 'updated_date', limit: 200 }),
        base44.entities.ContributionApplication.filter({ status: 'pending_manager_approval' }, { limit: 200 }),
        base44.entities.ApprovalHistory.filter({ action_by: user.id, action: { $in: ['approve', 'return_for_correction'] } }, { sort: '-created_date', limit: 200 }),
      ]);
      const apps = Object.fromEntries((appRes.items || []).map((a) => [a.id, a]));
      setRows((calcRes.items || []).filter((c) => apps[c.application_id]).map((c) => ({ calc: c, app: apps[c.application_id] })));
      const h = hist.items || [];
      const ids = Array.from(new Set(h.map((x) => x.application_id)));
      const refApps = ids.length ? (await base44.entities.ContributionApplication.filter({ id: { $in: ids } }, { limit: 500 })).items || [] : [];
      const map = Object.fromEntries(refApps.map((a) => [a.id, a]));
      const enrich = (x) => ({ ...x, app: map[x.application_id] });
      setHistory({ approve: h.filter((x) => x.action === 'approve').map(enrich), return_for_correction: h.filter((x) => x.action === 'return_for_correction').map(enrich) });
    } catch (e) {
      setRows([]);
      setMsg({ ok: false, text: errMsg(e) });
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const open = async (row) => {
    setSelected(row);
    setComments('');
    setDialogError('');
    setPrevious([]);
    const prev = await base44.functions.invoke('previousCalculations', { company_id: row.app.company_id, exclude_application_id: row.app.id }).catch(() => []);
    setPrevious(Array.isArray(prev) ? prev : []);
  };

  const act = async (approve) => {
    if (!approve && !comments.trim()) {
      setDialogError(tr('Write a reason before returning: the officer needs to know what to correct.', 'اكتب سبب الإعادة أولاً: يحتاج الموظف لمعرفة ما يجب تصحيحه.'));
      commentsRef.current?.focus();
      return;
    }
    setBusy(true);
    setMsg(null);
    setDialogError('');
    try {
      await base44.functions.invoke('applicationAction', { application_id: selected.app.id, action: approve ? 'approve' : 'return_to_officer', comments });
      setMsg({ ok: true, text: approve ? tr(`${selected.app.application_reference} approved and forwarded to the Accounts Unit.`, `تم اعتماد ${selected.app.application_reference} وإحالته لوحدة الحسابات.`) : tr(`${selected.app.application_reference} returned to the officer.`, `تمت إعادة ${selected.app.application_reference} للموظف.`) });
      setSelected(null);
      await load();
    } catch (e) {
      setDialogError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const historyTable = (items) => (
    <div className="overflow-x-auto scrollbar-thin rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>{[tr('Application', 'الطلب'), tr('Company', 'الشركة'), tr('Date', 'التاريخ'), tr('Comments', 'التعليقات'), tr('Current status', 'الحالة الحالية')].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.length === 0 ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">{tr('No records found', 'لا توجد سجلات')}</td></tr> : items.map((h) => (
            <tr key={h.id}>
              <td className="px-4 py-3"><Link to={`/applications/${h.application_id}`} className="font-medium hover:text-accent hover:underline">{h.app?.application_reference || h.application_id}</Link></td>
              <td className="min-w-[10rem] break-words px-4 py-3">{h.app?.company_name || '—'}</td>
              <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(h.action_date || h.created_date)}</td>
              <td className="min-w-[12rem] break-words px-4 py-3">{h.comments || '—'}</td>
              <td className="px-4 py-3"><StatusBadge value={h.app?.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!canApprove) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center text-destructive">{tr('You do not have permission to access this page.', 'ليس لديك صلاحية للوصول إلى هذه الصفحة.')}</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav_approval')} subtitle={t('rv_verify')} crumbs={[{ label: t('nav_approval') }]} />
      {msg && <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`} role="status">{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</div>}

      <Tabs defaultValue="waiting">
        <TabsList>
          <TabsTrigger value="waiting" data-testid="tab-waiting">{tr('Waiting for my approval', 'بانتظار اعتمادي')} ({rows.length})</TabsTrigger>
          <TabsTrigger value="approved">{tr('Approved by me', 'اعتمدتها')} ({history.approve.length})</TabsTrigger>
          <TabsTrigger value="returned">{tr('Returned by me', 'أعدتها')} ({history.return_for_correction.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="waiting" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{[t('rv_calc_ref'), tr('Application', 'الطلب'), tr('Company', 'الشركة'), t('w_financial_year'), tr('Officer', 'الموظف'), t('rv_calculated'), ''].map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{t('rv_no_pending')}</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.calc.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{row.calc.calculation_reference}{row.calc.is_partial && <span className="ms-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{tr('Partial', 'جزئي')}</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3"><Link to={`/applications/${row.app.id}`} className="hover:text-accent hover:underline">{row.app.application_reference}</Link></td>
                      <td className="min-w-[10rem] break-words px-4 py-3">{row.app.company_name}</td>
                      <td className="px-4 py-3">{row.app.financial_year}</td>
                      <td className="min-w-[8rem] break-words px-4 py-3">{row.calc.reviewed_by || row.app.assigned_officer_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{fmtMoney(row.calc.calculated_contribution)}</td>
                      <td className="px-4 py-3 text-end"><Button size="sm" variant="outline" onClick={() => open(row)} data-testid="review-approval">{tr('Review', 'مراجعة')}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="approved" className="mt-4">{historyTable(history.approve)}</TabsContent>
        <TabsContent value="returned" className="mt-4">{historyTable(history.return_for_correction)}</TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{t('rv_verify')} — {selected?.app.application_reference}</DialogTitle></DialogHeader>
          {selected && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <p className="text-sm"><span className="text-muted-foreground">{tr('Company', 'الشركة')}:</span> <span className="font-medium">{selected.app.company_name}</span> · {t('w_financial_year')} {selected.app.financial_year}</p>
                <CalculationDetail calc={selected.calc} />
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">{tr('Comparison with previous years', 'مقارنة بالسنوات السابقة')}</h4>
                  {previous.length === 0 ? <p className="text-sm text-muted-foreground">{tr('No previous calculations.', 'لا توجد حسابات سابقة.')}</p> : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border">
                        {previous.map((c) => {
                          const i = parseInputs(c);
                          const diff = Number(selected.calc.calculated_contribution) - Number(c.calculated_contribution || 0);
                          return (
                            <tr key={c.id}>
                              <td className="py-2">{tr('FY', 'سنة')} {c.financial_year}</td>
                              <td className="py-2 text-muted-foreground">{fmtMoney(i.net_profit)} · {i.contribution_rate}%</td>
                              <td className="py-2 text-end tabular-nums">{fmtMoney(c.calculated_contribution)}</td>
                              <td className={`py-2 text-end text-xs tabular-nums ${diff >= 0 ? 'text-success' : 'text-destructive'}`}>{diff >= 0 ? '+' : ''}{diff.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4">
                  <ApplicationDocsPanel applicationId={selected.app.id} />
                </div>
                <Button asChild variant="link" className="px-0"><Link to={`/applications/${selected.app.id}`}>{tr('Open full application', 'فتح الطلب كاملاً')}</Link></Button>
              </div>
            </div>
          )}
          {selected && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label htmlFor="approval-comments">
                {t('rv_approval_comments')} <span className="text-xs text-muted-foreground">({tr('required to return, optional to approve', 'مطلوبة عند الإعادة، اختيارية عند الاعتماد')})</span>
              </Label>
              <Textarea id="approval-comments" ref={commentsRef} rows={3} value={comments}
                onChange={(e) => { setComments(e.target.value); if (e.target.value.trim()) setDialogError(''); }}
                aria-invalid={!!dialogError && !comments.trim()} aria-describedby={dialogError ? 'approval-error' : undefined}
                className={dialogError && !comments.trim() ? 'border-destructive ring-1 ring-destructive' : ''}
                placeholder={tr('Reason for returning, or a note for the approval record', 'سبب الإعادة، أو ملاحظة لسجل الاعتماد')} data-testid="approval-comments" />
              {dialogError && (
                <p id="approval-error" role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive" data-testid="approval-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {dialogError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => act(false)} className="gap-1.5 text-destructive" data-testid="return-to-officer"><Undo2 className="h-4 w-4" /> {t('rv_return_correction')}</Button>
            <Button disabled={busy} onClick={() => act(true)} className="gap-1.5" data-testid="approve-calc">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t('rv_approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
