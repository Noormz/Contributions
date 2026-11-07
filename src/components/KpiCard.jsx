import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function KpiCard({ icon: Icon, label, value, tone = 'primary', loading, sub, to, testId }) {
  const toneClasses = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-destructive/10 text-destructive',
  };
  const card = (
    <div className={cn('h-full rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow', to && 'hover:shadow-md hover:border-accent/40')} data-testid={testId}>
      {/* wrap-reverse: when the card is too narrow for label + icon side by side, the icon moves above the label instead of squeezing it */}
      <div className="flex flex-wrap-reverse items-end justify-between gap-3">
        <div className="min-w-[7rem] flex-1">
          <p className="text-sm font-medium leading-snug text-muted-foreground break-words">{label}</p>
          <p className={cn('mt-2 font-bold tracking-tight tabular-nums break-words', String(value ?? '').length > 9 ? 'text-xl' : 'text-2xl')}>
            {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" /> : value}
          </p>
          {sub && <p className="mt-1 text-xs text-muted-foreground break-words">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</Link> : card;
}
