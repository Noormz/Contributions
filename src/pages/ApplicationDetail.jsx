import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtMoney, fmtDate, fmtDateTime, errMsg, humanize, PAYMENT_METHODS, STATUS_LABELS } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import ActivityTimeline from '@/components/records/ActivityTimeline';
import CommentsPanel from '@/components/records/CommentsPanel';
import BalancePanel from '@/components/payments/BalancePanel';
import ThreadsPanel from '@/components/comms/ThreadsPanel';
import ApplicationActions from '@/components/application/ApplicationActions';
import { Card, DocLink, Field, Notice, DOC_CATEGORIES } from '@/components/application/shared';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, ChevronLeft, History } from 'lucide-react';

const TAB_KEYS = ['overview', 'documents', 'subsidiaries', 'calculation', 'payments', 'communications', 'assignments', 'activity', 'comments'];

export default function ApplicationDetail() {
  const tr = useTr();
  const { id } = useParams();
  const { user } = useAuth();
  const isRep = user?.role === 'company_representative';
  const [state, setState] = useState({ loading: true });
  const [tab, setTab] = useState('overview');

  const load = useCallback(async () => {
    try {
      const app = await base44.entities.ContributionApplication.get(id);
      const safe = (p) => p.then((r) => r.items || r).catch(() => []);
      const [statements, docs, subs, calcs, versions, assignments, history] = await Promise.all([
        safe(base44.entities.FinancialStatement.filter({ application_id: id }, { limit: 100, sort: 'created_date' })),
        safe(base44.entities.ApplicationDocument.filter({ application_id: id }, { limit: 200, sort: 'created_date' })),
        safe(base44.entities.SubsidiaryDeclaration.filter({ application_id: id }, { limit: 100, sort: 'created_date' })),
        isRep ? Promise.resolve([]) : safe(base44.entities.ContributionCalculation.filter({ application_id: id }, { limit: 10, sort: '-created_date' })),
        isRep ? Promise.resolve([]) : safe(base44.entities.CalculationVersion.filter({ application_id: id }, { limit: 50, sort: '-version' })),
        isRep ? Promise.resolve([]) : safe(base44.entities.OfficerAssignment.filter({ application_id: id }, { limit: 50, sort: '-created_date' })),
        isRep ? base44.functions.invoke('applicationHistory', { application_id: id }).catch(() => []) : Promise.resolve([]),
      ]);
      setState({ loading: false, app, statements, docs, subs, calcs, versions, assignments, history });
    } catch (e) {
      setState({ loading: false, error: e.status === 404 ? 'not_found' : e.status === 403 ? 'forbidden' : errMsg(e) });
    }
  }, [id, isRep]);

  useEffect(() => { setState({ loading: true }); load(); }, [load]);

  if (state.loading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (state.error) {
    const msg = state.error === 'not_found' ? tr('The requested record could not be found.', 'تعذر العثور على السجل المطلوب.')
      : state.error === 'forbidden' ? tr('You do not have permission to access this record.', 'ليس لديك صلاحية للوصول إلى هذا السجل.') : state.error;
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center" data-testid="application-error">
        <AlertTriangle className="h-10 w-10 text-warning" />
        <p className="font-semibold">{msg}</p>
        <Button asChild variant="outline" size="sm"><Link to="/applications"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {tr('Back to applications', 'العودة إلى الطلبات')}</Link></Button>
      </div>
    );
  }

  const { app, statements, docs, subs, calcs, versions, assignments, history } = state;
  const calc = calcs[0];
  let inputs = {};
  try { inputs = JSON.parse(calc?.financial_inputs || '{}'); } catch { /* ignore */ }
  const pm = (m) => { const p = PAYMENT_METHODS.find((x) => x.value === m); return p ? tr(p.en, p.ar) : humanize(m); };
  const methods = (app.payment_methods?.length ? app.payment_methods : [app.payment_method]).filter(Boolean);
  const companyLink = isRep ? '/company-profile' : `/companies/${app.company_id}`;
  const lastReturn = history.find((h) => h.action === 'return_application');

  const tabs = TAB_KEYS.filter((k) => !(isRep && ['assignments', 'comments'].includes(k)));
  const tabLabel = {
    overview: tr('Overview', 'نظرة عامة'), documents: tr('Documents', 'المستندات'), subsidiaries: tr('Subsidiaries', 'الشركات التابعة'),
    calculation: tr('Calculation', 'الحساب'), payments: tr('Payments', 'المدفوعات'), communications: tr('Communications', 'المراسلات'),
    assignments: tr('Assignment history', 'سجل الإسناد'), activity: tr('Activity', 'السجل'), comments: tr('Comments', 'التعليقات'),
  };

  const groupedDocs = [
    ['financial_statement', statements.map((s) => ({ id: s.id, url: s.file_url, name: s.document_name, sub: `${tr('FY', 'س.م')} ${s.financial_year} · ${fmtDate(s.statement_start_date)} → ${fmtDate(s.statement_end_date)}` }))],
    ...['calculation_working', 'payment_evidence', 'additional', 'other'].map((c) => [c, docs.filter((d) => d.category === c).map((d) => ({ id: d.id, url: d.file_url, name: d.description || d.filename, sub: [d.payment_method && pm(d.payment_method), d.uploaded_by_name, fmtDateTime(d.upload_date || d.created_date)].filter(Boolean).join(' · ') }))]),
    ['subsidiary', subs.filter((s) => s.supporting_document).map((s) => ({ id: s.id, url: s.supporting_document, name: s.subsidiary_name, sub: `${s.ownership_percentage}%` }))],
  ];

  return (
    <div className="space-y-5" data-testid="application-detail">
      <PageHeader
        title={app.application_reference || tr('Draft application', 'مسودة طلب')}
        crumbs={[{ label: isRep ? tr('My Applications', 'طلباتي') : tr('Applications', 'الطلبات'), to: '/applications' }, { label: app.application_reference || tr('Draft', 'مسودة') }]}
      />

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={app.status} />
          {app.partial_calculation && <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning" data-testid="partial-badge">{tr('Partial calculation', 'احتساب جزئي')}</span>}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={tr('Company', 'الشركة')}><Link to={companyLink} className="text-accent hover:underline">{app.company_name}</Link></Field>
          <Field label={tr('Financial year', 'السنة المالية')}>{app.financial_year}</Field>
          {!isRep && <Field label={tr('Assigned officer', 'الموظف المسند')}>{app.assigned_officer_name || tr('Unassigned', 'غير مسند')}</Field>}
          <Field label={tr('Submitted', 'تاريخ التقديم')}>{fmtDateTime(app.submitted_date)}</Field>
          {app.contribution_due != null && <Field label={tr('Contribution due', 'المساهمة المستحقة')}>{fmtMoney(app.contribution_due)}</Field>}
        </dl>
        <div className="mt-4">
          <ApplicationActions app={app} user={user} hasCalculation={!!calc} onChanged={load} />
        </div>
      </div>

      {isRep && app.status === 'returned' && lastReturn && (
        <Notice tone="warning" testId="returned-comments">
          <p className="font-semibold">{tr('Returned by the Contributions Unit', 'أعيد من قبل وحدة المساهمات')} · {fmtDateTime(lastReturn.date)}</p>
          <p className="mt-1 whitespace-pre-wrap">{lastReturn.comments}</p>
        </Notice>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tabLabel[k]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Card title={tr('Application details', 'تفاصيل الطلب')}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label={tr('Reference', 'المرجع')}>{app.application_reference || '—'}</Field>
            <Field label={tr('Status', 'الحالة')}><StatusBadge value={app.status} /></Field>
            <Field label={tr('Financial year', 'السنة المالية')}>{app.financial_year}</Field>
            <Field label={tr('Payment method(s)', 'طريقة/طرق الدفع')}>{methods.map(pm).join(tr(', ', '، ')) || '—'}</Field>
            <Field label={tr('Self-calculated amount', 'المبلغ المحتسب ذاتياً')}>{app.declared_amount ? fmtMoney(app.declared_amount) : '—'}</Field>
            <Field label={tr('Contribution due', 'المساهمة المستحقة')}>{app.contribution_due != null ? fmtMoney(app.contribution_due) : tr('Not yet approved', 'لم تعتمد بعد')}</Field>
            <Field label={tr('Profile confirmed', 'تأكيد الملف')}>{app.profile_confirmed ? tr('Yes', 'نعم') : tr('No', 'لا')}</Field>
            <Field label={tr('Acknowledgements', 'الإقرارات')}>{app.acknowledgements?.accuracy && app.acknowledgements?.terms ? tr('Accepted', 'تمت الموافقة') : tr('Not accepted', 'لم تتم الموافقة')}</Field>
            <Field label={tr('Partial calculation', 'احتساب جزئي')}>{app.partial_calculation ? tr('Yes — subsidiary statements pending', 'نعم — بيانات الشركات التابعة معلقة') : tr('No', 'لا')}</Field>
            <Field label={tr('Created', 'تاريخ الإنشاء')}>{fmtDateTime(app.created_date)}</Field>
            <Field label={tr('Last updated', 'آخر تحديث')}>{fmtDateTime(app.updated_date)}</Field>
            {app.completed_date && <Field label={tr('Completed', 'تاريخ الاكتمال')}>{fmtDateTime(app.completed_date)}</Field>}
            {app.profile_changes && Object.keys(app.profile_changes).length > 0 && (
              <div className="sm:col-span-2"><Field label={tr('Profile changes requested', 'تعديلات الملف المطلوبة')}>{Object.entries(app.profile_changes).map(([k, v]) => `${humanize(k)}: ${v}`).join(' · ')}</Field></div>
            )}
            <div className="sm:col-span-2"><Field label={tr('Additional information', 'معلومات إضافية')}><span className="whitespace-pre-wrap">{app.additional_comments || '—'}</span></Field></div>
          </dl>
        </Card>
      )}

      {tab === 'documents' && (
        <div className="space-y-4">
          {groupedDocs.map(([cat, items]) => (
            <Card key={cat} title={tr(...(DOC_CATEGORIES[cat] || DOC_CATEGORIES.other))} testId={`docs-${cat}`}>
              {items.length ? <div className="divide-y divide-border">{items.map((d) => <DocLink key={d.id} url={d.url} name={d.name} sub={d.sub} />)}</div> : <p className="text-sm text-muted-foreground">—</p>}
            </Card>
          ))}
        </div>
      )}

      {tab === 'subsidiaries' && (
        <Card title={tr('Subsidiary declaration', 'إقرار الشركات التابعة')}>
          {subs.length === 0 ? <p className="text-sm text-muted-foreground">{tr('No subsidiaries declared.', 'لم يتم التصريح عن شركات تابعة.')}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>{[tr('Subsidiary', 'الشركة التابعة'), tr('Ownership', 'الملكية'), tr('FY', 'س.م'), tr('Statement end', 'نهاية البيان'), tr('Income stmt. page', 'صفحة قائمة الدخل'), tr('Statement status', 'حالة البيان'), tr('Document', 'المستند')].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {subs.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">{s.subsidiary_name}</td>
                      <td className="px-3 py-2">{s.ownership_percentage}%</td>
                      <td className="px-3 py-2">{s.financial_year || '—'}</td>
                      <td className="px-3 py-2">{fmtDate(s.financial_statement_end_date)}</td>
                      <td className="px-3 py-2">{s.income_statement_page || '—'}</td>
                      <td className="px-3 py-2">{s.statement_incomplete ? <span className="text-warning">{tr('Incomplete', 'غير مكتمل')}{s.statement_incomplete_reason ? ` — ${s.statement_incomplete_reason}` : ''}</span> : tr('Complete', 'مكتمل')}</td>
                      <td className="px-3 py-2">{s.supporting_document ? <a href={s.supporting_document} target="_blank" rel="noreferrer" className="text-accent hover:underline">{tr('View', 'عرض')}</a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'calculation' && (isRep ? (
        <Card title={tr('Contribution', 'المساهمة')}>
          {app.contribution_due != null
            ? <p className="text-2xl font-bold tabular-nums">{fmtMoney(app.contribution_due)}</p>
            : <p className="text-sm text-muted-foreground">{tr('The contribution amount will be shown here once approved by the Contributions Unit.', 'سيظهر مبلغ المساهمة هنا بعد اعتماده من وحدة المساهمات.')}</p>}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card title={tr('Internal calculation', 'الحساب الداخلي')} actions={<Button asChild size="sm" variant="outline"><Link to={`/calculation-review/${app.id}`}>{tr('Open workspace', 'فتح مساحة العمل')}</Link></Button>}>
            {!calc ? <p className="text-sm text-muted-foreground">{tr('No calculation yet.', 'لا يوجد حساب بعد.')}</p> : (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3" data-testid="calc-summary">
                <Field label={tr('Reference', 'المرجع')}>{calc.calculation_reference}</Field>
                <Field label={tr('Status', 'الحالة')}><StatusBadge value={calc.status} /></Field>
                <Field label={tr('Version', 'الإصدار')}>{calc.version || 1}</Field>
                <Field label={tr('Net profit', 'صافي الربح')}>{inputs.net_profit != null ? fmtMoney(inputs.net_profit) : '—'}</Field>
                <Field label={tr('Subsidiary share', 'حصة الشركات التابعة')}>{fmtMoney(inputs.subsidiary_share || 0)}</Field>
                <Field label={tr('Contribution rate', 'نسبة المساهمة')}>{inputs.contribution_rate != null ? `${inputs.contribution_rate}%` : '—'}</Field>
                <Field label={tr('Adjustments', 'التسويات')}>{fmtMoney(calc.adjustments)}</Field>
                <Field label={tr('Calculated contribution', 'المساهمة المحتسبة')}><strong>{fmtMoney(calc.calculated_contribution)}</strong></Field>
                <Field label={tr('Partial', 'جزئي')}>{calc.is_partial ? tr('Yes', 'نعم') : tr('No', 'لا')}</Field>
                <Field label={tr('Reviewed by', 'راجعه')}>{calc.reviewed_by}</Field>
                <Field label={tr('Approved by', 'اعتمده')}>{calc.approved_by}</Field>
                <Field label={tr('Approval date', 'تاريخ الاعتماد')}>{fmtDateTime(calc.approval_date)}</Field>
                <div className="sm:col-span-3"><Field label={tr('Officer comments', 'ملاحظات الموظف')}>{calc.officer_comments}</Field></div>
                {calc.manager_comments && <div className="sm:col-span-3"><Field label={tr('Manager comments', 'ملاحظات المدير')}>{calc.manager_comments}</Field></div>}
              </dl>
            )}
          </Card>
          {versions.length > 0 && (
            <Card title={tr('Calculation versions', 'إصدارات الحساب')}>
              <ul className="divide-y divide-border text-sm">
                {versions.map((v) => {
                  let snap = {};
                  try { snap = JSON.parse(v.snapshot || '{}'); } catch { /* ignore */ }
                  return (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span><History className="me-1 inline h-3.5 w-3.5 text-muted-foreground" />v{v.version} · {fmtMoney(snap.calculated_contribution)} · {snap.status ? (STATUS_LABELS[snap.status] ? tr(...STATUS_LABELS[snap.status]) : snap.status) : ''}</span>
                      <span className="text-xs text-muted-foreground">{v.changed_by} · {fmtDateTime(v.created_date)}{v.reason ? ` · ${v.reason}` : ''}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      ))}

      {tab === 'payments' && <BalancePanel application={app} companyId={app.company_id} />}
      {tab === 'communications' && <ThreadsPanel companyId={app.company_id} applicationId={app.id} />}

      {tab === 'assignments' && (
        <Card title={tr('Assignment history', 'سجل الإسناد')}>
          {assignments.length === 0 ? <p className="text-sm text-muted-foreground">{tr('No assignments recorded.', 'لا توجد عمليات إسناد.')}</p> : (
            <ul className="divide-y divide-border text-sm" data-testid="assignment-history">
              {assignments.map((a) => (
                <li key={a.id} className="py-2.5">
                  <p><strong>{a.new_officer_name}</strong>{a.previous_officer_name ? <span className="text-muted-foreground"> ← {a.previous_officer_name}</span> : ''}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(a.assignment_date || a.created_date)} · {tr('by', 'بواسطة')} {a.assigned_by}{a.assignment_reason ? ` · ${a.assignment_reason}` : ''}{a.notes ? ` · ${a.notes}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'activity' && (isRep ? (
        <Card title={tr('Application history', 'سجل الطلب')}>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ol className="relative space-y-4 border-s border-border ps-5" data-testid="company-history">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -start-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary/70" />
                  <p className="text-sm font-semibold">{STATUS_LABELS[h.new_status] ? tr(...STATUS_LABELS[h.new_status]) : humanize(h.new_status)}</p>
                  {h.comments && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{h.comments}</p>}
                  <p className="text-xs text-muted-foreground">{fmtDateTime(h.date)}{h.by ? ` · ${h.by}` : ''}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : <ActivityTimeline entityName="ContributionApplication" recordId={app.id} />)}

      {tab === 'comments' && <CommentsPanel entityName="ContributionApplication" recordId={app.id} />}
    </div>
  );
}
