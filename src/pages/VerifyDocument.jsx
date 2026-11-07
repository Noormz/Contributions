import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtDateTime, STATUS_LABELS } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import { BadgeCheck, Loader2, ShieldAlert, Languages } from 'lucide-react';
import KfasLogo from '@/components/brand/KfasEmblem';

// Public page opened by scanning the QR code on a generated PDF. No login needed.
export default function VerifyDocument() {
  const { code } = useParams();
  const tr = useTr();
  const { language, toggleLanguage } = useTranslation();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    base44.api.get(`/api/public/verify/${encodeURIComponent(code)}`)
      .then((r) => setState({ loading: false, ...r }))
      .catch(() => setState({ loading: false, valid: false }));
  }, [code]);

  const status = state.current_status && STATUS_LABELS[state.current_status] ? tr(...STATUS_LABELS[state.current_status]) : state.current_status;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KfasLogo className="h-10 w-auto shrink-0 dark:hidden" />
            <KfasLogo onDark className="hidden h-10 w-auto shrink-0 dark:block" />
            <div>
              <p className="text-sm font-bold">{tr('Kuwait Foundation for the Advancement of Sciences', 'مؤسسة الكويت للتقدم العلمي')}</p>
              <p className="text-xs text-muted-foreground">{tr('Document verification', 'التحقق من المستندات')}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={toggleLanguage} className="gap-1.5"><Languages className="h-4 w-4" />{language === 'en' ? 'العربية' : 'English'}</Button>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm" data-testid="verify-result">
          {state.loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : state.valid ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <BadgeCheck className="h-10 w-10 text-success" />
                <div>
                  <p className="text-lg font-bold text-success">{tr('Authentic document', 'مستند صحيح')}</p>
                  <p className="text-sm text-muted-foreground">{tr('This document was issued by the Contributions E-Portal.', 'صدر هذا المستند من بوابة المساهمات الإلكترونية.')}</p>
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[
                  [tr('Document', 'المستند'), state.document],
                  [tr('Reference', 'المرجع'), state.reference],
                  [tr('Company', 'الشركة'), language === 'ar' ? state.company_name_ar || state.company_name : state.company_name],
                  [tr('First issued', 'تاريخ الإصدار'), fmtDateTime(state.issued_at)],
                  [tr('Current status', 'الحالة الحالية'), status],
                  [tr('Verification code', 'رمز التحقق'), state.code],
                ].map(([k, v]) => (
                  <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="mt-0.5 font-medium">{v || '—'}</dd></div>
                ))}
              </dl>
              {state.summary && <p className="rounded-lg bg-muted/50 p-3 text-sm">{state.summary}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-4">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              <div>
                <p className="text-lg font-bold text-destructive">{tr('Document not recognised', 'المستند غير معروف')}</p>
                <p className="text-sm text-muted-foreground">{tr('No document matches this verification code, or the record has been withdrawn. Contact the Contributions Unit.', 'لا يوجد مستند يطابق رمز التحقق أو تم سحب السجل. يرجى التواصل مع وحدة المساهمات.')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
