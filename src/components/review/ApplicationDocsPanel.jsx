import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, fmtDate, humanize } from '@/lib/tr';
import { FileText, AlertTriangle, Loader2, Download } from 'lucide-react';

const DocLink = ({ url, label, sub }) => (
  <li className="flex items-center gap-2 py-2">
    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">
      <p className="text-sm [overflow-wrap:anywhere]">{label}</p>
      {sub && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{sub}</p>}
    </div>
    {url ? (
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-accent hover:opacity-80" aria-label="Download"><Download className="h-4 w-4" /></a>
    ) : <span className="text-xs text-muted-foreground">—</span>}
  </li>
);

/** All documents submitted with an application: statements, calculation working, subsidiaries, payment evidence, extras. */
export default function ApplicationDocsPanel({ applicationId }) {
  const tr = useTr();
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = { application_id: applicationId };
      const [fs, docs, subs] = await Promise.all([
        base44.entities.FinancialStatement.filter(q, { limit: 100, sort: 'financial_year' }).catch(() => ({ items: [] })),
        base44.entities.ApplicationDocument.filter(q, { limit: 200 }).catch(() => ({ items: [] })),
        base44.entities.SubsidiaryDeclaration.filter(q, { limit: 100 }).catch(() => ({ items: [] })),
      ]);
      if (alive) setData({ fs: fs.items || [], docs: docs.items || [], subs: subs.items || [] });
    })();
    return () => { alive = false; };
  }, [applicationId]);

  if (!data) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const byCat = (c) => data.docs.filter((d) => d.category === c);
  const section = (title, children, empty) => (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wide text-primary">{title}</h4>
      {empty ? <p className="py-2 text-sm text-muted-foreground">{tr('None', 'لا يوجد')}</p> : <ul className="divide-y divide-border">{children}</ul>}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="application-docs">
      {section(tr('Financial statements', 'البيانات المالية'), data.fs.map((s) => (
        <DocLink key={s.id} url={s.file_url} label={s.document_name || s.financial_year} sub={`${tr('FY', 'سنة')} ${s.financial_year} · ${tr('ends', 'تنتهي')} ${fmtDate(s.statement_end_date)}`} />
      )), !data.fs.length)}
      {section(tr('Calculation working', 'ورقة الحساب'), byCat('calculation_working').map((d) => (
        <DocLink key={d.id} url={d.file_url} label={d.description || d.filename} sub={d.filename} />
      )), !byCat('calculation_working').length)}
      {section(tr('Subsidiaries', 'الشركات التابعة'), data.subs.map((s) => (
        <li key={s.id} className="py-2">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{s.subsidiary_name} · {s.ownership_percentage}%</p>
            {s.supporting_document && <a href={s.supporting_document} target="_blank" rel="noreferrer" className="shrink-0 text-accent"><Download className="h-4 w-4" /></a>}
          </div>
          <p className="text-xs text-muted-foreground">{tr('FY', 'سنة')} {s.financial_year || '—'} · {tr('ends', 'تنتهي')} {fmtDate(s.financial_statement_end_date)} · {tr('income statement p.', 'صفحة قائمة الدخل')} {s.income_statement_page || '—'}</p>
          {s.statement_incomplete && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {tr('Statement incomplete / not available', 'البيانات غير مكتملة / غير متوفرة')}{s.statement_incomplete_reason ? `: ${s.statement_incomplete_reason}` : ''}</p>
          )}
        </li>
      )), !data.subs.length)}
      {section(tr('Payment evidence', 'مستندات الدفع'), byCat('payment_evidence').map((d) => (
        <DocLink key={d.id} url={d.file_url} label={humanize(d.payment_method || d.description)} sub={d.filename} />
      )), !byCat('payment_evidence').length)}
      {(byCat('additional').length > 0 || byCat('other').length > 0) && section(tr('Additional documents', 'مستندات إضافية'), [...byCat('additional'), ...byCat('other')].map((d) => (
        <DocLink key={d.id} url={d.file_url} label={d.description || d.filename} sub={d.filename} />
      )), false)}
    </div>
  );
}
