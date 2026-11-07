// Shared look for every generated PDF: KFAS header band, title block with
// reference and verification QR code, bilingual section headings, key/value
// grids, tables, status stamp and a footer with page numbers.
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'node:path';
import crypto from 'node:crypto';
import { allDocs, insertDoc, updateDoc, now } from './db.js';

const FONT_DIR = path.resolve(process.cwd(), 'node_modules', '@fontsource');
const FONTS = {
  regular: path.join(FONT_DIR, 'noto-sans', 'files', 'noto-sans-latin-400-normal.woff'),
  bold: path.join(FONT_DIR, 'noto-sans', 'files', 'noto-sans-latin-700-normal.woff'),
  ar: path.join(FONT_DIR, 'noto-naskh-arabic', 'files', 'noto-naskh-arabic-arabic-400-normal.woff'),
  arBold: path.join(FONT_DIR, 'noto-naskh-arabic', 'files', 'noto-naskh-arabic-arabic-700-normal.woff'),
  signature: path.join(FONT_DIR, 'great-vibes', 'files', 'great-vibes-latin-400-normal.woff'),
};
// Official KFAS logo (www.kfas.org).
const LOGO = path.resolve(process.cwd(), 'server', 'assets', 'kfas-logo.png');

export const C = {
  navy: '#1e3a5f', navyDark: '#14283f', teal: '#0f766e', gold: '#b08d3c',
  text: '#1f2937', muted: '#6b7280', line: '#e5e7eb', zebra: '#f8fafc', band: '#f1f5f9',
  ok: '#15803d', warn: '#b45309', bad: '#b91c1c',
};

export const ORG = {
  en: 'Kuwait Foundation for the Advancement of Sciences',
  ar: 'مؤسسة الكويت للتقدم العلمي',
  unitEn: 'Contributions Unit',
  unitAr: 'وحدة المساهمات',
  address: 'P.O. Box 25263, Safat 13113, Kuwait · Tel. +965 2227 8100 · info@kfas.org.kw · www.kfas.org',
};

// The Arabic font has no Latin glyphs: use Arabic-Indic digits and separators in Arabic text.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const arabicText = (str) => String(str ?? '')
  .replace(/(\d),(\d)/g, '$1٬$2')
  .replace(/\d/g, (d) => AR_DIGITS[d])
  .replace(/\.\s*$/, '')
  .replace(/[·—–]/g, '،')
  // RTL shaping reverses the whole line; pre-reverse number runs so they read correctly.
  .replace(/[٠-٩٬%]+/g, (run) => run.split('').reverse().join(''));

const APP_URL = () => process.env.APP_URL || 'http://localhost:5173';
const isArabic = (s) => /[؀-ۿ]/.test(String(s || ''));
const money3 = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const kwd = (n) => `${money3(n)} KWD`;
export const dateEn = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const dateTimeEn = (v) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const label = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Stable verification code per (document type, record); stored so /verify can confirm it.
export function verificationFor(docType, recordId, info) {
  const existing = allDocs('DocumentVerification').find((d) => d.doc_type === docType && d.record_id === recordId);
  if (existing) {
    updateDoc('DocumentVerification', existing.id, { ...info, last_generated: now() });
    return existing.code;
  }
  const code = crypto.randomBytes(6).toString('hex').toUpperCase();
  insertDoc('DocumentVerification', { code, doc_type: docType, record_id: recordId, ...info, issued_at: now(), last_generated: now() }, null);
  return code;
}

// Amount in English words (KWD and fils).
export function amountInWords(n) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const chunk = (x) => {
    const h = Math.floor(x / 100); const r = x % 100;
    const parts = [];
    if (h) parts.push(`${ones[h]} Hundred`);
    if (r) parts.push(r < 20 ? ones[r] : `${tens[Math.floor(r / 10)]}${r % 10 ? `-${ones[r % 10]}` : ''}`);
    return parts.join(' ');
  };
  const words = (x) => {
    if (x === 0) return 'Zero';
    const scales = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
    const out = [];
    for (const [v, nme] of scales) { if (x >= v) { out.push(`${chunk(Math.floor(x / v))} ${nme}`); x %= v; } }
    if (x) out.push(chunk(x));
    return out.join(' ');
  };
  const total = Math.round(Number(n || 0) * 1000);
  const dinars = Math.floor(total / 1000); const fils = total % 1000;
  return `${words(dinars)} Kuwaiti Dinars${fils ? ` and ${words(fils)} Fils` : ''} only`;
}

/**
 * Creates a themed document. Returns { doc, done(): Promise<Buffer>, ...helpers }.
 * opts: { titleEn, titleAr, reference, docType, recordId, verifyInfo, landscape, password, status, issuedTo }
 */
