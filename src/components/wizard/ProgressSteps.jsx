import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProgressSteps({ steps, current, onGo }) {
  return (
    <ol className="flex items-start gap-1 overflow-x-auto scrollbar-thin pb-1">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : done ? 'bg-success' : 'bg-border')} />
              <button
                type="button"
                disabled={!done}
                onClick={() => done && onGo && onGo(i)}
                className={cn(
                  'mx-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                  done && 'border-success bg-success text-white',
                  active && 'border-accent bg-accent/10 text-accent',
                  !done && !active && 'border-border bg-muted text-muted-foreground',
                  done && 'hover:opacity-80'
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </button>
              <span className={cn('h-0.5 flex-1', i === steps.length - 1 ? 'bg-transparent' : i < current ? 'bg-success' : 'bg-border')} />
            </div>
            <span className={cn('text-[11px] leading-tight sm:text-xs', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}