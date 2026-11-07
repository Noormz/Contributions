import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44, downloadAuthed } from '@/api/base44Client';
import { useTr, fmtMoney, fmtDate, fmtDateTime, errMsg, PAYMENT_METHODS } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/review/StatusBadge';
import { DOC_CATEGORIES, Notice } from '@/components/application/shared';
import { CheckCircle2, Printer, Download, Loader2, ArrowLeft } from 'lucide-react';

export default function ApplicationConfirmation() {
  const tr = useTr();
  const { id } = useParams();
  const [state, setState] = useState({ loading: true });
  const [dlError, setDlError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const app = await base44.entities.ContributionApplication.get(id);
        const [company, fs, docs, subs] = await Promise.all([
          base44.entities.Company.get(app.company_id).catch(() => null),
          base44.entities.FinancialStatement.filter({ application_id: id }, { limit: 100, sort: 'created_date' }),
          base44.entities.ApplicationDocument.filter({ application_id: id }, { limit: 200, sort: 'created_date' }),
          base44.entities.SubsidiaryDeclaration.filter({ application_id: id }, { limit: 100 }),
        ]);
        setState({ loading: false, app, company, statements: fs.items || [], docs: docs.items || [], subs: subs.items || [] });
      } catch (e) {
        setState({ loading: false, error: e.status === 404 ? tr('The requested application could not be found.', 'تعذر العثور على الطلب.') : errMsg(e) });
      }
    })();
  }, [id, tr]);

  if (state.loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (state.error) return <Notice tone="error">{state.error}</Notice>;

  const { app, company, statements, docs, subs } = state;
  const ref = app.application_reference || tr('Draft', 'مسودة');
  const pm = (m) => { const p = PAYMENT_METHODS.find((x) => x.value === m); return p ? tr(p.en, p.ar) : m; };
  const methods = (app.payment_methods?.length ? app.payment_methods : [app.payment_method]).filter(Boolean);
  const documents = [
    ...statements.map((s) => ({ id: s.id, cat: 'financial_statement', name: `${s.document_name} (${tr('FY', 'س.م')} ${s.financial_year}, ${fmtDate(s.statement_end_date)})` })),
    ...docs.map((d) => ({ id: d.id, cat: d.category, name: d.description || d.filename })),
    ...subs.filter((s) => s.supporting_document).map((s) => ({ id: s.id, cat: 'subsidiary', name: s.subsidiary_name })),
  ];
  const submitted = !['draft'].includes(app.status);

  const downloadPdf = async () => {
    setDlError('');
    setDownloading(true);
    try { await downloadAuthed(`/api/applications/${id}/confirmation.pdf?download=1`, `${ref}-confirmation.pdf`); } catch (e) { setDlError(errMsg(e)); } finally { setDownloading(false); }
  };

  const Row = ({ label, children }) => (
    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children || '—'}</dd>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="application-confirmation">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm" className="gap-1.5"><Link to={`/applications/${id}`}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr('Back to application', 'العودة إلى الطلب')}</Link></Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()} data-testid="confirmation-print"><Printer className="h-4 w-4" /> {tr('Print', 'طباعة')}</Button>
          <Button size="sm" className="gap-1.5" onClick={downloadPdf} disabled={downloading} data-testid="confirmation-pdf">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {tr('Download PDF', 'تحميل PDF')}
          </Button>
        </div>
      </div>
      {dlError && <Notice tone="error">{dlError}</Notice>}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm print:border-0 print:shadow-none">
        <div className="flex flex-col items-center gap-2 text-center">
          {submitted && <CheckCircle2 className="h-12 w-12 text-success print:hidden" />}
          <h1 className="text-xl font-bold">{submitted ? tr('Application submitted successfully', 'تم تقديم الطلب بنجاح') : tr('Application draft', 'مسودة الطلب')}</h1>
          <p className="text-sm text-muted-foreground">{tr('Contribution application — submission confirmation', 'طلب مساهمة — تأكيد التقديم')}</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-wide" data-testid="confirmation-reference">{ref}</p>
          <StatusBadge value={app.status} />
        </div>

        <h2 className="mt-6 border-b border-border pb-1 text-sm font-bold uppercase tracking-wide text-primary">{tr('Application', 'الطلب')}</h2>
        <dl className="divide-y divide-border">
          <Row label={tr('Reference', 'المرجع')}>{ref}</Row>
          <Row label={tr('Financial year', 'السنة المالية')}>{app.financial_year}</Row>
          <Row label={tr('Submitted on', 'تاريخ التقديم')}>{fmtDateTime(app.submitted_date)}</Row>
          <Row label={tr('Created on', 'تاريخ الإنشاء')}>{fmtDateTime(app.created_date)}</Row>
          <Row label={tr('Payment method(s)', 'طريقة/طرق الدفع')}>{methods.map(pm).join(tr(', ', '، '))}</Row>
          <Row label={tr('Self-calculated amount', 'المبلغ المحتسب ذاتياً')}>{app.declared_amount ? fmtMoney(app.declared_amount) : null}</Row>
          <Row label={tr('Contribution due', 'المساهمة المستحقة')}>{app.contribution_due != null ? fmtMoney(app.contribution_due) : tr('To be calculated by the Contributions Unit', 'سيتم احتسابها من وحدة المساهمات')}</Row>
        </dl>

        <h2 className="mt-6 border-b border-border pb-1 text-sm font-bold uppercase tracking-wide text-primary">{tr('Company', 'الشركة')}</h2>
        <dl className="divide-y divide-border">
          <Row label={tr('Name (Arabic)', 'الاسم (عربي)')}><span dir="rtl">{company?.company_name_ar}</span></Row>
          <Row label={tr('Name (English)', 'الاسم (إنجليزي)')}>{company?.company_name_en || app.company_name}</Row>
          <Row label={tr('CR number', 'رقم السجل التجاري')}>{company?.commercial_registration_number}</Row>
          <Row label={tr('COFS file no.', 'رقم ملف COFS')}>{company?.cofs_file_number}</Row>
          <Row label={tr('Official email', 'البريد الرسمي')}>{company?.official_email}</Row>
        </dl>

        <h2 className="mt-6 border-b border-border pb-1 text-sm font-bold uppercase tracking-wide text-primary">{tr('Uploaded documents', 'المستندات المرفوعة')}</h2>
        {documents.length === 0 ? <p className="py-2 text-sm text-muted-foreground">—</p> : (
          <ol className="ms-5 list-decimal space-y-1 py-2 text-sm" data-testid="confirmation-documents">
            {documents.map((d) => <li key={`${d.cat}-${d.id}`}><span className="text-muted-foreground">{tr(...(DOC_CATEGORIES[d.cat] || DOC_CATEGORIES.other))}:</span> {d.name}</li>)}
          </ol>
        )}
        <p className="mt-6 text-xs text-muted-foreground">{tr('Keep this reference for any correspondence with the Contributions Unit.', 'احتفظ بهذا المرجع لأي مراسلات مع وحدة المساهمات.')} · {fmtDateTime(new Date().toISOString())}</p>
      </div>
    </div>
  );
}
