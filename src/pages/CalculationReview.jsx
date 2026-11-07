import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { base44, downloadAuthed } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtMoney, fmtDateTime, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import CalculationInputsForm, { computeContribution } from '@/components/review/CalculationInputsForm';
import { parseInputs } from '@/components/review/CalculationDetail';
import ApplicationDocsPanel from '@/components/review/ApplicationDocsPanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Inbox, ClipboardCheck, AlertTriangle, Copy, FileDown, RotateCcw, Send, Save, Undo2, FileText } from 'lucide-react';

const QUEUE_STATUSES = ['submitted', 'assigned', 'under_review', 'pending_manager_approval'];

export default function CalculationReview() {
  const { id } = useParams();
  return id ? <ReviewWorkspace id={id} /> : <ReviewQueue />;
}

function ReviewQueue() {
  const { t } = useTranslation();
  const tr = useTr();
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(user?.role === 'contributions_officer');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const q = { status: status === 'all' ? { $in: QUEUE_STATUSES } : status };
      if (mine) q.assigned_officer_id = user.id;
      try {
        const res = await base44.entities.ContributionApplication.filter(q, { sort: 'submitted_date', limit: 200 });
        setApps(res.items || []);
      } catch { setApps([]); }
      setLoading(false);
    })();
  }, [mine, status, user?.id]);

  const age = (a) => {
    const d = a.assigned_date || a.submitted_date;
    return d ? Math.floor((Date.now() - new Date(d)) / 86400000) : 0;
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav_calculation_review')} subtitle={tr('Applications waiting for calculation and review', 'الطلبات بانتظار الحساب والمراجعة')} crumbs={[{ label: t('nav_calculation_review') }]} />
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={mine} onCheckedChange={setMine} data-testid="queue-mine" />
          {tr('Assigned to me only', 'المسندة إليّ فقط')}
        </label>
        <div className="w-56">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label={t('status')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All open statuses', 'كل الحالات المفتوحة')}</SelectItem>
              {QUEUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[tr('Reference', 'المرجع'), tr('Company', 'الشركة'), t('w_financial_year'), t('rv_assigned_officer'), tr('Days', 'الأيام'), t('status'), ''].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : apps.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{t('rv_no_review')}</td></tr>
              ) : apps.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link to={`/calculation-review/${a.id}`} className="whitespace-nowrap font-medium text-accent hover:underline" data-testid="queue-row">{a.application_reference || '—'}</Link>
                    {a.partial_calculation && <span className="mt-1 block w-fit rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{tr('Partial', 'جزئي')}</span>}
                  </td>
                  <td className="min-w-[10rem] break-words px-4 py-3">{a.company_name}</td>
                  <td className="px-4 py-3">{a.financial_year}</td>
                  <td className="min-w-[8rem] break-words px-4 py-3">{a.assigned_officer_name || <span className="text-muted-foreground">{tr('Unassigned', 'غير مسند')}</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{age(a)}</td>
                  <td className="px-4 py-3"><StatusBadge value={a.status} /></td>
                  <td className="px-4 py-3">
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 whitespace-nowrap"><Link to={`/applications/${a.id}`} title={tr('Open application', 'فتح الطلب')} aria-label={tr(`Open application ${a.application_reference}`, `فتح الطلب ${a.application_reference}`)} data-testid="queue-open-application"><FileText className="h-4 w-4" />{tr('Open', 'فتح')}</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const emptyForm = { net_profit: '', subsidiary_share: 0, contribution_rate: '', adjustments: 0, previous_contribution: 0, outstanding_balance: 0, calculation_basis: '', officer_comments: '' };

function formFromCalc(calc, defaultRate) {
  if (!calc) return { ...emptyForm, contribution_rate: defaultRate };
  const i = parseInputs(calc);
  return {
    net_profit: i.net_profit ?? '', subsidiary_share: i.subsidiary_share ?? 0, contribution_rate: i.contribution_rate ?? defaultRate,
    adjustments: calc.adjustments ?? 0, previous_contribution: calc.previous_contribution ?? 0, outstanding_balance: calc.outstanding_balance ?? 0,
    calculation_basis: calc.calculation_basis || '', officer_comments: calc.officer_comments || '',
  };
}

function ReviewWorkspace({ id }) {
  const { t } = useTranslation();
  const tr = useTr();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [calc, setCalc] = useState(null);
  const [subs, setSubs] = useState([]);
  const [previous, setPrevious] = useState([]);
  const [versions, setVersions] = useState([]);
  const [defaultRate, setDefaultRate] = useState('1');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dialog, setDialog] = useState(null); // 'return' | 'reopen'
  const [dialogText, setDialogText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await base44.entities.ContributionApplication.get(id);
      const [calcs, sd, settings, vers] = await Promise.all([
        base44.entities.ContributionCalculation.filter({ application_id: id }, { limit: 1 }),
        base44.entities.SubsidiaryDeclaration.filter({ application_id: id }, { limit: 100 }).catch(() => ({ items: [] })),
        base44.entities.SystemSettings.filter({ setting_key: 'default_contribution_rate' }, { limit: 1 }).catch(() => ({ items: [] })),
        base44.entities.CalculationVersion.filter({ application_id: id }, { sort: '-version', limit: 50 }).catch(() => ({ items: [] })),
      ]);
      const rate = settings.items?.[0]?.setting_value || '1';
      const c = calcs.items?.[0] || null;
      setApp(a);
      setCalc(c);
      setSubs(sd.items || []);
      setVersions(vers.items || []);
      setDefaultRate(rate);
      setForm(formFromCalc(c, rate));
      const prev = await base44.functions.invoke('previousCalculations', { company_id: a.company_id, exclude_application_id: a.id }).catch(() => []);
      setPrevious(Array.isArray(prev) ? prev : []);
    } catch (e) {
      setNotFound(e.status === 403 ? tr('You do not have permission to access this record.', 'ليس لديك صلاحية للوصول إلى هذا السجل.') : tr('The requested record could not be found.', 'السجل المطلوب غير موجود.'));
    }
    setLoading(false);
  }, [id, tr]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (notFound) return <div className="flex flex-col items-center gap-3 py-24 text-center"><AlertTriangle className="h-10 w-10 text-warning" /><p className="font-semibold">{notFound}</p><Button variant="outline" onClick={() => navigate('/calculation-review')}>{tr('Back to queue', 'العودة للقائمة')}</Button></div>;

  const calculated = computeContribution(form);
  const canAct = ['contributions_officer', 'contributions_manager', 'system_admin'].includes(user?.role);
  const approved = calc?.status === 'approved';
  const reopened = approved && calc?.reopened;
  const pending = app.status === 'pending_manager_approval';
  const canStart = ['submitted', 'assigned'].includes(app.status);
  const reviewing = app.status === 'under_review';
  const readOnly = !canAct || pending || (approved && !reopened) || (!reviewing && !reopened);
  const inputsValid = form.net_profit !== '' && form.contribution_rate !== '' && Number(form.contribution_rate) >= 0 && Number(form.contribution_rate) <= 100;
  const incompleteSubs = subs.filter((s) => s.statement_incomplete);

  const run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const inputs = { ...form };
  const save = (submit) => run(() => base44.functions.invoke('saveCalculation', { application_id: id, inputs, submit }), submit ? tr('Calculation submitted to the manager for approval.', 'تم إرسال الحساب للمدير للاعتماد.') : t('rv_saved_ok'));
  const submitRevised = () => run(() => base44.functions.invoke('submitReopenedCalculation', { application_id: id, inputs, reason: calc.reopen_reason || 'Revised calculation' }), tr('Revised calculation submitted for approval.', 'تم إرسال الحساب المعدل للاعتماد.'));
  const startReview = () => run(() => base44.functions.invoke('applicationAction', { application_id: id, action: 'start_review' }), t('rv_review_started'));
  const confirmDialog = async () => {
    const text = dialogText.trim();
    if (dialog === 'return') await run(() => base44.functions.invoke('applicationAction', { application_id: id, action: 'return_to_company', comments: text }), t('rv_returned_ok'));
    if (dialog === 'reopen') await run(() => base44.functions.invoke('reopenCalculation', { calculation_id: calc.id, reason: text }), tr('Calculation reopened. Update the inputs and resubmit.', 'تمت إعادة فتح الحساب. حدّث المدخلات وأعد الإرسال.'));
    setDialog(null);
    setDialogText('');
  };
  const copyFrom = (c) => {
    const i = parseInputs(c);
    setForm({ ...form, net_profit: i.net_profit ?? form.net_profit, subsidiary_share: i.subsidiary_share ?? 0, contribution_rate: i.contribution_rate ?? form.contribution_rate, adjustments: c.adjustments ?? 0, calculation_basis: c.calculation_basis || form.calculation_basis, previous_contribution: c.calculated_contribution ?? form.previous_contribution });
    setMsg({ ok: true, text: tr(`Inputs copied from FY ${c.financial_year}. Review before saving.`, `تم نسخ المدخلات من سنة ${c.financial_year}. راجعها قبل الحفظ.`) });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${t('rv_review_title')} — ${app.application_reference || ''}`}
        subtitle={`${app.company_name} · ${t('w_financial_year')} ${app.financial_year} · ${app.assigned_officer_name || tr('Unassigned', 'غير مسند')}`}
        crumbs={[{ label: t('nav_calculation_review'), to: '/calculation-review' }, { label: app.application_reference || id }]}
        actions={(
          <>
            <StatusBadge value={app.status} />
            {calc && <StatusBadge value={calc.status} />}
            <Button asChild variant="outline" size="sm"><Link to={`/applications/${id}`}>{tr('Open application', 'فتح الطلب')}</Link></Button>
            {calc && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadAuthed(`/api/applications/${id}/calculation.pdf`, `${calc.calculation_reference}.pdf`).catch((e) => setMsg({ ok: false, text: errMsg(e) }))}>
                <FileDown className="h-4 w-4" /> {tr('Calculation sheet PDF', 'ورقة الحساب PDF')}
              </Button>
            )}
          </>
        )}
      />

      {app.partial_calculation && (
        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" data-testid="partial-banner">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">{tr('Partial calculation', 'حساب جزئي')}</p>
            <p className="text-muted-foreground">{tr('Some subsidiary financial statements are incomplete or not yet available. Approve what is available now; reopen the calculation when the documents arrive.', 'بعض البيانات المالية للشركات التابعة غير مكتملة. اعتمد المتاح الآن وأعد فتح الحساب عند وصول المستندات.')}</p>
            {incompleteSubs.map((s) => <p key={s.id} className="mt-1">• {s.subsidiary_name}{s.statement_incomplete_reason ? ` — ${s.statement_incomplete_reason}` : ''}</p>)}
            {app.partial_calculation_notes && <p className="mt-1">{app.partial_calculation_notes}</p>}
          </div>
        </div>
      )}

      {calc?.status === 'returned' && calc.manager_comments && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" data-testid="manager-comments">
          <p className="font-semibold text-destructive">{tr('Returned by the manager for correction', 'أعادها المدير للتصحيح')}</p>
          <p className="mt-1 whitespace-pre-wrap">{calc.manager_comments}</p>
        </div>
      )}

      {msg && <div className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`} role="status">{msg.text}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            {canStart && canAct && (
              <div className="flex flex-col gap-3 rounded-lg bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">{tr('Start the review to enter and submit the calculation.', 'ابدأ المراجعة لإدخال الحساب وإرساله.')}</p>
                <Button onClick={startReview} disabled={busy} className="gap-2" data-testid="start-review"><ClipboardCheck className="h-4 w-4" /> {t('rv_start_review')}</Button>
              </div>
            )}
            {pending && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{tr('This calculation is waiting for manager approval.', 'هذا الحساب بانتظار اعتماد المدير.')}</p>}
            {approved && !reopened && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{tr(`Approved by ${calc.approved_by || 'manager'} on ${fmtDateTime(calc.approval_date)}.`, `اعتمد من ${calc.approved_by || 'المدير'} في ${fmtDateTime(calc.approval_date)}.`)}</p>}
            {reopened && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{tr('Calculation reopened', 'تمت إعادة فتح الحساب')}: {calc.reopen_reason}</p>}

            <CalculationInputsForm form={form} setForm={setForm} calculated={calculated} readOnly={readOnly} />

            <div className="flex flex-col-reverse flex-wrap gap-2 sm:flex-row sm:justify-end">
              {canAct && ['submitted', 'assigned', 'under_review'].includes(app.status) && (
                <Button variant="outline" disabled={busy} onClick={() => { setDialog('return'); setDialogText(''); }} className="gap-1.5 text-destructive" data-testid="return-to-company">
                  <Undo2 className="h-4 w-4" /> {t('rv_return_app')}
                </Button>
              )}
              {canAct && approved && !reopened && (
                <Button variant="outline" disabled={busy} onClick={() => { setDialog('reopen'); setDialogText(''); }} className="gap-1.5" data-testid="reopen-calc">
                  <RotateCcw className="h-4 w-4" /> {tr('Reopen calculation', 'إعادة فتح الحساب')}
                </Button>
              )}
              {!readOnly && !reopened && (
                <>
                  <Button variant="outline" disabled={busy || !inputsValid} onClick={() => save(false)} className="gap-1.5" data-testid="save-calc"><Save className="h-4 w-4" /> {tr('Save draft', 'حفظ كمسودة')}</Button>
                  <Button disabled={busy || !inputsValid} onClick={() => save(true)} className="gap-1.5" data-testid="submit-calc">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {tr('Submit to manager', 'إرسال للمدير')}
                  </Button>
                </>
              )}
              {reopened && canAct && (
                <Button disabled={busy || !inputsValid} onClick={submitRevised} className="gap-1.5" data-testid="submit-revised"><Send className="h-4 w-4" /> {tr('Submit revised calculation', 'إرسال الحساب المعدل')}</Button>
              )}
            </div>
            {!inputsValid && !readOnly && <p className="text-xs text-muted-foreground">{tr('Net profit and a contribution rate between 0 and 100 are required.', 'صافي الربح ونسبة مساهمة بين 0 و100 مطلوبة.')}</p>}
          </div>

          {versions.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">{tr('Version history', 'سجل الإصدارات')}</h3>
              <ul className="divide-y divide-border text-sm">
                {versions.map((v) => {
                  let snap = {};
                  try { snap = JSON.parse(v.snapshot || '{}'); } catch { /* ignore */ }
                  return (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>v{v.version} · {v.changed_by} · {fmtDateTime(v.created_date)}{v.reason ? ` — ${v.reason}` : ''}</span>
                      <span className="font-medium tabular-nums">{fmtMoney(snap.calculated_contribution)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">{tr('Previous years', 'السنوات السابقة')}</h3>
            {previous.length === 0 ? <p className="text-sm text-muted-foreground">{tr('No previous calculations for this company.', 'لا توجد حسابات سابقة لهذه الشركة.')}</p> : (
              <ul className="space-y-3" data-testid="previous-calcs">
                {previous.map((c) => {
                  const i = parseInputs(c);
                  return (
                    <li key={c.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{tr('FY', 'سنة')} {c.financial_year}</span>
                        <StatusBadge value={c.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{tr('Net profit', 'صافي الربح')} {fmtMoney(i.net_profit)} · {i.contribution_rate}% {tr('adj.', 'تسوية')} {fmtMoney(c.adjustments)}</p>
                      <p className="mt-1 font-medium tabular-nums">{fmtMoney(c.calculated_contribution)}</p>
                      {!readOnly && <Button variant="ghost" size="sm" className="mt-1 h-7 gap-1 px-2 text-accent" onClick={() => copyFrom(c)} data-testid="copy-inputs"><Copy className="h-3.5 w-3.5" /> {tr('Copy inputs', 'نسخ المدخلات')}</Button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">{tr('Application documents', 'مستندات الطلب')}</h3>
            <ApplicationDocsPanel applicationId={id} />
          </div>
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{dialog === 'return' ? t('rv_return_app') : tr('Reopen calculation', 'إعادة فتح الحساب')}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dlg-text">{dialog === 'return' ? t('rv_return_comments') : tr('Reason for reopening', 'سبب إعادة الفتح')} *</Label>
            <Textarea id="dlg-text" rows={4} value={dialogText} onChange={(e) => setDialogText(e.target.value)} data-testid="dialog-text" />
            {!dialogText.trim() && (
              <p className="flex items-center gap-1.5 text-xs text-warning" data-testid="dialog-hint">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {dialog === 'return' ? tr('Write what the company needs to correct to continue. It is emailed to them.', 'اكتب ما يجب على الشركة تصحيحه للمتابعة. سيُرسل لها بالبريد.') : tr('Write the reason for reopening to continue.', 'اكتب سبب إعادة الفتح للمتابعة.')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>{t('cancel')}</Button>
            <Button variant={dialog === 'return' ? 'destructive' : 'default'} disabled={busy || !dialogText.trim()} onClick={confirmDialog} data-testid="dialog-confirm">
              {dialog === 'return' ? t('rv_confirm_return') : tr('Reopen', 'إعادة فتح')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
