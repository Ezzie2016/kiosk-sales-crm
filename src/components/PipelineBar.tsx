import { FUNNEL_STAGES, PIPELINE_STATUS_LABEL, type PipelineStatus } from '@/constants/pipeline';

/**
 * Visual status progression: NEW → CONTACTED → REPLIED → DEMO → TRIAL → PAID
 * (spec §13). A lost prospect shows every stage it had reached plus a LOST cap.
 */
export function PipelineBar({ status }: { status: PipelineStatus }) {
  const isLost = status === 'lost';
  const currentIndex = isLost ? FUNNEL_STAGES.length : FUNNEL_STAGES.indexOf(status as (typeof FUNNEL_STAGES)[number]);

  return (
    <div className="pipeline-bar" role="img" aria-label={`Pipeline status: ${PIPELINE_STATUS_LABEL[status]}`}>
      {FUNNEL_STAGES.map((stage, i) => (
        <div
          key={stage}
          className={['step', i <= currentIndex ? 'reached' : '', stage === status ? 'current' : ''].join(' ').trim()}
        >
          {PIPELINE_STATUS_LABEL[stage]}
        </div>
      ))}
      {isLost && <div className="step lost current">{PIPELINE_STATUS_LABEL.lost}</div>}
    </div>
  );
}
