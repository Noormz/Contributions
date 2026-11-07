import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { humanize } from '@/lib/recordConfig';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

const blank = { category: '', code: '', value_en: '', value_ar: '', sort_order: 0, is_active: true };

export default function LookupsPanel() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'system_admin';
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = category === 'all' ? {} : { category };
    const page = await base44.entities.LookupValue.filter(q, { sort: 'sort_order', limit: 200 });
    setRows(page.items || []);
    const cats = await base44.entities.LookupValue.list({ distinct: 'category' });
    setCategories((cats.items || []).filter(Boolean));
    setLoading(false);
  }, [category]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank, category: category === 'all' ? '' : category });
    setDialogOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      category: r.category || '', code: r.code || '', value_en: r.value_en || '',
      value_ar: r.value_ar || '', sort_order: r.sort_order ?? 0, is_active: r.is_active !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.category.trim() || !form.value_en.trim()) return;
    setSaving(true);
    try {
      const data = {
        category: form.category.trim(), code: form.code.trim(),
        value_en: form.value_en.trim(), value_ar: form.value_ar.trim(),
        sort_order: Number(form.sort_order) || 0, is_active: form.is_active,
      };
      if (editing) {
        await base44.entities.LookupValue.update(editing.id, data);
      } else {
        await base44.entities.LookupValue.create(data);
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
    await base44.entities.LookupValue.delete(r.id);
    load();
  };

  if (!isAdmin) return <RestrictedNotice />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin_all_categories')}</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{humanize(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="ms-auto gap-1.5" onClick={openAdd} data-testid="lookup-add">
          <Plus className="h-4 w-4" /> {t('admin_add_lookup')}
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t('no_data')}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin_category')}</TableHead>
                <TableHead>{t('admin_code')}</TableHead>
                <TableHead>{t('admin_value_en')}</TableHead>
                <TableHead>{t('admin_value_ar')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead className="text-right">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid="lookup-row">
                  <TableCell className="font-medium">{humanize(r.category)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.code || '-'}</TableCell>
                  <TableCell>{r.value_en}</TableCell>
                  <TableCell dir="rtl">{r.value_ar || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.is_active !== false ? 'border-transparent bg-success/10 text-success' : 'border-transparent bg-muted text-muted-foreground'}>
                      {r.is_active !== false ? t('admin_active') : t('admin_inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label={t('edit')} data-testid="lookup-edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r)} aria-label={t('delete')} data-testid="lookup-delete"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('admin_edit_lookup') : t('admin_add_lookup')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('admin_category')} *</Label>
              <Input data-testid="lookup-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('admin_code')}</Label>
                <Input data-testid="lookup-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin_sort_order')}</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin_value_en')} *</Label>
              <Input data-testid="lookup-value-en" value={form.value_en} onChange={(e) => setForm({ ...form, value_en: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin_value_ar')}</Label>
              <Input data-testid="lookup-value-ar" dir="rtl" value={form.value_ar} onChange={(e) => setForm({ ...form, value_ar: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>{t('admin_is_active')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
            <Button disabled={saving} onClick={save} className="gap-1.5" data-testid="lookup-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog target={pendingDelete} onClose={() => setPendingDelete(null)} onConfirm={doRemove} message={pendingDelete ? `${t('delete')} — ${pendingDelete.value_en}?` : ''} />
    </div>
  );
}

export function RestrictedNotice() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
      <p className="font-medium text-destructive">{t('admin_no_access')}</p>
    </div>
  );
}