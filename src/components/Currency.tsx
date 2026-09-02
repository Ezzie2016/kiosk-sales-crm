import { formatKoboAmount } from '@/lib/format';

/**
 * Renders ₦ and the number as SEPARATE text nodes with a small gap.
 * Rendering them as one interpolated string triggers a font-kerning bug that
 * looks like a strikethrough through the ₦ (KIOSK Architecture Decision 6).
 */
export function Currency({ amountKobo, className }: { amountKobo: number; className?: string }) {
  return (
    <span className={className} style={{ whiteSpace: 'nowrap' }}>
      <span aria-hidden>₦</span>
      <span style={{ display: 'inline-block', width: 2 }} />
      <span className="num">{formatKoboAmount(amountKobo)}</span>
    </span>
  );
}
