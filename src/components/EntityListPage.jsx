import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtDateTime } from '@/lib/tr';
import { useAuth } from '@/lib/AuthContext';
import RecordActionsMenu from '@/components/records/RecordActionsMenu';
import CreateRecordDialog from '@/components/records/CreateRecordDialog';
import StatusBadge from '@/components/review/StatusBadge';
import { getRecordConfig } from '@/lib/recordConfig';
import { Search, ChevronLeft, ChevronRight, Loader2, Inbox, Download, Plus, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const STATUS_KEYS = ['status', 'payment_status', 'review_status', 'clearance_status'];
const PAGE = 25;

export default function EntityListPage({ title, titleAr, entity, columns, searchField, searchPlaceholder, readOnly, baseQuery, roles }) {
  const { t } = useTranslation();
  const tr = useTr();
  const { user } = useAuth();
  const cfg = getRecordConfig(entity);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { const id = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(id); }, [search]);

  const searchKeys = Array.from(new Set([searchField, ...columns.map((c) => c.key)].filter(Boolean)));
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const esc = debounced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const query = { ...(baseQuery || {}), ...(debounced ? { $or: searchKeys.map((k) => ({ [k]: { $regex: esc, $options: 'i' } })) } : {}) };
      const res = await base44.entities[entity].filter(query, { sort: '-created_date', limit: PAGE, skip: page * PAGE });
      setItems(res.items || []);
      setTotal(res.total ?? (res.items || []).length);
    } catch (e) {
      setItems([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, entity, page, JSON.stringify(baseQuery)]);

  useEffect(() => { setPage(0); }, [debounced]);
  useEffect(() => { load(); }, [load]);

  const cell = (item, col, idx) => {
    const v = item[col.key];
    if (STATUS_KEYS.includes(col.key)) return <StatusBadge value={v} />;
    const text = col.key === 'timestamp' || col.key.endsWith('_date') && String(v || '').includes('T') ? fmtDateTime(v) : (v ?? '—');
    if (idx === 0) {
      return <Link to={`/records/${entity}/${item.id}`} className="font-medium text-foreground underline-offset-4 hover:text-accent hover:underline">{String(text) || '—'}</Link>;
    }
    return <span className="text-foreground">{typeof v === 'boolean' ? (v ? tr('Yes', 'نعم') : tr('No', 'لا')) : String(text)}</span>;
  };

  const exportCsv = () => {
    const header = columns.map((c) => c.label).join(',');
    const rows = items.map((it) => columns.map((c) => `"${String(it[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, '_')}.csv`;
    a.click();
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));

  if (roles && !roles.includes(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center" data-testid="list-forbidden">
        <AlertTriangle className="h-10 w-10 text-warning" />
        <p className="font-semibold">{tr('You do not have permission to access this page.', 'ليست لديك صلاحية الوصول إلى هذه الصفحة.')}</p>
        <Link to="/" className="text-sm text-accent hover:underline">{tr('Back to dashboard', 'العودة إلى لوحة التحكم')}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tr(title, titleAr)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{loading ? '' : tr(`${total} records`, `${total} سجل`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder || t('search')} className="ps-9" aria-label={t('search')} />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
          {!readOnly && cfg?.canCreate?.(user) && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> {t('rec_new')}</Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {columns.map((col) => <th key={col.key} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{col.label}</th>)}
                {!readOnly && <th className="whitespace-nowrap px-4 py-3 text-end font-semibold text-muted-foreground">{t('actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={columns.length + 1} className="px-4 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : error ? (
                <tr><td colSpan={columns.length + 1} className="px-4 py-16 text-center text-destructive">{error} <Button variant="link" onClick={load}>{tr('Retry', 'إعادة المحاولة')}</Button></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="px-4 py-16 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{tr('No records found', 'لا توجد سجلات')}</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-muted/30" data-testid="list-row">
                  {columns.map((col, i) => <td key={col.key} className="min-w-[7rem] max-w-xs break-words px-4 py-3">{cell(item, col, i)}</td>)}
                  {!readOnly && <td className="px-4 py-3 text-end"><RecordActionsMenu entityName={entity} record={item} onDelete={load} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{tr(`Page ${page + 1} of ${pages}`, `صفحة ${page + 1} من ${pages}`)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 0 || loading}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t('previous')}</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page + 1 >= pages || loading}>{t('next')} <ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
            </div>
          </div>
        )}
      </div>

      <CreateRecordDialog entityName={entity} open={createOpen} onOpenChange={setCreateOpen} onSaved={load} />
    </div>
  );
}
