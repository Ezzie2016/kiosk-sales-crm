/**
 * Prospect CSV export (spec §21). Pure — takes already-fetched, already-authorized
 * rows (RLS decides what the caller can see) and produces RFC-4180 CSV.
 *
 * Columns, in order (spec §21):
 *   Business, Contact, Phone, Instagram, WhatsApp, Category, Location, Source,
 *   Salesperson, Status, Created date, Last contacted, Next follow-up,
 *   Trial status, Payment status, Revenue
 */
import { BUSINESS_CATEGORY_LABEL } from '@/constants/categories';
import { PROSPECT_SOURCE_LABEL } from '@/constants/sources';
import { PIPELINE_STATUS_LABEL, type PipelineStatus } from '@/constants/pipeline';
import { PAYMENT_STATUS_LABEL, isRevenueCounting, type PaymentStatus } from '@/constants/payments';
import type { BusinessCategory } from '@/constants/categories';
import type { ProspectSource } from '@/constants/sources';

export const CSV_COLUMNS = [
  'Business',
  'Contact',
  'Phone',
  'Instagram',
  'WhatsApp',
  'Category',
  'Location',
  'Source',
  'Salesperson',
  'Status',
  'Created date',
  'Last contacted',
  'Next follow-up',
  'Trial status',
  'Payment status',
  'Revenue',
] as const;

export interface ExportProspect {
  id: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  instagramHandle: string | null;
  whatsappNumber: string | null;
  businessCategory: BusinessCategory;
  location: string | null;
  source: ProspectSource;
  ownerName: string | null;
  status: PipelineStatus;
  createdAt: string;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  trialStartedAt: string | null;
}

export interface ExportPayment {
  prospectId: string;
  status: PaymentStatus;
  amountKobo: number;
}

const DATE = (iso: string | null): string => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/** The single "payment status" cell: Confirmed wins, else the latest known, else empty. */
function paymentStatusCell(payments: ExportPayment[]): string {
  if (payments.length === 0) return '';
  if (payments.some((p) => p.status === 'confirmed')) return PAYMENT_STATUS_LABEL.confirmed;
  return PAYMENT_STATUS_LABEL[payments[0]!.status];
}

function revenueNaira(payments: ExportPayment[]): string {
  const kobo = payments.filter((p) => isRevenueCounting(p.status)).reduce((s, p) => s + p.amountKobo, 0);
  return kobo === 0 ? '' : (kobo / 100).toFixed(2);
}

export function buildExportRows(
  prospects: readonly ExportProspect[],
  payments: readonly ExportPayment[],
): string[][] {
  const byProspect = new Map<string, ExportPayment[]>();
  for (const pay of payments) {
    byProspect.set(pay.prospectId, [...(byProspect.get(pay.prospectId) ?? []), pay]);
  }

  return prospects.map((p) => {
    const pays = byProspect.get(p.id) ?? [];
    return [
      p.businessName,
      p.contactName ?? '',
      p.phone ?? '',
      p.instagramHandle ?? '',
      p.whatsappNumber ?? '',
      BUSINESS_CATEGORY_LABEL[p.businessCategory],
      p.location ?? '',
      PROSPECT_SOURCE_LABEL[p.source],
      p.ownerName ?? '',
      PIPELINE_STATUS_LABEL[p.status],
      DATE(p.createdAt),
      DATE(p.lastContactedAt),
      DATE(p.nextFollowUpAt),
      p.trialStartedAt ? `Started ${DATE(p.trialStartedAt)}` : '',
      paymentStatusCell(pays),
      revenueNaira(pays),
    ];
  });
}

/** RFC-4180: quote when a field contains ", comma or newline; escape " as "". CRLF rows. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(header: readonly string[], rows: readonly string[][]): string {
  const lines = [header, ...rows].map((row) => row.map((f) => csvField(f)).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function prospectsCsv(prospects: readonly ExportProspect[], payments: readonly ExportPayment[]): string {
  return toCsv(CSV_COLUMNS, buildExportRows(prospects, payments));
}

export function exportFileName(now: Date = new Date()): string {
  return `kiosk-prospects-${now.toISOString().slice(0, 10)}.csv`;
}
