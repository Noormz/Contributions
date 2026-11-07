import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { getRecordConfig } from '@/lib/recordConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export default function CreateRecordDialog({ entityName, open, onOpenChange, onSaved }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const cfg = getRecordConfig(entityName);
  const [form, setForm] = useState({});
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && cfg?.companyField) {
      base44.entities.Company.filter({}, { sort: '-created_date', limit: 100 })
        .then((r) => setCompanies(r.items || []))
        .catch(() => setCompanies([]));
    }
  }, [open, cfg?.companyField]);

  useEffect(() => {
    if (open) { setForm({}); setCompanyId(''); setError(''); }
  }, [open]);

  if (!cfg || !cfg.canCreate?.(user)) return null;
  const fields = cfg.fields.filter((f) => cfg.createFields.includes(f.key));

  const save = async () => {
    if (cfg.companyField && !companyId && user?.role !== 'company_representative') { setError(t('rec_select_company')); return; }
    setSaving(true);
    setError('');
    try {
      const rec = {};
      fields.forEach((f) => {
        const v = form[f.key];
        if (v !== '' && v !== undefined && v !== null) {
          rec[f.key] = f.type === 'money' || f.type === 'date' ? (f.type === 'money' ? Number(v) : v) : v;
        }
      });
      if (cfg.companyField && user?.role === 'company_representative') {
        rec[cfg.companyField] = user.company_id;
      } else if (cfg.companyField) {
        const comp = companies.find((c) => c.id === companyId);
        rec[cfg.companyField] = companyId;
        rec.company_name = comp?.company_name_en || '';
      }
      await base44.entities[entityName].create(rec);
      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.message || t('rec_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('rec_new')} — {t(cfg.titleKey)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {cfg.companyField && user?.role !== 'company_representative' && (
            <div className="space-y-1.5">
              <Label>{t('rec_select_company')} *</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder={t('rec_select_company')} /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name_en || c.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                <Label>{language === 'ar' ? f.ar : f.en}</Label>
                {f.type === 'textarea' ? (
                  <Textarea rows={3} value={form[f.key] ?? ''} onChange={setField(f.key)} />
                ) : (
                  <Input
                    type={f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={setField(f.key)}
                  />
                )}
              </div>
            ))}
          </div>
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button disabled={saving} onClick={save} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('rec_create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}