import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, errMsg, STATUS_LABELS } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import { Switch } from '@/components/ui/switch';
import { Loader2, Users, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const STATUSES = ['assigned', 'under_review', 'pending_manager_approval', 'accounts_processing', 'returned', 'completed'];

export default function OfficerWorkload() {
  const tr = useTr();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [setting, setSetting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s] = await Promise.all([
        base44.functions.invoke('officerWorkload'),
        base44.entities.SystemSettings.filter({ setting_key: 'auto_assignment_enabled' }, { limit: 1 }).catch(() => ({ items: [] })),
      ]);
      setRows(Array.isArray(w) ? w : []);
      setSetting(s.items?.[0] || null);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const autoOn = setting ? setting.setting_value !== 'false' : true;
  const isAdmin = user?.role === 'system_admin';
  const canSee = ['contributions_manager', 'system_admin'].includes(user?.role);

  const toggle = async (v) => {
    if (!isAdmin) { setMsg({ ok: false, text: tr('Only a system administrator can change this setting.', 'يمكن لمدير النظام فقط تغيير هذا الإعداد.') }); return; }
    try {
      if (setting) await base44.entities.SystemSettings.update(setting.id, { setting_value: v ? 'true' : 'false' });
      else await base44.entities.SystemSettings.create({ setting_group: 'application', setting_key: 'auto_assignment_enabled', setting_value: v ? 'true' : 'false', description: 'Automatically assign submitted applications to the least-loaded officer' });
      setMsg({ ok: true, text: v ? tr('Automatic assignment enabled.', 'تم تفعيل الإسناد التلقائي.') : tr('Automatic assignment disabled.', 'تم إيقاف الإسناد التلقائي.') });
      load();
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }); }
  };

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

  const visible = canSee ? rows : rows.filter((r) => r.officer_id === user.id);
  const chart = visible.map((r) => ({ name: r.officer_name, open: r.open }));

  return (
    <div className="space-y-5">
      <PageHeader title={tr('Officer Workload', 'عبء عمل الموظفين')} subtitle={tr('Open applications per officer. New submissions go to the officer with the fewest open applications.', 'الطلبات المفتوحة لكل موظف. تُسند الطلبات الجديدة للموظف الأقل عبئاً.')} crumbs={[{ label: tr('Officer Workload', 'عبء عمل الموظفين') }]} />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">{tr('Automatic assignment', 'الإسناد التلقائي')}</p>
          <p className="text-sm text-muted-foreground">{autoOn ? tr('On — submitted applications are distributed evenly by open workload.', 'مفعل — تُوزع الطلبات بالتساوي حسب العبء.') : tr('Off — managers assign applications manually.', 'متوقف — يسند المديرون الطلبات يدوياً.')}</p>
        </div>
        {canSee && <Switch checked={autoOn} onCheckedChange={toggle} data-testid="auto-assign-toggle" aria-label={tr('Automatic assignment', 'الإسناد التلقائي')} />}
      </div>
      {msg && <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{!msg.ok && <AlertTriangle className="h-4 w-4" />}{msg.text}</div>}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground"><Users className="mx-auto mb-2 h-8 w-8 opacity-40" />{tr('No active contributions officers.', 'لا يوجد موظفو مساهمات نشطون.')}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((r) => (
              <Link key={r.officer_id} to={`/applications?officer=${r.officer_id}`} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md" data-testid="officer-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{r.officer_name}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.email}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-2xl font-bold tabular-nums">{r.open}</p>
                    <p className="text-xs text-muted-foreground">{tr('open', 'مفتوح')} / {r.total} {tr('total', 'إجمالي')}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STATUSES.filter((s) => r.by_status?.[s]).map((s) => (
                    <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">{tr(...(STATUS_LABELS[s] || [s, s]))}: {r.by_status[s]}</span>
                  ))}
                </div>
                <p className={`mt-3 text-xs ${r.oldest_pending_days > 3 ? 'text-warning' : 'text-muted-foreground'}`}>{tr('Oldest pending', 'أقدم طلب معلق')}: {r.oldest_pending_days} {tr('days', 'يوم')}</p>
              </Link>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-semibold">{tr('Open applications by officer', 'الطلبات المفتوحة حسب الموظف')}</h3>
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="open" name={tr('Open', 'مفتوح')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
