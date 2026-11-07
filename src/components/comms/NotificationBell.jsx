import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtDateTime } from '@/lib/tr';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export async function markAllRead() {
  await base44.functions.invoke('markNotificationsRead', {});
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { language } = useTranslation();
  const tr = useTr();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [count, latest] = await Promise.all([
        base44.entities.Notification.count({ is_read: false }),
        base44.entities.Notification.filter({}, { sort: '-created_date', limit: 10 }),
      ]);
      setUnread(count);
      setItems(latest.items || []);
    } catch { /* ignore polling errors */ }
  }, [user]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, location.pathname]);

  const open = async (n) => {
    setMenuOpen(false);
    if (!n.is_read) await base44.entities.Notification.update(n.id, { is_read: true }).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  };

  // Simple popover (button + panel) with outside-click and Escape to close.
  const wrap = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const toggle = () => { const next = !menuOpen; setMenuOpen(next); if (next) load(); };

  return (
    <div className="relative" ref={wrap}>
      <Button variant="ghost" size="sm" className="relative" aria-label={tr('Notifications', 'الإشعارات')} aria-haspopup="menu" aria-expanded={menuOpen} data-state={menuOpen ? 'open' : 'closed'} onClick={toggle} data-testid="notification-bell">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span data-testid="notification-count" className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>
      {menuOpen && (
        <div role="menu" data-shell="topbar-menu" className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
            <span>{tr('Notifications', 'الإشعارات')}</span>
            {unread > 0 && (
              <button type="button" className="flex items-center gap-1 text-xs font-normal text-accent hover:underline" onClick={async () => { await markAllRead(); load(); }} data-testid="mark-all-read">
                <CheckCheck className="h-3.5 w-3.5" /> {tr('Mark all read', 'تعليم الكل كمقروء')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto border-y border-border">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{tr('No notifications', 'لا توجد إشعارات')}</p>
            ) : items.map((n) => (
              <button type="button" role="menuitem" key={n.id} onClick={() => open(n)} data-testid="notification-item" data-read={n.is_read ? '1' : '0'} className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start hover:bg-muted focus:bg-muted focus:outline-none">
                <span className={`text-sm leading-snug ${n.is_read ? 'text-muted-foreground' : 'font-semibold'}`}>
                  {!n.is_read && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-accent" />}
                  {language === 'ar' ? n.title_ar || n.title : n.title}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(n.created_date)}</span>
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); navigate('/notifications'); }} className="w-full px-3 py-2 text-center text-sm text-accent hover:bg-muted">
            {tr('View all', 'عرض الكل')}
          </button>
        </div>
      )}
    </div>
  );
}
