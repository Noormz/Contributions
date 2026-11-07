import React from 'react';
import { useTr } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import { FileDown, ShieldCheck } from 'lucide-react';

const SOURCES = {
  ReceiptVoucher: (r) => `/api/receipt-vouchers/${r.id}/voucher.pdf`,
  ClearanceLetter: (r) => `/api/clearance-letters/${r.id}/letter.pdf`,
};

// Download link for the system-generated official PDF of a voucher or clearance letter.
export default function OfficialPdfPanel({ record, entity }) {
  const tr = useTr();
  const url = SOURCES[entity]?.(record);
  if (!url) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-success" />
        {tr('This is the official document: signed electronically, sealed by KFAS and verifiable by its QR code.', 'هذا هو المستند الرسمي: موقّع إلكترونياً ومختوم من المؤسسة ويمكن التحقق منه برمز QR.')}
      </p>
      <div className="flex gap-2">
        <a href={url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">{tr('View', 'عرض')}</Button></a>
        <a href={`${url}?download=1`} data-testid="official-pdf"><Button size="sm" className="gap-1.5"><FileDown className="h-4 w-4" /> {tr('Download signed PDF', 'تحميل المستند الموقّع')}</Button></a>
      </div>
    </div>
  );
}

export const ReceiptVoucherPdf = (props) => <OfficialPdfPanel {...props} entity="ReceiptVoucher" />;
export const ClearanceLetterPdf = (props) => <OfficialPdfPanel {...props} entity="ClearanceLetter" />;
