import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtDateTime, humanize, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import { markAllRead } from '@/components/comms/NotificationBell';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Bell, CheckCheck, ExternalLink, Mail, MailOpen } from 'lucide-react';

export default function Notifications() {
  const tr = useTr();
  const { language } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState('all');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = {};
      if (show === 'unread') q.is_read = false;
      if (category !== 'all') q.category = category;
      const [res, cats] = await Promise.all([
        base44.entities.Notification.filter(q, { sort: '-created_date', limit: 200 }),
        base44.entities.Notification.list({ distinct: 'category' }),
      ]);
      setItems(res.items || []);
      setCategories(cats.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [show, category]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (n) => { await base44.entities.Notification.update(n.id, { is_read: !n.is_read }); load(); };
  const open = async (n) => {
    if (!n.is_read) await base44.entities.Notification.update(n.id, { is_read: true }).catch(() => {});
    if (n.link) navigate(n.link);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr('Notifications', 'الإشعارات')}
        crumbs={[{ label: tr('Notifications', 'الإشعارات') }]}
        actions={<Button variant="outline" size="sm" className="gap-1.5" onClick={async () => { await markAllRead(); load(); }} data-testid="notifications-mark-all"><CheckCheck className="h-4 w-4" /> {tr('Mark all read', 'تعليم الكل كمقروء')}</Button>}
      />
      <div className="flex flex-wrap gap-2">
        <Select value={show} onValueChange={setShow}>
          <SelectTrigger className="w-40" data-testid="notifications-show"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All', 'الكل')}</SelectItem>
            <SelectItem value="unread">{tr('Unread', 'غير مقروء')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48" data-testid="notifications-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All categories', 'كل الفئات')}</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{humanize(c)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="py-16 text-center text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-16 text-muted-foreground"><Bell className="h-8 w-8 opacity-40" />{tr('No notifications', 'لا توجد إشعارات')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.is_read ? '' : 'bg-accent/5'}`} data-testid="notification-row">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-accent'}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.is_read ? '' : 'font-semibold'}`}>{language === 'ar' ? n.title_ar || n.title : n.title}</p>
                  {(n.body || n.body_ar) && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{language === 'ar' ? n.body_ar || n.body : n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.created_date)} · {humanize(n.category)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => toggle(n)} title={n.is_read ? tr('Mark unread', 'تعليم كغير مقروء') : tr('Mark read', 'تعليم كمقروء')}>
                    {n.is_read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                  </Button>
                  {n.link && <Button variant="ghost" size="icon" onClick={() => open(n)} title={tr('Open', 'فتح')}><ExternalLink className="h-4 w-4 rtl:-scale-x-100" /></Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
