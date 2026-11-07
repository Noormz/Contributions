import React from 'react';
import { cn } from '@/lib/utils';
import { useTr, STATUS_LABELS } from '@/lib/tr';

const tones = {
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-warning/10 text-warning',
  submitted: 'bg-accent/10 text-accent',
  assigned: 'bg-accent/10 text-accent',
  under_review: 'bg-warning/10 text-warning',
  calculation_review: 'bg-warning/10 text-warning',
  pending_manager_approval: 'bg-warning/10 text-warning',
  pending_approval: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  accounts_processing: 'bg-accent/10 text-accent',
  completed: 'bg-success/10 text-success',
  returned: 'bg-destructive/10 text-destructive',
  active: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  suspended: 'bg-destructive/10 text-destructive',
  verified: 'bg-success/10 text-success',
  in_review: 'bg-warning/10 text-warning',
  open: 'bg-accent/10 text-accent',
  awaiting_company: 'bg-warning/10 text-warning',
  replied: 'bg-success/10 text-success',
  unmatched: 'bg-destructive/10 text-destructive',
  responded: 'bg-success/10 text-success',
  closed: 'bg-muted text-muted-foreground',
  issued: 'bg-success/10 text-success',
  initiated: 'bg-warning/10 text-warning',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function StatusBadge({ value }) {
  const tr = useTr();
  if (!value) return <span className="text-muted-foreground">—</span>;
  const label = STATUS_LABELS[value] ? tr(...STATUS_LABELS[value]) : String(value).replace(/_/g, ' ');
  return (
    <span data-status={value} className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize whitespace-nowrap', tones[value] || 'bg-muted text-muted-foreground')}>
      {label}
    </span>
  );
}
