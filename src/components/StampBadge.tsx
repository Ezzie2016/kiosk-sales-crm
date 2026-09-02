import { PIPELINE_STATUS_LABEL, type PipelineStatus } from '@/constants/pipeline';

/**
 * Circular stamp-style status badge (KIOSK Design System — status indicators are
 * stamp badges, not pills or plain text).
 */
export function StampBadge({ status }: { status: PipelineStatus }) {
  return (
    <span className="stamp" style={{ color: `var(--status-${status})` }}>
      {PIPELINE_STATUS_LABEL[status]}
    </span>
  );
}
