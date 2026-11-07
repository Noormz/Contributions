import React, { useEffect, useState } from 'react';
import { useTr } from '@/lib/tr';
import { Landmark, Phone } from 'lucide-react';
import { loadSettingsMap, KFAS_KEYS, bankDetailsConfigured } from './data';

// KFAS's published contact details (www.kfas.org → Contact Us).
export const KFAS_CONTACT = { email: 'info@kfas.org.kw', phone: '+965 2227 8100' };

/**
 * KFAS bank account details for transfers and deposits (Administration → Settings).
 * Until an administrator enters the account, companies are told to request it from KFAS
 * rather than being shown an incomplete account.
 */
export default function KfasBankDetails({ compact }) {
  const tr = useTr();
  const [s, setS] = useState(null);
  useEffect(() => { loadSettingsMap(KFAS_KEYS).then(setS); }, []);
  if (!s) return null;
  const box = `rounded-lg border border-accent/30 bg-accent/5 ${compact ? 'p-3' : 'p-4'}`;
  if (!bankDetailsConfigured(s)) {
    return (
      <div className={box} data-testid="kfas-bank-details">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4 shrink-0 text-accent" /> {tr('KFAS bank account for transfers and deposits', 'حساب المؤسسة البنكي للتحويل والإيداع')}</p>
        <p className="text-sm text-muted-foreground">
          {tr('Please contact KFAS for the bank account details before making a transfer or deposit:', 'يرجى التواصل مع المؤسسة للحصول على تفاصيل الحساب البنكي قبل التحويل أو الإيداع:')}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium" dir="ltr">
          <a href={`mailto:${KFAS_CONTACT.email}`} className="text-accent hover:underline">{KFAS_CONTACT.email}</a>
          <a href={`tel:${KFAS_CONTACT.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5" />{KFAS_CONTACT.phone}</a>
        </p>
      </div>
    );
  }
  const rows = [
    [tr('Bank', 'البنك'), s.kfas_bank_name],
    [tr('Account name', 'اسم الحساب'), s.kfas_account_name],
    [tr('Account number', 'رقم الحساب'), s.kfas_account_number],
    ['IBAN', s.kfas_iban],
  ].filter(([, v]) => v);
  return (
    <div className={box} data-testid="kfas-bank-details">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4 shrink-0 text-accent" /> {tr('KFAS bank account for transfers and deposits', 'حساب المؤسسة البنكي للتحويل والإيداع')}</p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-w-0 gap-2"><dt className="shrink-0 text-muted-foreground">{k}:</dt><dd className="min-w-0 font-medium [overflow-wrap:anywhere]" dir="ltr">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
