import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtDateTime, errMsg } from '@/lib/tr';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Pencil, UserPlus, Search, CheckCircle2, XCircle } from 'lucide-react';

const ROLES = ['company_representative', 'contributions_officer', 'contributions_manager', 'accounts_unit', 'system_admin'];
const NONE = '__none__';

export default function UsersPanel() {
  const tr = useTr();
  const { t, language } = useTranslation();
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [flash, setFlashState] = useState('');
  const flashTimer = useRef(null);
  const setFlash = (msg) => {
    clearTimeout(flashTimer.current);
    setFlashState(msg);
    if (msg) flashTimer.current = setTimeout(() => setFlashState(''), 4000);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [u, c] = await Promise.all([
        base44.functions.invoke('listUsers'),
        base44.entities.Company.filter({}, { sort: 'company_name_en', limit: 1000 }),
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setCompanies(c.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const companyName = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, language === 'ar' ? c.company_name_ar || c.company_name_en : c.company_name_en])), [companies, language]);

  const shown = users.filter((u) => (roleFilter === 'all' || u.role === roleFilter)
    && (!search || [u.full_name, u.email, u.username, companyName[u.company_id]].join(' ').toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));

  const openEdit = (u) => {
    setEditing(u);
    setForm({ role: u.role, company_id: u.company_id || NONE, is_active: u.is_active !== false, job_title: u.job_title || '', full_name: u.full_name || '' });
    setFormError('');
  };
  const openCreate = () => {
    setCreating(true);
    setForm({ email: '', full_name: '', role: 'contributions_officer', company_id: NONE, password: '', job_title: '' });
    setFormError('');
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      const company_id = form.company_id === NONE ? '' : form.company_id;
      if (form.role === 'company_representative' && !company_id) throw new Error(tr('Company representatives must be linked to a company.', 'يجب ربط ممثل الشركة بشركة.'));
      if (creating) {
        await base44.functions.invoke('createUser', { email: form.email.trim(), full_name: form.full_name.trim(), role: form.role, company_id, password: form.password, job_title: form.job_title });
        setFlash(tr(`User ${form.email} created.`, `تم إنشاء المستخدم ${form.email}.`));
      } else {
        await base44.functions.invoke('updateUser', { user_id: editing.id, role: form.role, company_id, is_active: form.is_active, job_title: form.job_title, full_name: form.full_name });
        setFlash(tr('User updated.', 'تم تحديث المستخدم.'));
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const dialogOpen = !!editing || creating;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" placeholder={tr('Search name, email, company', 'ابحث بالاسم أو البريد أو الشركة')} data-testid="users-search" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All roles', 'كل الأدوار')}</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`role_${r}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="ms-auto gap-1.5" onClick={openCreate} data-testid="users-create"><UserPlus className="h-4 w-4" /> {tr('Create user', 'إنشاء مستخدم')}</Button>
      </div>
      {flash && <div className="rounded-lg bg-success/10 p-3 text-sm text-success" role="status">{flash}</div>}

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
                  <TableHead>{tr('Name', 'الاسم')}</TableHead>
                  <TableHead>{tr('Email', 'البريد')}</TableHead>
                  <TableHead>{tr('Role', 'الدور')}</TableHead>
                  <TableHead>{tr('Company', 'الشركة')}</TableHead>
                  <TableHead>{tr('Active', 'نشط')}</TableHead>
                  <TableHead>{tr('Verified', 'موثق')}</TableHead>
                  <TableHead>{tr('Last login', 'آخر دخول')}</TableHead>
                  <TableHead className="text-end">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((u) => (
                  <TableRow key={u.id} data-testid="user-row">
                    <TableCell className="font-medium">{u.full_name || '—'}{u.job_title && <span className="block text-xs text-muted-foreground">{u.job_title}</span>}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{t(`role_${u.role === 'admin' ? 'system_admin' : u.role}`)}</TableCell>
                    <TableCell className="text-sm">{companyName[u.company_id] || '—'}</TableCell>
                    <TableCell>{u.is_active !== false ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}</TableCell>
                    <TableCell>{u.verified ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(u.last_login_date)}</TableCell>
                    <TableCell className="text-end"><Button variant="ghost" size="icon" onClick={() => openEdit(u)} aria-label={tr('Edit user', 'تعديل المستخدم')} data-testid="user-edit"><Pencil className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
                {shown.length === 0 && <TableRow><TableCell colSpan={8} className="p-10 text-center text-sm text-muted-foreground">{tr('No users found', 'لا يوجد مستخدمون')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{creating ? tr('Create user', 'إنشاء مستخدم') : `${tr('Edit user', 'تعديل المستخدم')} — ${editing?.email}`}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {creating && (
              <div className="space-y-1.5"><Label>{tr('Email', 'البريد')} *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email" /></div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{tr('Full name', 'الاسم الكامل')}</Label><Input value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="user-name" /></div>
              <div className="space-y-1.5"><Label>{tr('Job title', 'المسمى الوظيفي')}</Label><Input value={form.job_title || ''} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Role', 'الدور')} *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{t(`role_${r}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Company', 'الشركة')}{form.role === 'company_representative' ? ' *' : ''}</Label>
              <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                <SelectTrigger data-testid="user-company"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{tr('None', 'لا يوجد')}</SelectItem>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{companyName[c.id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {creating ? (
              <div className="space-y-1.5">
                <Label>{tr('Initial password', 'كلمة المرور الأولية')} *</Label>
                <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password" />
                <p className="text-xs text-muted-foreground">{tr('At least 8 characters. Share it securely; the user can reset it via “Forgot password”.', '8 أحرف على الأقل. شاركها بأمان؛ يمكن للمستخدم إعادة تعيينها.')}</p>
              </div>
            ) : (
              <label className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} disabled={editing?.id === me?.id} data-testid="user-active" />
                <span className="text-sm">{tr('Account active', 'الحساب نشط')}</span>
              </label>
            )}
            {formError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{formError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setCreating(false); }}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={save} disabled={saving} data-testid="user-save">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Save', 'حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