export async function themedPdf(opts) {
  const layout = opts.landscape ? 'landscape' : 'portrait';
  const pdfOpts = { size: 'A4', layout, margins: { top: 150, bottom: 70, left: 44, right: 44 }, bufferPages: true, info: { Title: `${opts.titleEn} ${opts.reference || ''}`.trim(), Author: `${ORG.en} — ${ORG.unitEn}`, Creator: 'Contributions E-Portal' } };
  if (opts.password) Object.assign(pdfOpts, { userPassword: opts.password, ownerPassword: `${opts.password}#owner`, permissions: { printing: 'highResolution', copying: false, modifying: false } });
  const doc = new PDFDocument(pdfOpts);
  doc.registerFont('R', FONTS.regular);
  doc.registerFont('B', FONTS.bold);
  doc.registerFont('AR', FONTS.ar);
  doc.registerFont('ARB', FONTS.arBold);
  doc.registerFont('SIG', FONTS.signature);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width; const M = 44; const CW = W - M * 2;
  const code = opts.docType ? verificationFor(opts.docType, opts.recordId || opts.reference, { reference: opts.reference || '', title: opts.titleEn, ...(opts.verifyInfo || {}) }) : null;
  const verifyUrl = code ? `${APP_URL()}/verify/${code}` : null;
  const qr = verifyUrl ? await QRCode.toBuffer(verifyUrl, { margin: 1, width: 220, color: { dark: C.navyDark, light: '#ffffff' } }) : null;
  const issued = new Date();

  // Writes text choosing the Arabic font (with RTL shaping) when needed.
  const write = (str, x, y, o = {}) => {
    const ar = isArabic(str);
    const s = ar ? arabicText(str) : String(str ?? '—');
    doc.font(ar ? (o.bold ? 'ARB' : 'AR') : (o.bold ? 'B' : 'R')).fontSize(o.size || 9).fillColor(o.color || C.text);
    doc.text(s, x, y, { width: o.width, align: ar && !o.align ? 'right' : (o.align || 'left'), features: ar ? ['rtla'] : undefined, lineGap: o.lineGap ?? 1, continued: false });
  };
  const heightOf = (str, o = {}) => {
    const ar = isArabic(str);
    const s = ar ? arabicText(str) : String(str ?? '—');
    doc.font(ar ? (o.bold ? 'ARB' : 'AR') : (o.bold ? 'B' : 'R')).fontSize(o.size || 9);
    return doc.heightOfString(s, { width: o.width, lineGap: o.lineGap ?? 1 });
  };

  const header = () => {
    const top = 28;
    doc.rect(0, 0, W, 6).fill(C.navy);
    doc.rect(0, 6, W, 2).fill(C.gold);
    doc.image(LOGO, M, top + 6, { width: 78 });
    const tx = M + 92;
    doc.moveTo(tx - 7, top + 2).lineTo(tx - 7, top + 46).lineWidth(0.6).strokeColor(C.line).stroke();
    write(ORG.en, tx, top + 2, { bold: true, size: 11, color: C.navy, width: 300 });
    write(ORG.ar, tx, top + 17, { bold: true, size: 11, color: C.navy, width: 300, align: 'left' });
    write(ORG.unitEn, tx, top + 35, { size: 8, color: C.muted, width: 100 });
    doc.font('R').fontSize(8);
    write(ORG.unitAr, tx + doc.widthOfString(ORG.unitEn) + 8, top + 33, { size: 8, color: C.muted, width: 120, align: 'left' });
    if (qr) {
      doc.image(qr, W - M - 62, top - 2, { width: 62 });
      write('Scan to verify', W - M - 140, top + 44, { size: 7, color: C.muted, width: 74, align: 'right' });
      write(code, W - M - 140, top + 53, { size: 7, color: C.navy, bold: true, width: 74, align: 'right' });
    }
    // Title block
    const ty = top + 70;
    doc.rect(M, ty, CW, 40).fill(C.band);
    doc.rect(M, ty, 4, 40).fill(C.navy);
    let tsize = 13;
    doc.font('B');
    while (tsize > 9 && doc.fontSize(tsize).widthOfString(opts.titleEn) > CW * 0.6) tsize -= 0.5;
    write(opts.titleEn, M + 14, ty + 6, { bold: true, size: tsize, color: C.navyDark, width: CW * 0.62 });
    write(opts.titleAr, M + CW * 0.62, ty + 4, { bold: true, size: 12, color: C.navyDark, width: CW * 0.38 - 12, align: 'right' });
    const meta = [opts.reference && `Ref. ${opts.reference}`, `Issued ${dateTimeEn(issued)}`].filter(Boolean).join('   ·   ');
    write(meta, M + 14, ty + 24, { size: 8, color: C.muted, width: CW - 28 });
    if (opts.status) {
      const st = label(opts.status);
      const color = /complet|approv|verif|issued|valid|paid/i.test(opts.status) ? C.ok : /reject|return|fail|cancel/i.test(opts.status) ? C.bad : C.warn;
      doc.font('B').fontSize(8);
      const w = doc.widthOfString(st) + 16;
      doc.roundedRect(M + CW - w - 10, ty + 22, w, 13, 6.5).lineWidth(0.8).strokeColor(color).stroke();
      write(st, M + CW - w - 10, ty + 24.5, { bold: true, size: 8, color, width: w, align: 'center' });
    }
  };

  const footer = (i, total) => {
    const fy = doc.page.height - 50;
    doc.moveTo(M, fy).lineTo(W - M, fy).lineWidth(0.5).strokeColor(C.line).stroke();
    const saveBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    write(`${ORG.en} — ${ORG.unitEn}`, M, fy + 6, { size: 7, color: C.muted, width: CW / 2 });
    write(ORG.address, M, fy + 16, { size: 6.5, color: C.muted, width: CW * 0.7 });
    write(`Page ${i + 1} of ${total}`, W - M - 120, fy + 6, { size: 7, color: C.muted, width: 120, align: 'right' });
    if (verifyUrl) write(`Verify: ${verifyUrl}`, W - M - 260, fy + 16, { size: 6.5, color: C.muted, width: 260, align: 'right' });
    doc.page.margins.bottom = saveBottom;
  };

  doc.on('pageAdded', header);
  header();
  doc.x = M; doc.y = 150;

  const ensure = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) { doc.addPage(); doc.y = 150; } };

  const api = {
    doc, M, CW, write, heightOf, ensure, code, verifyUrl,
    section(en, ar) {
      ensure(40);
      doc.y += 8;
      const y = doc.y;
      write(en, M, y, { bold: true, size: 10.5, color: C.navy, width: CW / 2 });
      if (ar) write(ar, M + CW / 2, y - 2, { bold: true, size: 10.5, color: C.navy, width: CW / 2, align: 'right' });
      doc.moveTo(M, y + 17).lineTo(M + CW, y + 17).lineWidth(1).strokeColor(C.navy).stroke();
      doc.y = y + 24;
    },
    // rows: [label, value] — rendered in `cols` columns.
    grid(rows, cols = 2) {
      const colW = CW / cols;
      const items = rows.filter((r) => r && r[1] !== undefined);
      for (let i = 0; i < items.length; i += cols) {
        const slice = items.slice(i, i + cols);
        const h = Math.max(...slice.map(([, v]) => heightOf(v === '' || v == null ? '—' : v, { width: colW - 14, size: 9.5 }))) + 16;
        ensure(h);
        const y = doc.y;
        slice.forEach(([k, v], j) => {
          write(k, M + j * colW, y, { size: 7.5, color: C.muted, width: colW - 14 });
          write(v === '' || v == null ? '—' : v, M + j * colW, y + 10, { size: 9.5, width: colW - 14 });
        });
        doc.y = y + h;
      }
      doc.y += 2;
    },
    // columns: [{ key, label, width (fraction), align }]
    table(columns, rows, { totals, empty = 'No records.' } = {}) {
      const widths = columns.map((c) => (c.width || 1 / columns.length) * CW);
      const drawHead = () => {
        ensure(22);
        const y = doc.y;
        doc.rect(M, y, CW, 18).fill(C.navy);
        let x = M;
        columns.forEach((c, i) => { write(c.label, x + 5, y + 4.5, { bold: true, size: 7.5, color: '#ffffff', width: widths[i] - 10, align: c.align || 'left' }); x += widths[i]; });
        doc.y = y + 18;
      };
      drawHead();
      if (!rows.length) { write(empty, M + 5, doc.y + 6, { size: 8.5, color: C.muted, width: CW - 10 }); doc.y += 24; return; }
      const drawRow = (r, idx, bold) => {
        const cells = columns.map((c) => (c.format ? c.format(r[c.key], r) : r[c.key]));
        const h = Math.max(...cells.map((v, i) => heightOf(v === '' || v == null ? '—' : v, { width: widths[i] - 10, size: 8.5 }))) + 9;
        if (doc.y + h > doc.page.height - doc.page.margins.bottom) { doc.addPage(); doc.y = 150; drawHead(); }
        const y = doc.y;
        if (bold) doc.rect(M, y, CW, h).fill(C.band); else if (idx % 2) doc.rect(M, y, CW, h).fill(C.zebra);
        let x = M;
        cells.forEach((v, i) => { write(v === '' || v == null ? '—' : v, x + 5, y + 4.5, { size: 8.5, bold, width: widths[i] - 10, align: columns[i].align || undefined }); x += widths[i]; });
        doc.moveTo(M, y + h).lineTo(M + CW, y + h).lineWidth(0.4).strokeColor(C.line).stroke();
        doc.y = y + h;
      };
      rows.forEach((r, i) => drawRow(r, i, false));
      if (totals) drawRow(totals, 0, true);
      doc.y += 6;
    },
    paragraph(str, o = {}) {
      const h = heightOf(str, { width: CW, size: o.size || 9.5, lineGap: 3 }) + 6;
      ensure(h);
      const y0 = doc.y;
      write(str, M, y0, { size: o.size || 9.5, width: CW, lineGap: 3, color: o.color, align: o.align, bold: o.bold });
      doc.y = y0 + h;
    },
    callout(en, ar, tone = C.teal) {
      const hE = heightOf(en, { width: CW - 24, size: 9 });
      const hA = ar ? heightOf(ar, { width: CW - 24, size: 9.5 }) : 0;
      const h = hE + hA + 18;
      ensure(h);
      const y = doc.y;
      doc.rect(M, y, CW, h).fill('#f0fdfa');
      doc.rect(M, y, 3, h).fill(tone);
      write(en, M + 12, y + 8, { size: 9, width: CW - 24 });
      if (ar) write(ar, M + 12, y + 10 + hE, { size: 9.5, width: CW - 24, align: 'right' });
      doc.y = y + h + 6;
    },
    /**
     * Signature blocks. Each signer: { role, name, userId, at, automatic, pending } (or a legacy [role, name] pair).
     * Draws the user's uploaded signature image if they have one, otherwise an electronic signature
     * (name in signature script) with the signing time. `seal: true` adds the KFAS electronic seal.
     */
    signature(signers, { seal = false, sealDate } = {}) {
      const list = signers.map((s) => (Array.isArray(s) ? { role: s[0], name: s[1] } : s));
      ensure(110);
      const y = doc.y + 16;
      const cols = list.length + (seal ? 1 : 0);
      const gap = 24;
      const w = (CW - gap * (cols - 1)) / cols;
      let bottom = y + 82;
      list.forEach((s, i) => {
        const x = M + i * (w + gap);
        if (s.name && !s.automatic && !s.pending) {
          doc.font('SIG').fontSize(20).fillColor(C.navyDark).text(s.name, x, y + 10, { width: w, lineBreak: false, ellipsis: false });
        }
        doc.moveTo(x, y + 46).lineTo(x + w, y + 46).lineWidth(0.6).strokeColor(C.muted).stroke();
        write(s.pending ? 'Not yet signed' : s.name, x, y + 50, { size: 9, bold: !s.pending, color: s.pending ? C.muted : C.text, width: w });
        write(s.role, x, y + 62, { size: 7.5, color: C.muted, width: w });
        const roleH = heightOf(s.role, { size: 7.5, width: w });
        const how = s.pending ? '' : s.automatic ? `Confirmed automatically${s.at ? ` · ${dateTimeEn(s.at)}` : ''}` : `Signed electronically${s.at ? ` · ${dateTimeEn(s.at)}` : ''}`;
        if (how) write(how, x, y + 64 + roleH, { size: 6.5, color: C.muted, width: w });
        bottom = Math.max(bottom, y + 76 + roleH);
      });
      if (seal) {
        const x = M + list.length * (w + gap);
        const r = 38; const cx = x + w / 2; const cy = y + 40;
        doc.save();
        doc.circle(cx, cy, r).lineWidth(1.6).strokeColor(C.navy).stroke();
        doc.circle(cx, cy, r - 4).lineWidth(0.6).strokeColor(C.navy).stroke();
        doc.image(LOGO, cx - 22, cy - 22, { width: 44 });
        doc.restore();
        write('ELECTRONIC SEAL', cx - r, cy + 2, { size: 6, bold: true, color: C.navy, width: r * 2, align: 'center' });
        write(dateEn(sealDate || issued), cx - r, cy + 10, { size: 6, color: C.navy, width: r * 2, align: 'center' });
        write(code || '', cx - r, cy + 18, { size: 5.5, color: C.muted, width: r * 2, align: 'center' });
      }
      doc.y = bottom + 10;
    },
    async done() {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) { doc.switchToPage(i); footer(i, range.count); }
      doc.end();
      return finished;
    },
  };
  return api;
}
