import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardRepository } from './dashboard-repository';
import {
  computeOverviewTotals,
  computePipelineCounts,
  computeTodayCounts,
} from './dashboard-metrics';
import { FUNNEL_STAGES, PIPELINE_STATUS_LABEL } from '@/constants/pipeline';
import { Currency } from '@/components/Currency';
import { FunnelPanel } from '@/modules/analytics/FunnelPanel';
import { useAuth } from '@/modules/auth/use-auth';
import { startOfDayInTimeZone } from '@/lib/time';

export function DashboardPage() {
  const { staff } = useAuth();
  const sinceIso = useMemo(() => startOfDayInTimeZone(new Date()).toISOString(), []);
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', sinceIso],
    queryFn: () => dashboardRepository.load(sinceIso),
  });

  const isAdmin = staff?.role === 'admin';

  const metrics = useMemo(() => {
    if (!data) return null;
    return {
      pipeline: computePipelineCounts(data.statuses),
      totals: computeOverviewTotals(data.statuses, data.payments),
      today: computeTodayCounts({ prospects: data.prospectSnapshots, activities: data.recentActivities }),
    };
  }, [data]);

  return (
    <div className="content">
      <div className="page-head">
        <h1>{isAdmin ? 'Dashboard' : 'My dashboard'}</h1>
        <span className="muted">{staff?.full_name}</span>
      </div>

      {error && <div className="warn">{(error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}

      {metrics && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Overview</h3>
            <div className="grid cols-auto">
              <Stat label="Total prospects" value={metrics.totals.totalProspects} />
              <Stat label="Active" value={metrics.totals.active} />
              <Stat label="Paying merchants" value={metrics.totals.paying} />
              <Stat label="Lost" value={metrics.totals.lost} />
              <div className="stat">
                <span className="label">Confirmed revenue</span>
                <span className="value"><Currency amountKobo={metrics.totals.confirmedRevenueKobo} /></span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Pipeline</h3>
            <div className="grid cols-auto">
              {FUNNEL_STAGES.map((stage) => (
                <Stat key={stage} label={PIPELINE_STATUS_LABEL[stage]} value={metrics.pipeline[stage]} />
              ))}
              <Stat label={PIPELINE_STATUS_LABEL.lost} value={metrics.pipeline.lost} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Today</h3>
            <p className="muted" style={{ marginTop: 0 }}>Since midnight, Africa/Lagos.</p>
            <div className="grid cols-auto">
              <Stat label="Prospects added" value={metrics.today.prospectsAdded} />
              <Stat label="Prospects contacted" value={metrics.today.prospectsContacted} />
              <Stat label="Replies" value={metrics.today.repliesReceived} />
              <Stat label="Demos completed" value={metrics.today.demosCompleted} />
              <Stat label="New trials" value={metrics.today.trialsStarted} />
              <Stat label="New paying merchants" value={metrics.today.merchantsConverted} />
            </div>
          </div>

          <FunnelPanel scopeLabel={isAdmin ? 'All salespeople' : 'My prospects'} />

          <p style={{ fontSize: '0.9rem' }}>
            <Link to="/leaderboard">View the salesperson leaderboard →</Link>
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
