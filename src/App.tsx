import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/modules/auth/auth-context';
import { RequireStaff } from '@/modules/auth/guards';
import { LoginPage } from '@/modules/auth/LoginPage';
import { AppLayout } from '@/components/AppLayout';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { ProspectListPage } from '@/modules/prospects/ProspectListPage';
import { ProspectCreatePage } from '@/modules/prospects/ProspectCreatePage';
import { ProspectDetailPage } from '@/modules/prospects/ProspectDetailPage';
import { ProspectEditPage } from '@/modules/prospects/ProspectEditPage';
import { LeaderboardPage } from '@/modules/analytics/LeaderboardPage';
import { FollowUpsPage } from '@/modules/followups/FollowUpsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

function Protected() {
  return (
    <RequireStaff>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/prospects" element={<ProspectListPage />} />
          <Route path="/prospects/new" element={<ProspectCreatePage />} />
          <Route path="/prospects/:id" element={<ProspectDetailPage />} />
          <Route path="/prospects/:id/edit" element={<ProspectEditPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </RequireStaff>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<Protected />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
