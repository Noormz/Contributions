// Entity-specific action panels rendered on the generic record detail page
// (above the tabs). Each component receives { record, reload }.
import PaymentActions from '@/components/payments/PaymentActions';
import InquiryRespond from '@/components/records/InquiryRespond';
import { ReceiptVoucherPdf, ClearanceLetterPdf } from '@/components/records/OfficialPdfPanel';

export const ENTITY_PANELS = {
  Payment: PaymentActions,
  Inquiry: InquiryRespond,
  ReceiptVoucher: ReceiptVoucherPdf,
  ClearanceLetter: ClearanceLetterPdf,
};
