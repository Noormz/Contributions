import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44, downloadAuthed } from '@/api/base44Client';
import { useTr, errMsg, fmtMoney } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Notice } from '@/components/application/shared';
import {
  Pencil, FileCheck2, CreditCard, UserCheck, Shuffle, PlayCircle, Calculator, Undo2, AlertTriangle, CheckCircle2,
  ArchiveRestore, FileDown, Loader2, CheckCheck,
} from 'lucide-react';

const OFFICERISH = ['contributions_officer', 'contributions_manager', 'system_admin'];
const MANAGERISH = ['contributions_manager', 'system_admin'];

function CommentDialog({ open, onOpenChange, title, description, required, confirmLabel, destructive, onConfirm, testId }) {
  const tr = useTr();
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setComments(''); setError(''); } }, [open]);
  const go = async () => {
    if (required && !comments.trim()) { setError(tr('Comments are required.', 'الملاحظات مطلوبة.')); return; }
    setBusy(true);
    setError('');
    try { await onConfirm(comments); onOpenChange(false); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{tr('Comments', 'الملاحظات')}{required && ' *'}</Label>
          <Textarea rows={4} value={comments} onChange={(e) => setComments(e.target.value)} data-testid={`${testId}-comments`} />
        </div>
        {error && <Notice tone="error" testId={`${testId}-error`}>{error}</Notice>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={go} disabled={busy} data-testid={`${testId}-confirm`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ApplicationActions({ app, user, hasCalculation, onChanged }) {
  const tr = useTr();
  const navigate = useNavigate();
  const role = user?.role;
  const isRep = role === 'company_representative';
  const internal = !isRep;
  const [dialog, setDialog] = useState(null);
  const [officers, setOfficers] = useState([]);
  const [assign, setAssign] = useState({ officer_id: '', reason: '', notes: '' });
  const [pay, setPay] = useState({ amount: '', remaining: null });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const canAssign = MANAGERISH.includes(role) && !['draft', 'completed'].includes(app.status);

  useEffect(() => {
    if (canAssign) base44.functions.invoke('listOfficers').then((r) => setOfficers(Array.isArray(r) ? r : [])).catch(() => {});
  }, [canAssign]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    setError('');
    setFlash('');
    try {
      await fn();
      if (okMsg) setFlash(okMsg);
      await onChanged?.();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  // Used by dialogs: errors propagate so the dialog stays open and shows them.
  const done = async (fn, okMsg) => {
    setError('');
    await fn();
    setFlash(okMsg);
    await onChanged?.();
  };
  const action = (name, comments = '') => base44.functions.invoke('applicationAction', { application_id: app.id, action: name, comments });

  const openPay = async () => {
    setError('');
    try {
      const { remaining } = await base44.functions.invoke('payableAmount', { application_id: app.id });
      setPay({ amount: remaining ? String(remaining) : '', remaining });
      setDialog('pay');
    } catch (e) { setError(errMsg(e)); }
  };
  const startPay = () => run('pay', async () => {
    if (!(Number(pay.amount) > 0)) throw new Error(tr('Enter an amount greater than zero.', 'أدخل مبلغاً أكبر من صفر.'));
    const r = await base44.functions.invoke('startGatewayPayment', { application_id: app.id, amount: Number(pay.amount) });
    navigate(r.checkout_url);
  });

  const doAssign = () => run('assign', async () => {
    if (!assign.officer_id) throw new Error(tr('Select an officer.', 'اختر الموظف.'));
    await base44.functions.invoke('assignApplication', { application_id: app.id, ...assign });
    setDialog(null);
    setAssign({ officer_id: '', reason: '', notes: '' });
  }, tr('Application assigned.', 'تم إسناد الطلب.'));

  const ref = app.application_reference || 'application';
  const buttons = [];
  const B = (key, icon, label, onClick, opts = {}) => buttons.push(
    <Button key={key} size="sm" variant={opts.variant || 'outline'} className={`gap-1.5 ${opts.className || ''}`} onClick={onClick} disabled={!!busy} data-testid={`action-${key}`}>
      {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : React.createElement(icon, { className: 'h-4 w-4' })} {label}
    </Button>,
  );
  const L = (key, icon, label, to, variant = 'outline') => buttons.push(
    <Button key={key} size="sm" variant={variant} asChild className="gap-1.5" data-testid={`action-${key}`}>
      <Link to={to}>{React.createElement(icon, { className: 'h-4 w-4' })} {label}</Link>
    </Button>,
  );

  if (isRep) {
    if (['draft', 'returned'].includes(app.status)) L('edit', Pencil, app.status === 'returned' ? tr('Update & resubmit', 'تحديث وإعادة التقديم') : tr('Continue editing', 'متابعة التعديل'), `/applications/${app.id}/edit`, 'default');
    if (app.status !== 'draft') L('confirmation', FileCheck2, tr('Confirmation', 'تأكيد التقديم'), `/applications/${app.id}/confirmation`);
    if (app.status === 'accounts_processing' && Number(app.contribution_due) > 0) B('pay', CreditCard, tr('Pay online', 'الدفع الإلكتروني'), openPay, { variant: 'default' });
  } else {
    if (OFFICERISH.includes(role) && ['submitted', 'assigned'].includes(app.status)) B('start-review', PlayCircle, tr('Start review', 'بدء المراجعة'), () => run('start-review', () => action('start_review'), tr('Review started.', 'بدأت المراجعة.')), { variant: 'default' });
    if (OFFICERISH.includes(role) && ['under_review', 'calculation_review', 'pending_manager_approval', 'approved', 'accounts_processing', 'completed'].includes(app.status)) L('calculation', Calculator, tr('Calculation workspace', 'مساحة عمل الحساب'), `/calculation-review/${app.id}`, app.status === 'under_review' ? 'default' : 'outline');
    if (MANAGERISH.includes(role) && app.status === 'pending_manager_approval') {
      B('approve', CheckCircle2, tr('Approve', 'اعتماد'), () => setDialog('approve'), { variant: 'default' });
      B('return-officer', Undo2, tr('Return to officer', 'إعادة للموظف'), () => setDialog('return_officer'));
    }
    if (['accounts_unit', ...MANAGERISH].includes(role) && app.status === 'accounts_processing') B('complete', CheckCheck, tr('Mark completed', 'تحديد كمكتمل'), () => setDialog('complete'), { variant: 'default' });
    if (canAssign) {
      B('assign', UserCheck, app.assigned_officer_id ? tr('Reassign', 'إعادة الإسناد') : tr('Assign', 'إسناد'), () => { setAssign({ officer_id: '', reason: '', notes: '' }); setDialog('assign'); });
      if (!app.assigned_officer_id) B('auto-assign', Shuffle, tr('Auto-assign', 'إسناد تلقائي'), () => run('auto-assign', () => base44.functions.invoke('autoAssign', { application_id: app.id }), tr('Application auto-assigned.', 'تم الإسناد التلقائي.')));
    }
    if (OFFICERISH.includes(role) && ['submitted', 'assigned', 'under_review', 'calculation_review'].includes(app.status)) B('return-company', Undo2, tr('Return to company', 'إعادة للشركة'), () => setDialog('return_company'), { className: 'text-destructive' });
    if (OFFICERISH.includes(role) && !['draft', 'completed'].includes(app.status)) B('escalate', AlertTriangle, tr('Escalate', 'تصعيد'), () => setDialog('escalate'));
    if (hasCalculation) B('calc-pdf', FileDown, tr('Calculation sheet', 'ورقة الحساب'), () => run('calc-pdf', () => downloadAuthed(`/api/applications/${app.id}/calculation.pdf`, `${ref}-calculation.pdf`)));
    if (app.status === 'completed') B('archive', ArchiveRestore, tr('Download archive (ZIP)', 'تحميل الأرشيف (ZIP)'), () => run('archive', () => downloadAuthed(`/api/applications/${app.id}/archive.zip`, `${ref}-archive.zip`)));
    if (app.status !== 'draft') L('confirmation', FileCheck2, tr('Confirmation', 'تأكيد التقديم'), `/applications/${app.id}/confirmation`);
  }

  return (
    <div className="space-y-2 print:hidden">
      {buttons.length > 0 && <div className="flex flex-wrap gap-2" data-testid="application-actions">{buttons}</div>}
      {error && <Notice tone="error" testId="action-error">{error}</Notice>}
      {flash && <Notice tone="success" testId="action-success">{flash}</Notice>}

      <CommentDialog open={dialog === 'return_company'} onOpenChange={(o) => !o && setDialog(null)} testId="return-company" destructive required
        title={tr('Return application to company', 'إعادة الطلب إلى الشركة')}
        description={tr('The company will be notified and can update and resubmit the application.', 'سيتم إشعار الشركة ويمكنها تحديث الطلب وإعادة تقديمه.')}
        confirmLabel={tr('Return application', 'إعادة الطلب')}
        onConfirm={(c) => done(() => action('return_to_company', c), tr('Application returned to the company.', 'تمت إعادة الطلب إلى الشركة.'))} />
      <CommentDialog open={dialog === 'escalate'} onOpenChange={(o) => !o && setDialog(null)} testId="escalate" required
        title={tr('Escalate to manager', 'التصعيد إلى المدير')} confirmLabel={tr('Escalate', 'تصعيد')}
        onConfirm={(c) => done(() => action('escalate', c), tr('Escalation sent to the managers.', 'تم إرسال التصعيد إلى المدراء.'))} />
      <CommentDialog open={dialog === 'approve'} onOpenChange={(o) => !o && setDialog(null)} testId="approve"
        title={tr('Approve calculation', 'اعتماد الحساب')} description={tr('The application will be forwarded to the Accounts Unit.', 'سيتم تحويل الطلب إلى وحدة الحسابات.')}
        confirmLabel={tr('Approve', 'اعتماد')}
        onConfirm={(c) => done(() => action('approve', c), tr('Calculation approved and forwarded to Accounts.', 'تم الاعتماد والتحويل إلى الحسابات.'))} />
      <CommentDialog open={dialog === 'return_officer'} onOpenChange={(o) => !o && setDialog(null)} testId="return-officer" required destructive
        title={tr('Return calculation to officer', 'إعادة الحساب إلى الموظف')} confirmLabel={tr('Return for correction', 'إعادة للتصحيح')}
        onConfirm={(c) => done(() => action('return_to_officer', c), tr('Calculation returned to the officer.', 'تمت إعادة الحساب للموظف.'))} />
      <CommentDialog open={dialog === 'complete'} onOpenChange={(o) => !o && setDialog(null)} testId="complete"
        title={tr('Mark application completed', 'تحديد الطلب كمكتمل')} description={tr('Requires an issued receipt voucher and no outstanding balance.', 'يتطلب سند قبض صادر وعدم وجود رصيد مستحق.')}
        confirmLabel={tr('Mark completed', 'تحديد كمكتمل')}
        onConfirm={(c) => done(() => action('complete', c), tr('Application completed.', 'اكتمل الطلب.'))} />

      <Dialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{app.assigned_officer_id ? tr('Reassign application', 'إعادة إسناد الطلب') : tr('Assign application', 'إسناد الطلب')}</DialogTitle>
            {app.assigned_officer_name && <DialogDescription>{tr('Currently assigned to', 'مسند حالياً إلى')} {app.assigned_officer_name}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{tr('Officer', 'الموظف')} *</Label>
              <Select value={assign.officer_id} onValueChange={(v) => setAssign({ ...assign, officer_id: v })}>
                <SelectTrigger data-testid="assign-officer"><SelectValue placeholder={tr('Select officer', 'اختر الموظف')} /></SelectTrigger>
                <SelectContent>{officers.filter((o) => o.id !== app.assigned_officer_id).map((o) => <SelectItem key={o.id} value={o.id}>{o.full_name || o.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{tr('Reason', 'السبب')}</Label><Input value={assign.reason} onChange={(e) => setAssign({ ...assign, reason: e.target.value })} data-testid="assign-reason" /></div>
            <div className="space-y-1.5"><Label>{tr('Notes', 'ملاحظات')}</Label><Textarea rows={3} value={assign.notes} onChange={(e) => setAssign({ ...assign, notes: e.target.value })} /></div>
            {error && <Notice tone="error">{error}</Notice>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={doAssign} disabled={busy === 'assign'} data-testid="assign-confirm">{busy === 'assign' ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Assign', 'إسناد')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'pay'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('Pay online', 'الدفع الإلكتروني')}</DialogTitle>
            <DialogDescription>{tr('Contribution due', 'المساهمة المستحقة')}: {fmtMoney(app.contribution_due)} · {tr('Remaining', 'المتبقي')}: {fmtMoney(pay.remaining)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{tr('Amount to pay (KWD)', 'المبلغ المراد دفعه (د.ك)')}</Label>
            <Input type="number" min="0" step="0.001" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} data-testid="pay-amount" />
            <p className="text-xs text-muted-foreground">{tr('Partial payments are accepted.', 'تقبل الدفعات الجزئية.')}</p>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={startPay} disabled={busy === 'pay'} data-testid="pay-confirm">{busy === 'pay' ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Continue to payment', 'متابعة إلى الدفع')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
