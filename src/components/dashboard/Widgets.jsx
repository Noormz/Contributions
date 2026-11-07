import React from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '@/components/review/StatusBadge';
import { useTr, fmtDate } from '@/lib/tr';

export function Panel({ title, action, children, testId }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm" data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 font-semibold break-words">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AppList({ apps, empty, showCompany = true }) {
  const tr = useTr();
  if (!apps.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty || tr('Nothing here', 'لا يوجد شيء')}</p>;
  return (
    <ul className="divide-y divide-border">
      {apps.map((a) => (
        <li key={a.id}>
          <Link to={`/applications/${a.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 hover:opacity-80">
            <div className="min-w-[9rem] flex-1">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">{a.application_reference || tr('Draft', 'مسودة')}{showCompany && a.company_name ? ` · ${a.company_name}` : ''}</p>
              <p className="text-xs text-muted-foreground">{tr('FY', 'السنة')} {a.financial_year || '—'} · {fmtDate(a.submitted_date || a.created_date)}</p>
            </div>
            <StatusBadge value={a.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
