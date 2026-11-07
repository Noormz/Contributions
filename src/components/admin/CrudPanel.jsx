import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg } from '@/lib/tr';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';

/**
 * Generic admin CRUD table for simple entities.
 * fields: [{ key, label, type: 'text'|'textarea'|'number'|'switch', required, rtl, full, list }]
 */
export default function CrudPanel({ entity, fields, sort, defaults = {}, hint, addLabel, testId }) {
  const tr = useTr();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.entities[entity].filter({}, { sort, limit: 500 });
      setRows(res.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [entity, sort]);

  useEffect(() => { load(); }, [load]);

  const open = (r) => {
    setEditing(r || {});
    setForm(r ? Object.fromEntries(fields.map((f) => [f.key, r[f.key] ?? (f.type === 'switch' ? true : '')])) : { ...Object.fromEntries(fields.map((f) => [f.key, f.type === 'switch' ? true : ''])), ...defaults });
    setFormError('');
  };

  const save = async () => {
    const missing = fields.find((f) => f.required && !String(form[f.key] ?? '').trim());
    if (missing) return setFormError(tr(`${missing.label} is required.`, `${missing.label} مطلوب.`));
    setSaving(true);
    try {
      const data = Object.fromEntries(fields.map((f) => [f.key, f.type === 'number' ? Number(form[f.key] || 0) : f.type === 'switch' ? !!form[f.key] : String(form[f.key] ?? '').trim()]));
      if (editing.id) await base44.entities[entity].update(editing.id, data);
      else await base44.entities[entity].create(data);
      setEditing(null);
      load();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const listFields = fields.filter((f) => f.list);

  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-3">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <Button size="sm" className="ms-auto gap-1.5" onClick={() => open(null)} data-testid={`${testId}-add`}><Plus className="h-4 w-4" /> {addLabel || tr('Add', 'إضافة')}</Button>
      </div>
      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="p-10 text-center text-sm text-destructive">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {listFields.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                  <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-testid={`${testId}-row`}>
                    {listFields.map((f) => (
                      <TableCell key={f.key} dir={f.rtl ? 'rtl' : undefined} className="min-w-[8rem] max-w-xs break-words text-sm">
                        {f.type === 'switch' ? (r[f.key] !== false ? tr('Yes', 'نعم') : tr('No', 'لا')) : String(r[f.key] ?? '—')}
                      </TableCell>
                    ))}
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => open(r)} aria-label={tr('Edit', 'تعديل')} data-testid={`${testId}-edit`}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setPendingDelete(r)} aria-label={tr('Delete', 'حذف')} data-testid={`${testId}-delete`}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={listFields.length + 1} className="p-10 text-center text-sm text-muted-foreground">{tr('No records found', 'لا توجد سجلات')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? tr('Edit', 'تعديل') : addLabel || tr('Add', 'إضافة')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={`space-y-1.5 ${f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                {f.type === 'switch' ? (
                  <label className="flex items-center gap-2 pt-6"><Switch checked={!!form[f.key]} onCheckedChange={(v) => setForm({ ...form, [f.key]: v })} data-testid={`${testId}-field-${f.key}`} /><span className="text-sm">{f.label}</span></label>
                ) : (
                  <>
                    <Label>{f.label}{f.required ? ' *' : ''}</Label>
                    {f.type === 'textarea'
                      ? <Textarea data-testid={`${testId}-field-${f.key}`} rows={6} dir={f.rtl ? 'rtl' : undefined} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                      : <Input data-testid={`${testId}-field-${f.key}`} type={f.type === 'number' ? 'number' : 'text'} dir={f.rtl ? 'rtl' : undefined} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} disabled={f.lockOnEdit && !!editing?.id} />}
                  </>
                )}
              </div>
            ))}
          </div>
          {formError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{formError}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={save} disabled={saving} data-testid={`${testId}-save`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Save', 'حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog target={pendingDelete} onClose={() => setPendingDelete(null)} onConfirm={async (r) => { await base44.entities[entity].delete(r.id); load(); }} />
    </div>
  );
}
