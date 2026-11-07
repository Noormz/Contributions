import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtMoney, fmtDateTime, humanize as humanizeLabel } from '@/lib/tr';
import { useAuth } from '@/lib/AuthContext';
import StatusBadge from '@/components/review/StatusBadge';
import CommentsPanel from '@/components/records/CommentsPanel';
import ActivityTimeline from '@/components/records/ActivityTimeline';
import { ENTITY_PANELS } from '@/components/records/entityPanels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, Loader2, Pencil, Trash2, Download, FileText, AlertTriangle, Save, X, ShieldAlert } from 'lucide-react';
import { getRecordConfig } from '@/lib/recordConfig';

const isFileUrl = (v) => typeof v === 'string' && (v.startsWith('/api/files/') || /^https?:\/\//.test(v));
const HIDDEN = ['id', 'created_by_id', 'created_by', 'created_date', 'updated_date'];

export default function RecordDetail() {
  const { entity: entityName, id } = useParams();
  const { t, language } = useTranslation();
  const tr = useTr();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // 'not_found' | 'forbidden' | message
  const [mode, setMode] = useState(searchParams.get('edit') === '1' ? 'edit' : 'view');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState('overview');

  const cfg = getRecordConfig(entityName);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const rec = await base44.entities[entityName].get(id);
      setRecord(rec);
      if (cfg) {
        const f = {};
        cfg.editableFields.forEach((k) => { f[k] = rec[k] ?? ''; });
        setForm(f);
      }
    } catch (e) {
      setRecord(null);
      setLoadError(e.status === 404 ? 'not_found' : e.status === 403 ? 'forbidden' : (e.message || 'error'));
    }
    if (!silent) setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (searchParams.get('edit') === '1') setMode('edit'); }, [searchParams]);

  const original = record && cfg ? Object.fromEntries(cfg.editableFields.map((k) => [k, record[k] ?? ''])) : {};
  const dirty = mode === 'edit' && JSON.stringify(form) !== JSON.stringify(original);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const flash = (kind, text) => { setToast({ kind, text }); setTimeout(() => setToast(null), 5000); };

  const cancelEdit = () => {
    if (dirty && !window.confirm(tr('You have unsaved changes. Discard them?', 'لديك تغييرات غير محفوظة. هل تريد تجاهلها؟'))) return;
    setMode('view');
    setForm(original);
  };

  const save = async () => {
    const changes = {};
    cfg.editableFields.forEach((k) => {
      const field = cfg.fields.find((f) => f.key === k);
      let v = form[k];
      if (String(record[k] ?? '') === String(v ?? '')) return;
      if (field?.type === 'money') {
        if (v === '' || Number.isNaN(Number(v))) { v = undefined; } else v = Number(v);
      }
      if (v !== undefined) changes[k] = v;
    });
    if (Object.keys(changes).length === 0) { setMode('view'); return; }
    setSaving(true);
    try {
      await base44.entities[entityName].update(id, changes);
      setMode('view');
      await load(true);
      flash('success', t('rec_saved'));
    } catch (e) {
      flash('error', e.message || tr("We couldn't save your changes. Please review the information and try again.", 'تعذر حفظ التغييرات. يرجى مراجعة المعلومات والمحاولة مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await base44.entities[entityName].delete(id);
      navigate(cfg?.listPath || '/', { replace: true });
    } catch (e) {
      setDeleteOpen(false);
      flash('error', e.message || t('rec_delete_failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (loadError || !record) {
    const forbidden = loadError === 'forbidden';
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center" data-testid="record-error">
        {forbidden ? <ShieldAlert className="h-10 w-10 text-destructive" /> : <AlertTriangle className="h-10 w-10 text-warning" />}
        <p className="font-semibold">
          {forbidden
            ? tr('You do not have permission to access this record.', 'ليس لديك صلاحية للوصول إلى هذا السجل.')
            : loadError === 'not_found' || !loadError
              ? tr('The requested record could not be found.', 'تعذر العثور على السجل المطلوب.')
              : tr('Something went wrong while loading this record.', 'حدث خطأ أثناء تحميل السجل.')}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t('rec_back')}</Button>
          {!forbidden && loadError !== 'not_found' && <Button size="sm" onClick={() => load()}>{tr('Retry', 'إعادة المحاولة')}</Button>}
        </div>
      </div>
    );
  }

  const fmtValue = (v, type) => {
    if (v === null || v === undefined || v === '') return '—';
    if (type === 'money') return fmtMoney(v);
    if (type === 'date') return String(v).slice(0, 10);
    if (type === 'datetime') return fmtDateTime(v);
    if (typeof v === 'boolean') return v ? tr('Yes', 'نعم') : tr('No', 'لا');
    if (Array.isArray(v)) return v.join(', ') || '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const statusValue = cfg?.statusField ? record[cfg.statusField] : record.status;
  const title = cfg ? cfg.title(record) : (record.title || record.subject || record.name || record.related_reference || id);
  const canEdit = cfg ? !!cfg.canEdit(user, record) : false;
  const canDelete = cfg?.canDelete ? !!cfg.canDelete(user, record) : user?.role === 'system_admin';

  const fields = cfg
    ? cfg.fields.map((f) => ({ ...f, label: language === 'ar' ? f.ar : f.en }))
    : Object.keys(record)
      .filter((k) => !HIDDEN.includes(k))
      .map((k) => ({ key: k, label: humanizeLabel(k), type: k === 'status' ? 'status' : isFileUrl(record[k]) ? 'file' : /_date$|timestamp/.test(k) && String(record[k] || '').includes('T') ? 'datetime' : 'text' }));

  const attachments = fields.filter((f) => f.type === 'file' && isFileUrl(record[f.key]));
  const Panel = ENTITY_PANELS[entityName];
  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const renderEditField = (f) => {
    if (f.type === 'textarea') return <Textarea id={`f-${f.key}`} rows={3} value={form[f.key] ?? ''} onChange={setField(f.key)} />;
    return <Input id={`f-${f.key}`} data-testid={`edit-${f.key}`} type={f.type === 'date' ? 'date' : f.type === 'money' ? 'number' : 'text'} value={form[f.key] ?? ''} onChange={setField(f.key)} />;
  };

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-foreground hover:underline">{tr('Home', 'الرئيسية')}</Link>
        <span>/</span>
        {cfg?.listPath ? (
          <Link to={cfg.listPath} className="hover:text-foreground hover:underline">{t(cfg.titleKey)}</Link>
        ) : (
          <span>{humanizeLabel(entityName)}</span>
        )}
        <span>/</span>
        <span className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">{title}</span>
      </nav>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl" data-testid="record-title">{title}</h1>
              {statusValue && <StatusBadge value={statusValue} />}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('rec_created')}: {fmtDateTime(record.created_date)}{record.created_by ? ` · ${record.created_by}` : ''}
              {' · '}{t('rec_updated')}: {fmtDateTime(record.updated_date)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {mode === 'view' && canEdit && (
              <Button variant="outline" size="sm" onClick={() => setMode('edit')} className="gap-1.5" data-testid="record-edit"><Pencil className="h-4 w-4" /> {t('edit')}</Button>
            )}
            {canDelete && mode === 'view' && (
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive" onClick={() => setDeleteOpen(true)} data-testid="record-delete"><Trash2 className="h-4 w-4" /> {t('delete')}</Button>
            )}
            {mode === 'edit' && (
              <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1.5"><X className="h-4 w-4" /> {t('cancel')}</Button>
            )}
          </div>
        </div>
        {toast && (
          <div role="status" data-testid="record-toast" className={`mt-4 rounded-lg p-3 text-sm ${toast.kind === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{toast.text}</div>
        )}
      </div>

      {Panel && <Panel record={record} reload={() => load(true)} />}

      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {[['overview', 'rec_overview'], ['activity', 'rec_activity'], ['comments', 'rec_comments']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t(label)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            {mode === 'edit' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {cfg.fields.filter((f) => cfg.editableFields.includes(f.key)).map((f) => (
                    <div key={f.key} className={f.type === 'textarea' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                      <Label htmlFor={`f-${f.key}`}>{language === 'ar' ? f.ar : f.en}</Label>
                      {renderEditField(f)}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={cancelEdit}>{t('cancel')}</Button>
                  <Button disabled={saving || !dirty} onClick={save} className="gap-1.5" data-testid="record-save">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('save')}
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {fields.filter((f) => f.type !== 'file').map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                      {f.type === 'status' && record[f.key] ? <StatusBadge value={record[f.key]} /> : fmtValue(record[f.key], f.type)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary"><FileText className="h-4 w-4" /> {t('rec_attachments')}</h3>
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr('No attachments.', 'لا توجد مرفقات.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {attachments.map((f) => (
                  <li key={f.key} className="flex items-center justify-between gap-3 py-2.5">
                    <a href={record[f.key]} target="_blank" rel="noopener noreferrer" className="min-w-0 text-sm font-medium text-accent hover:underline [overflow-wrap:anywhere]">
                      {language === 'ar' ? f.ar || f.label : f.en || f.label}
                    </a>
                    <a href={`${record[f.key]}${record[f.key].startsWith('/api/files/') ? '?download=1' : ''}`} className="shrink-0">
                      <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> {t('download')}</Button>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'activity' && <ActivityTimeline entityName={entityName} recordId={id} />}
      {tab === 'comments' && <CommentsPanel entityName={entityName} recordId={id} />}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('rec_delete_title')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t('rec_delete_msg')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>{t('cancel')}</Button>
            <Button variant="destructive" disabled={deleting} onClick={doDelete} data-testid="record-delete-confirm">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
