import React from 'react';
import { useTr } from '@/lib/tr';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { PROFILE_FIELDS, Notice } from '@/components/application/shared';
import { Lock, Building2 } from 'lucide-react';

// FR-06: profile fields are locked; a representative toggles "Request change" per field.
export default function StepProfile({ data, update, company }) {
  const tr = useTr();
  const changes = data.profile_changes || {};

  const toggle = (key, on) => {
    const next = { ...changes };
    if (on) next[key] = company[key] ?? '';
    else delete next[key];
    update({ profile_changes: next });
  };
  const setVal = (key, v) => update({ profile_changes: { ...changes, [key]: v } });
  const display = (key, type) => {
    const v = company[key];
    if (type === 'bool') return v ? tr('Yes', 'نعم') : tr('No', 'لا');
    return v === undefined || v === null || v === '' ? '—' : String(v);
  };

  return (
    <div className="space-y-4" data-testid="step-profile">
      <p className="text-sm text-muted-foreground">
        {tr('Your company profile is locked. Turn on "Request change" only for fields that need updating; changes are applied and recorded when you submit.', 'ملف شركتك مقفل. فعّل "طلب تعديل" فقط للحقول التي تحتاج تحديثاً، وسيتم تطبيق التعديلات وتسجيلها عند الإرسال.')}
      </p>
      <div className="rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-sm">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-semibold">{company.company_name_ar || company.company_name_en}</span>
          <span className="text-muted-foreground">· {tr('CR', 'س.ت')} {company.commercial_registration_number} · {tr('COFS', 'ملف COFS')} {company.cofs_file_number || '—'}</span>
        </div>
        <ul className="divide-y divide-border">
          {PROFILE_FIELDS.map(([key, en, ar, type]) => {
            const editing = key in changes;
            return (
              <li key={key} className="grid grid-cols-1 items-center gap-2 px-4 py-2.5 sm:grid-cols-[220px_1fr_auto]">
                <span className="text-xs font-medium text-muted-foreground">{tr(en, ar)}</span>
                {editing ? (
                  type === 'bool' ? (
                    <div className="flex items-center gap-2">
                      <Switch checked={!!changes[key]} onCheckedChange={(v) => setVal(key, v)} />
                      <span className="text-sm">{changes[key] ? tr('Yes', 'نعم') : tr('No', 'لا')}</span>
                    </div>
                  ) : (
                    <Input
                      data-testid={`profile-input-${key}`}
                      type={type === 'number' ? 'number' : 'text'}
                      dir={key.endsWith('_ar') ? 'rtl' : undefined}
                      value={changes[key] ?? ''}
                      onChange={(e) => setVal(key, type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                    />
                  )
                ) : (
                  <span className="flex items-center gap-1.5 text-sm"><Lock className="h-3 w-3 text-muted-foreground" />{display(key, type)}</span>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={editing} onCheckedChange={(v) => toggle(key, v)} data-testid={`profile-toggle-${key}`} />
                  {tr('Request change', 'طلب تعديل')}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      {Object.keys(changes).length > 0 && (
        <Notice tone="info">{tr(`${Object.keys(changes).length} field(s) will be updated on submission.`, `سيتم تحديث ${Object.keys(changes).length} حقل/حقول عند الإرسال.`)}</Notice>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <Checkbox checked={!!data.profile_confirmed} onCheckedChange={(v) => update({ profile_confirmed: !!v })} data-testid="profile-confirm" />
        <span className="text-sm">{tr('I declare that the company profile above (including any requested changes) is accurate and up to date.', 'أقر بأن ملف الشركة أعلاه (بما في ذلك التعديلات المطلوبة) دقيق ومحدث.')} <span className="text-destructive">*</span></span>
      </label>
    </div>
  );
}
