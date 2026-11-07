import React from 'react';
import { Link } from 'react-router-dom';
import { useTr } from '@/lib/tr';

/** Page title with breadcrumb trail: crumbs = [{label, to}] (last item is current page). */
export default function PageHeader({ title, subtitle, crumbs = [], actions }) {
  const tr = useTr();
  return (
    <div className="space-y-2">
      {crumbs.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground hover:underline">{tr('Home', 'الرئيسية')}</Link>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span>/</span>
              {c.to && i < crumbs.length - 1 ? <Link to={c.to} className="hover:text-foreground hover:underline">{c.label}</Link> : <span className="font-medium text-foreground">{c.label}</span>}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
