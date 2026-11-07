import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtMoney, errMsg, STATUS_LABELS } from '@/lib/tr';
import { PROFILE_GROUPS, COMPANY_STATUSES } from '@/components/company/profileFields';
import StatusBadge from '@/components/review/StatusBadge';
import FileUpload from '@/components/common/FileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock, Pencil, Save, X, Loader2, Download } from 'lucide-react';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function ProfileTab({ company, internal, readOnly, onSaved }) {
  const tr = useTr();
  const { language } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [lookups, setLookups] = useState({});

  const locked = company.profile_locked && !internal;
  const fields = useMemo(() => PROFILE_GROUPS.flatMap((g) => g.fields), []);
  const editable = (f) => internal || !f[4]?.internalOnly;

  useEffect(() => {
    base44.entities.LookupValue.filter({ is_active: true }, { sort: 'sort_order', limit: 500 })
      .then((r) => {
        const by = {};
        (r.items || []).forEach((l) => { (by[l.category] = by[l.category] || []).push(l); });
        setLookups(by);
      }).catch(() => {});
  }, []);

  const start = () => {
    const f = {};
    fields.forEach(([k]) => { f[k] = company[k] ?? (k === 'is_wll' ? false : ''); });
    setForm(f);
    setErrors({});
    setReason('');
    setMsg(null);
    setEditing(true);
  };

  const dirtyKeys = fields.filter((f) => editable(f)).map(([k]) => k)
    .filter((k) => String(form[k] ?? '') !== String(company[k] ?? (k === 'is_wll' ? false : '')));

  useEffect(() => {
    if (!editing || dirtyKeys.length === 0) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [editing, dirtyKeys.length]);

  const cancel = () => {
    if (dirtyKeys.length && !window.confirm(tr('You have unsaved changes. Discard them?', 'لديك تغييرات غير محفوظة. هل تريد تجاهلها؟'))) return;
    setEditing(false);
  };

  const save = async () => {
    const e = {};
    fields.forEach(([k, , , type, opts]) => {
      if (!dirtyKeys.includes(k)) return;
      const v = form[k];
      if (opts?.required && !String(v || '').trim()) e[k] = tr('This field is required.', 'هذا الحقل مطلوب.');
      if (type === 'email' && v && !EMAIL_RE.test(v)) e[k] = tr('Enter a valid email address.', 'أدخل بريداً إلكترونياً صحيحاً.');
      if ((type === 'money' || type === 'number') && v !== '' && Number.isNaN(Number(v))) e[k] = tr('Enter a valid number.', 'أدخل رقماً صحيحاً.');
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!dirtyKeys.length) { setEditing(false); return; }
    const changes = {};
    dirtyKeys.forEach((k) => {
      const type = fields.find((f) => f[0] === k)[3];
      changes[k] = type === 'money' ? (form[k] === '' ? null : Number(form[k])) : form[k];
    });
    setSaving(true);
    try {
      await base44.functions.invoke('applyProfileChanges', { company_id: company.id, changes, reason });
      setEditing(false);
      setMsg({ kind: 'success', text: tr('Profile updated. Changes were recorded in the change history.', 'تم تحديث الملف وتسجيل التغييرات في سجل التعديلات.') });
      onSaved?.();
    } catch (err) {
      setMsg({ kind: 'error', text: errMsg(err) });
    } finally {
      setSaving(false);
    }
  };

  const lookupLabel = (category, value) => {
    const l = (lookups[category] || []).find((x) => x.value_en === value);
    return l && language === 'ar' ? l.value_ar || value : value;
  };

  const display = ([k, , , type = 'text']) => {
    const v = company[k];
    if (type === 'bool') return v ? tr('Yes', 'نعم') : tr('No', 'لا');
    if (v === undefined || v === null || v === '') return '—';
    if (type === 'money') return fmtMoney(v);
    if (type === 'status') return <StatusBadge value={v} />;
    if (type === 'file') return (
      <a href={`${v}?download=1`} className="inline-flex items-center gap-1 text-accent hover:underline"><Download className="h-3.5 w-3.5" /> {tr('Download', 'تنزيل')}</a>
    );
    if (type.startsWith('lookup:')) return lookupLabel(type.slice(7), v);
    return String(v);
  };

  const input = ([k, en, ar, type = 'text', opts = {}]) => {
    const id = `cp-${k}`;
    const set = (v) => setForm((f) => ({ ...f, [k]: v }));
    if (!editable([k, en, ar, type, opts])) return <div className="pt-2 text-sm text-muted-foreground">{display([k, en, ar, type])}</div>;
    if (type === 'bool') return <Checkbox id={id} checked={!!form[k]} onCheckedChange={(v) => set(!!v)} />;
    if (type === 'file') return <FileUpload value={form[k]} valueName={tr('Current file', 'الملف الحالي')} companyId={company.id} onUploaded={(f) => set(f.file_url)} onClear={() => set('')} />;
    if (type === 'status') return (
      <select id={id} className={selectCls} value={form[k] || ''} onChange={(e) => set(e.target.value)}>
        {COMPANY_STATUSES.map((s) => <option key={s} value={s}>{tr(...(STATUS_LABELS[s] || [s, s]))}</option>)}
      </select>
    );
    if (type.startsWith('lookup:') && lookups[type.slice(7)]?.length) {
      const opts2 = lookups[type.slice(7)];
      return (
        <select id={id} className={selectCls} value={form[k] || ''} onChange={(e) => set(e.target.value)}>
          <option value="">{tr('Select…', 'اختر…')}</option>
          {form[k] && !opts2.some((o) => o.value_en === form[k]) && <option value={form[k]}>{form[k]}</option>}
          {opts2.map((o) => <option key={o.id} value={o.value_en}>{language === 'ar' ? o.value_ar || o.value_en : o.value_en}</option>)}
        </select>
      );
    }
    return (
      <Input id={id} data-testid={id} dir={opts.dir} type={type === 'money' || type === 'number' ? 'number' : type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text'}
        value={form[k] ?? ''} onChange={(e) => set(e.target.value)} aria-invalid={!!errors[k]} className={errors[k] ? 'border-destructive' : ''} />
    );
  };

  return (
    <div className="space-y-4">
      {company.profile_locked && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm" data-testid="profile-locked">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            {internal
              ? tr('This profile is locked for the company while an application is in progress. Internal users can still update it.', 'الملف مقفل للشركة أثناء معالجة طلب. يمكن للمستخدمين الداخليين تحديثه.')
              : tr('Your profile is locked while an application is in progress. To change a field, use "Request change" in the application profile step, or contact the Contributions Unit.', 'ملف شركتكم مقفل أثناء معالجة الطلب. لتعديل حقل استخدم "طلب تعديل" في خطوة الملف ضمن الطلب أو تواصل مع وحدة المساهمات.')}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!editing && !locked && !readOnly && (
          <Button variant="outline" size="sm" onClick={start} className="gap-1.5" data-testid="profile-edit"><Pencil className="h-4 w-4" /> {tr('Edit profile', 'تعديل الملف')}</Button>
        )}
        {editing && (
          <>
            <Button variant="ghost" size="sm" onClick={cancel} className="gap-1.5"><X className="h-4 w-4" /> {tr('Cancel', 'إلغاء')}</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5" data-testid="profile-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {tr('Save changes', 'حفظ التغييرات')}
            </Button>
          </>
        )}
      </div>

      {msg && <div role="status" data-testid="profile-msg" className={`rounded-lg p-3 text-sm ${msg.kind === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{msg.text}</div>}

      {editing && (
        <div className="space-y-1.5 rounded-xl border border-border bg-card p-4">
          <Label htmlFor="cp-reason">{tr('Reason for change (recorded in history)', 'سبب التعديل (يسجل في السجل)')}</Label>
          <Input id="cp-reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="profile-reason" />
        </div>
      )}

      {PROFILE_GROUPS.map((g) => (
        <section key={g.key} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-primary">{tr(g.en, g.ar)}</h3>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f[0]} className="space-y-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <label htmlFor={`cp-${f[0]}`}>{tr(f[1], f[2])}{editing && f[4]?.required && <span className="text-destructive"> *</span>}</label>
                </dt>
                <dd className="text-sm break-words" dir={!editing && f[4]?.dir ? f[4].dir : undefined}>{editing ? input(f) : display(f)}</dd>
                {editing && errors[f[0]] && <p className="text-xs text-destructive">{errors[f[0]]}</p>}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
