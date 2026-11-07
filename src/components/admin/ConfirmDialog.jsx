import React, { useState } from 'react';
import { useTr } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

/** Controlled confirmation dialog. `target` truthy = open; onConfirm may be async. */
export default function ConfirmDialog({ target, onClose, onConfirm, title, message, confirmLabel, destructive = true }) {
  const tr = useTr();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(target); onClose(); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title || tr('Are you sure?', 'هل أنت متأكد؟')}</DialogTitle></DialogHeader>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={go} data-testid="confirm-ok">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel || tr('Delete', 'حذف')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
