import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { RestrictedNotice } from '@/components/admin/LookupsPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

// Friendly bilingual labels for well-known currency setting keys
const currencyLabels = {
  default_currency: { en: 'Default Currency', ar: 'العملة الافتراضية' },
  enabled_currencies: { en: 'Enabled Currencies', ar: 'العملات المفعّلة' },
  currency_symbol_position: { en: 'Currency Symbol Position', ar: 'موضع رمز العملة' },
  amount_decimals: { en: 'Amount Decimals', ar: 'عدد الخانات العشرية' },
  exchange_rate_usd: { en: 'Exchange Rate (1 KWD in USD)', ar: 'سعر الصرف (دينار كويتي بالدولار)' },
};

export default function SettingsPanel({ group, fixedKeys = [], allowAdd = true, allowDelete = true }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'system_admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ setting_key: '', setting_value: '', description: '', description_ar: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const page = await base44.entities.SystemSettings.filter({ setting_group: group }, { sort: 'setting_key', limit: 100 });
    setRows(page.items || []);
    setLoading(false);
  }, [group]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const labelFor = (r) => {
    const l = currencyLabels[r.setting_key];
    return l ? (language === 'ar' ? l.ar : l.en) : r.description || r.setting_key;
  };

  const updateValue = async (r, value) => {
    await base44.entities.SystemSettings.update(r.id, { setting_value: value });
    load();
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ setting_key: '', setting_value: '', description: '', description_ar: '' });
    setDialogOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      setting_key: r.setting_key, setting_value: r.setting_value,
      description: r.description || '', description_ar: r.description_ar || '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.setting_key.trim() || !form.setting_value.trim()) return;
    setSaving(true);
    try {
      const data = {
        setting_key: form.setting_key.trim(), setting_value: form.setting_value.trim(),
        setting_group: group, description: form.description.trim(), description_ar: form.description_ar.trim(),
      };
      if (editing) {
        await base44.entities.SystemSettings.update(editing.id, data);
      } else {
        await base44.entities.SystemSettings.create(data);
      }
      setDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const [pendingDelete, setPendingDelete] = useState(null);
  const remove = (r) => setPendingDelete(r);
  const doRemove = async (r) => {
    await base44.entities.SystemSettings.delete(r.id);
    load();
  };

  if (!isAdmin) return <RestrictedNotice />;

  const shown = fixedKeys.length ? rows.filter((r) => fixedKeys.includes(r.setting_key)) : rows;
  const missing = fixedKeys.filter((k) => !rows.some((r) => r.setting_key === k));

  return (
    <div className="space-y-4">
      {allowAdd && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-4 w-4" /> {t('admin_add_setting')}
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin_setting')}</TableHead>
                <TableHead>{t('admin_value')}</TableHead>
                <TableHead>{t('admin_key')}</TableHead>
                {allowDelete && <TableHead className="text-right">{t('actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id} data-testid="setting-row" data-key={r.setting_key}>
                  <TableCell className="font-medium">{labelFor(r)}</TableCell>
                  <TableCell>
                    <ValueEditor
                      value={r.setting_value}
                      onSave={(v) => updateValue(r, v)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.setting_key}</TableCell>
                  {allowDelete && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow><TableCell colSpan={4} className="p-10 text-center text-sm text-muted-foreground">{t('no_data')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('admin_edit_setting') : t('admin_add_setting')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('admin_key')} *</Label>
              <Input value={form.setting_key} disabled={!!editing} onChange={(e) => setForm({ ...form, setting_key: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin_value')} *</Label>
              <Input value={form.setting_value} onChange={(e) => setForm({ ...form, setting_value: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin_description')}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin_description_ar')}</Label>
              <Input dir="rtl" value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
            <Button disabled={saving} onClick={save} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog target={pendingDelete} onClose={() => setPendingDelete(null)} onConfirm={doRemove} message={pendingDelete ? `${t('delete')} — ${pendingDelete.setting_key}?` : ''} />
    </div>
  );
}

function ValueEditor({ value, onSave }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  if (!editing) {
    return (
      <button className="text-start" onClick={() => { setVal(value); setEditing(true); }} data-testid="setting-value">
        <span className="rounded border border-transparent bg-muted px-2 py-1 text-sm hover:border-border">{value}</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input className="h-8 w-40" data-testid="setting-value-input" value={val} autoFocus onChange={(e) => setVal(e.target.value)} />
      <Button size="sm" className="h-8" data-testid="setting-value-save" onClick={() => { setEditing(false); if (val !== value) onSave(val); }}>{t('save')}</Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>{t('cancel')}</Button>
    </div>
  );
}