import { describe, expect, it } from 'vitest';
import {
  buildExportRows,
  CSV_COLUMNS,
  exportFileName,
  prospectsCsv,
  toCsv,
  type ExportPayment,
  type ExportProspect,
} from './prospect-csv';

const prospect = (o: Partial<ExportProspect> & Pick<ExportProspect, 'id' | 'businessName'>): ExportProspect => ({
  contactName: null,
  phone: null,
  instagramHandle: null,
  whatsappNumber: null,
  businessCategory: 'provision_store',
  location: null,
  source: 'instagram',
  ownerName: null,
  status: 'new',
  createdAt: '2026-01-10T09:00:00Z',
  lastContactedAt: null,
  nextFollowUpAt: null,
  trialStartedAt: null,
  ...o,
});

describe('toCsv (RFC-4180)', () => {
  it('quotes fields containing a comma, quote or newline and escapes quotes', () => {
    const csv = toCsv(['A', 'B'], [['plain', 'has,comma'], ['say "hi"', 'line\nbreak']]);
    expect(csv).toBe('A,B\r\nplain,"has,comma"\r\n"say ""hi""","line\nbreak"\r\n');
  });

  it('emits a header row and CRLF line endings', () => {
    const csv = toCsv(['X'], [['1'], ['2']]);
    expect(csv.split('\r\n')).toEqual(['X', '1', '2', '']);
  });
});

describe('buildExportRows (spec §21 columns)', () => {
  it('maps a prospect to the 16 columns in order, with enum labels and ISO dates', () => {
    const rows = buildExportRows(
      [
        prospect({
          id: 'p1',
          businessName: 'Amaka Stores',
          contactName: 'Amaka',
          phone: '+2348030000001',
          instagramHandle: '@amaka',
          whatsappNumber: '+2348030000002',
          businessCategory: 'mini_mart',
          location: 'Lagos',
          source: 'referral',
          ownerName: 'David Okon',
          status: 'trial',
          createdAt: '2026-01-10T09:00:00Z',
          lastContactedAt: '2026-01-20T09:00:00Z',
          nextFollowUpAt: '2026-02-01T09:00:00Z',
          trialStartedAt: '2026-01-25T09:00:00Z',
        }),
      ],
      [
        { prospectId: 'p1', status: 'confirmed', amountKobo: 150000 },
        { prospectId: 'p1', status: 'pending', amountKobo: 50000 },
      ],
    );
    expect(rows[0]).toEqual([
      'Amaka Stores',
      'Amaka',
      '+2348030000001',
      '@amaka',
      '+2348030000002',
      'Mini Mart',
      'Lagos',
      'Referral',
      'David Okon',
      'Trial',
      '2026-01-10',
      '2026-01-20',
      '2026-02-01',
      'Started 2026-01-25',
      'Confirmed',
      '1500.00',
    ]);
  });

  it('leaves optional cells empty and revenue empty when nothing is confirmed', () => {
    const rows = buildExportRows(
      [prospect({ id: 'p2', businessName: 'Bare' })],
      [{ prospectId: 'p2', status: 'pending', amountKobo: 999999 }],
    );
    expect(rows[0]).toEqual([
      'Bare', '', '', '', '', 'Provision Store', '', 'Instagram', '', 'New',
      '2026-01-10', '', '', '', 'Pending', '',
    ]);
  });

  it('shows no payment status / revenue when a prospect has no payments', () => {
    const [row] = buildExportRows([prospect({ id: 'p3', businessName: 'NoPay' })], []);
    expect(row?.[14]).toBe(''); // Payment status
    expect(row?.[15]).toBe(''); // Revenue
  });

  it('sums only confirmed payments into revenue', () => {
    const [row] = buildExportRows(
      [prospect({ id: 'p4', businessName: 'Multi' })],
      [
        { prospectId: 'p4', status: 'confirmed', amountKobo: 100000 },
        { prospectId: 'p4', status: 'confirmed', amountKobo: 250000 },
        { prospectId: 'p4', status: 'refunded', amountKobo: 100000 },
      ] satisfies ExportPayment[],
    );
    expect(row?.[15]).toBe('3500.00');
  });
});

describe('prospectsCsv', () => {
  it('starts with the exact §21 header', () => {
    const csv = prospectsCsv([], []);
    expect(csv).toBe(CSV_COLUMNS.join(',') + '\r\n');
  });

  it('round-trips a business name containing a comma', () => {
    const csv = prospectsCsv([prospect({ id: 'x', businessName: 'Bola, Sons & Co' })], []);
    expect(csv).toContain('"Bola, Sons & Co"');
  });
});

describe('exportFileName', () => {
  it('is date-stamped', () => {
    expect(exportFileName(new Date('2026-09-02T10:00:00Z'))).toBe('kiosk-prospects-2026-09-02.csv');
  });
});
