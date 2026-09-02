// @vitest-environment jsdom
/**
 * Phase 1 verification — browser walkthrough (checklist §11), executed headlessly.
 *
 * Renders the REAL pages (React Router + AuthProvider + the app's Supabase
 * client) in jsdom against the live kiosk-nonprod project, signing in as each
 * seeded account. This exercises the same code paths a person clicking through
 * the app would; what it cannot judge is pixel-level layout / visual polish.
 *
 * NOT part of `npm test`. Runs via `npm run test:integration`. Refuses to run
 * outside a non-production target.
 *
 * Prereq: migrations 0001-0004 applied + dev_seed.sql run on the non-prod
 * project, and .env pointing at it.
 */
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createElement as h, type ReactNode } from 'react';
import { render, screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { AuthProvider } from '@/modules/auth/auth-context';
import { RequireStaff } from '@/modules/auth/guards';
import { LoginPage } from '@/modules/auth/LoginPage';
import { AppLayout } from '@/components/AppLayout';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { ProspectListPage } from '@/modules/prospects/ProspectListPage';
import { ProspectCreatePage } from '@/modules/prospects/ProspectCreatePage';
import { ProspectDetailPage } from '@/modules/prospects/ProspectDetailPage';
import { ProspectEditPage } from '@/modules/prospects/ProspectEditPage';

// --------------------------------------------------------------------------
//  Environment guard
// --------------------------------------------------------------------------
const ENV: Record<string, string | undefined> = {
  ...process.env,
  ...(import.meta.env as unknown as Record<string, string | undefined>),
};
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY ?? '';
const APP_ENV = (ENV.VITE_APP_ENV ?? '').toLowerCase();
const PRODUCTION_PROJECT_REFS = ['amdahjmozvgcscpmmyoe'];
const PASSWORD = ENV.QA_PASSWORD ?? 'kiosk-dev-1234';
const EMAILS = {
  admin: ENV.QA_ADMIN_EMAIL ?? 'admin@example.test',
  salesA: ENV.QA_SALES_A_EMAIL ?? 'amaka@example.test',
  salesB: ENV.QA_SALES_B_EMAIL ?? 'david@example.test',
  deactivated: ENV.QA_DEACTIVATED_EMAIL ?? 'chidi@example.test',
  noStaff: ENV.QA_NOSTAFF_EMAIL ?? 'nostaff@example.test',
};

function assertSafeTarget(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Phase 1 UI harness: set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to a NON-PRODUCTION project.');
  }
  if (APP_ENV === 'production') throw new Error('Phase 1 UI harness: VITE_APP_ENV=production — refusing to run.');
  for (const ref of PRODUCTION_PROJECT_REFS) {
    if (SUPABASE_URL.includes(ref)) throw new Error(`Phase 1 UI harness: URL points at production (${ref}) — refusing.`);
  }
}

// --------------------------------------------------------------------------
//  Test tree — mirrors src/App.tsx (rebuilt so each render gets a fresh
//  QueryClient + MemoryRouter, no cross-user cache bleed).
// --------------------------------------------------------------------------
function Protected(): ReactNode {
  return h(
    RequireStaff,
    null,
    h(
      AppLayout,
      null,
      h(
        Routes,
        null,
        h(Route, { path: '/', element: h(DashboardPage) }),
        h(Route, { path: '/prospects', element: h(ProspectListPage) }),
        h(Route, { path: '/prospects/new', element: h(ProspectCreatePage) }),
        h(Route, { path: '/prospects/:id', element: h(ProspectDetailPage) }),
        h(Route, { path: '/prospects/:id/edit', element: h(ProspectEditPage) }),
        h(Route, { path: '*', element: h(Navigate, { to: '/', replace: true }) }),
      ),
    ),
  );
}

function renderApp(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(
          AuthProvider,
          null,
          h(
            Routes,
            null,
            h(Route, { path: '/login', element: h(LoginPage) }),
            h(Route, { path: '/*', element: h(Protected) }),
          ),
        ),
      ),
    ),
  );
}

async function signInAs(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message} — run dev_seed.sql first`);
}

/** Wait for the create form's async duplicate check to finish (button re-enables). */
async function settleDuplicateCheck(): Promise<void> {
  await waitFor(
    () => {
      expect(screen.queryByText('Checking for duplicates…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create prospect|Override & create/ })).not.toBeDisabled();
    },
    { timeout: 10000 },
  );
}

/**
 * Drive the New-prospect form to a created prospect's detail page.
 * Assumes the form is already rendered.
 */
async function createProspectViaUi(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  phoneLeadDigits = '0703',
): Promise<void> {
  await user.type(screen.getByLabelText('Business name *'), name);
  await user.type(screen.getByLabelText('Phone'), `${phoneLeadDigits}${String(Date.now()).slice(-7)}`);
  // Run the duplicate check explicitly (deterministic; no reliance on blur), then submit.
  await user.click(screen.getByRole('button', { name: 'Check duplicates' }));
  await settleDuplicateCheck();
  fireEvent.submit(document.querySelector('form.card') as HTMLFormElement);
  await screen.findByRole('heading', { name }, { timeout: 12000 });
}

/** Wait for AuthProvider's initial getSession() and any page loader to settle. */
async function waitForLoaded(): Promise<void> {
  await waitFor(
    () => {
      expect(screen.queryAllByText('Loading…')).toHaveLength(0);
      expect(screen.queryAllByText('Loading prospects…')).toHaveLength(0);
    },
    { timeout: 8000 },
  );
}

afterEach(async () => {
  cleanup();
  await supabase.auth.signOut();
});

/** Delete the "UI …" prospects this file created (as admin). */
afterAll(async () => {
  const admin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'crm' },
  });
  const s = await admin.auth.signInWithPassword({ email: EMAILS.admin, password: PASSWORD });
  if (s.error) return;
  const rows = await admin.from('prospects').select('id').like('business_name', 'UI %');
  for (const row of rows.data ?? []) {
    await admin.from('prospects').delete().eq('id', row.id);
  }
  await admin.auth.signOut();
});

// --------------------------------------------------------------------------
//  Fixture ids (fetched with an independent admin client)
// --------------------------------------------------------------------------
interface Fixtures {
  amakaId: string;
  davidId: string;
  amakaProspectId: string;
  amakaProspectName: string;
  davidProspectId: string;
  davidProspectName: string;
  /** An instagram handle present on a seeded prospect, for the dup-warning test. */
  seededInstagram: string;
}
let F: Fixtures;

beforeAll(async () => {
  assertSafeTarget();
  const admin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'crm' },
  });
  const signIn = await admin.auth.signInWithPassword({ email: EMAILS.admin, password: PASSWORD });
  if (signIn.error) throw new Error(`admin sign-in failed: ${signIn.error.message}`);

  const staff = await admin.from('staff').select('id, email');
  const amakaId = (staff.data ?? []).find((s) => s.email === EMAILS.salesA)?.id as string;
  const davidId = (staff.data ?? []).find((s) => s.email === EMAILS.salesB)?.id as string;

  const amakaProspect = await admin
    .from('prospects')
    .select('id, business_name, instagram_handle')
    .eq('assigned_salesperson_id', amakaId)
    .not('instagram_handle', 'is', null)
    .limit(1)
    .single();
  const davidProspect = await admin
    .from('prospects')
    .select('id, business_name')
    .eq('assigned_salesperson_id', davidId)
    .limit(1)
    .single();

  F = {
    amakaId,
    davidId,
    amakaProspectId: amakaProspect.data!.id as string,
    amakaProspectName: amakaProspect.data!.business_name as string,
    davidProspectId: davidProspect.data!.id as string,
    davidProspectName: davidProspect.data!.business_name as string,
    seededInstagram: amakaProspect.data!.instagram_handle as string,
  };
  await admin.auth.signOut();

  expect(F.amakaId, 'amaka staff id').toBeTruthy();
  expect(F.davidId, 'david staff id').toBeTruthy();
  expect(F.amakaProspectId, 'a prospect owned by amaka').toBeTruthy();
  expect(F.davidProspectId, 'a prospect owned by david').toBeTruthy();
  expect(F.seededInstagram, 'a seeded instagram handle').toBeTruthy();
}, 30000);

// ==========================================================================
//  §11.1 — signed out
// ==========================================================================
describe('§11.1  signed out', () => {
  it('an unauthenticated visit shows the login form', async () => {
    renderApp('/');
    await waitForLoaded();
    expect(await screen.findByRole('heading', { name: 'Kiosk Sales CRM' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to continue.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    // No app shell.
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});

// ==========================================================================
//  §11.3 / §11.4 — admin & salesperson login + dashboard scoping + shell
// ==========================================================================
describe('§11.3-4  login + dashboard scoping', () => {
  it('admin login works: app shell, env banner, "Dashboard" heading', async () => {
    await signInAs(EMAILS.admin);
    renderApp('/');
    await waitForLoaded();

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/Environment: DEVELOPMENT/i)).toBeInTheDocument();
    // "Sign out" appears in both the sidebar and the mobile top-nav.
    expect(screen.getAllByRole('button', { name: 'Sign out' }).length).toBeGreaterThan(0);
    // Admin dashboard shows a cross-team overview.
    expect(await screen.findByText('Overview')).toBeInTheDocument();
  });

  it('salesperson A login works: "My dashboard" heading (own scope)', async () => {
    await signInAs(EMAILS.salesA);
    renderApp('/');
    await waitForLoaded();
    expect(await screen.findByRole('heading', { name: 'My dashboard' })).toBeInTheDocument();
    // full_name shows in the sidebar and the dashboard header.
    expect((await screen.findAllByText('Amaka Nwosu')).length).toBeGreaterThan(0);
  });
});

// ==========================================================================
//  §11.3 / §11.4 — prospect list is RLS-scoped; admin-only controls
// ==========================================================================
describe('§11  prospect visibility', () => {
  it("salesperson B does not see salesperson A's prospect in the list", async () => {
    await signInAs(EMAILS.salesB);
    renderApp('/prospects');
    await waitForLoaded();
    await screen.findByRole('heading', { name: 'Prospects' });
    // wait for the list to load
    await waitFor(() => expect(screen.queryByText('Loading prospects…')).not.toBeInTheDocument());
    expect(screen.queryByText(F.amakaProspectName)).not.toBeInTheDocument();
    expect(await screen.findByText(F.davidProspectName)).toBeInTheDocument();
  });

  it("salesperson B opening A's prospect by URL gets a not-found / not-authorized panel", async () => {
    await signInAs(EMAILS.salesB);
    renderApp(`/prospects/${F.amakaProspectId}`);
    await waitForLoaded();
    expect(
      await screen.findByRole('heading', { name: /Not found|Not authorized/ }),
    ).toBeInTheDocument();
  });

  it('a salesperson does not see the admin Assignment card or Delete button on their own prospect', async () => {
    await signInAs(EMAILS.salesA);
    renderApp(`/prospects/${F.amakaProspectId}`);
    await waitForLoaded();
    expect(await screen.findByRole('heading', { name: F.amakaProspectName })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Assignment (admin)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('an admin sees the Assignment card and Delete button on any prospect', async () => {
    await signInAs(EMAILS.admin);
    renderApp(`/prospects/${F.amakaProspectId}`);
    await waitForLoaded();
    expect(await screen.findByRole('heading', { name: F.amakaProspectName })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Assignment (admin)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});

// ==========================================================================
//  §11.2 — no-staff and deactivated are blocked
// ==========================================================================
describe('§11.2  blocked accounts', () => {
  it('a no-staff user is bounced to login with the "not set up as CRM staff" message', async () => {
    await signInAs(EMAILS.noStaff);
    renderApp('/');
    await waitForLoaded();
    expect(await screen.findByText(/not set up as CRM staff/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('a deactivated staff member is blocked the same way', async () => {
    await signInAs(EMAILS.deactivated);
    renderApp('/');
    await waitForLoaded();
    expect(await screen.findByText(/not set up as CRM staff/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
  });
});

// ==========================================================================
//  §11.3 — create prospect + duplicate warning
// ==========================================================================
describe('§11.3  create prospect + duplicate warning', () => {
  it('shows a blocking duplicate warning for a seeded instagram handle and keeps a non-admin from creating', async () => {
    const user = userEvent.setup();
    await signInAs(EMAILS.salesA);
    renderApp('/prospects/new');
    await waitForLoaded();
    await screen.findByRole('heading', { name: 'New prospect' });

    await user.type(screen.getByLabelText('Business name *'), `UI walkthrough ${Date.now()}`);
    const ig = screen.getByLabelText('Instagram');
    await user.type(ig, F.seededInstagram);
    await user.tab(); // blur → runs the duplicate check

    const warning = await screen.findByText(/already exists/i, {}, { timeout: 8000 });
    expect(warning).toBeInTheDocument();
    expect(screen.getByText(/Ask an admin to create this/i)).toBeInTheDocument();
    // "Create" is disabled for a non-admin when blocked.
    expect(screen.getByRole('button', { name: /Create prospect|Override & create/ })).toBeDisabled();
  });

  it('creates a prospect with a fresh identifier and lands on its detail page', async () => {
    const user = userEvent.setup();
    await signInAs(EMAILS.salesA);
    renderApp('/prospects/new');
    await waitForLoaded();
    await screen.findByRole('heading', { name: 'New prospect' });

    const name = `UI new ${Date.now().toString(36)}`;
    await createProspectViaUi(user, name, '0705');

    expect(await screen.findByRole('heading', { name }, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Pipeline' })).toBeInTheDocument();
    // Timeline has the "Prospect created" activity.
    expect(await screen.findByText('Prospect created', { selector: 'strong' })).toBeInTheDocument();
  });
});

// ==========================================================================
//  §11.3 — edit prospect
// ==========================================================================
describe('§11.3  edit prospect', () => {
  it('pre-fills the edit form, saves a change, and returns to the detail page', async () => {
    const user = userEvent.setup();
    await signInAs(EMAILS.salesA);
    renderApp(`/prospects/${F.amakaProspectId}/edit`);
    await waitForLoaded();

    expect(await screen.findByRole('heading', { name: `Edit ${F.amakaProspectName}` })).toBeInTheDocument();

    const note = screen.getByLabelText('Follow-up note') as HTMLTextAreaElement;
    const newNote = `UI edit ${Date.now()}`;
    await user.clear(note);
    await user.type(note, newNote);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // Back on the detail page with the new value.
    expect(await screen.findByRole('heading', { name: F.amakaProspectName }, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText(newNote)).toBeInTheDocument();
  });
});

// ==========================================================================
//  §11.3 — status change + activity log update the timeline
// ==========================================================================
describe('§11.3  status change + activity log', () => {
  it('a status change adds a "Status … ->" entry to the timeline', async () => {
    const user = userEvent.setup();
    await signInAs(EMAILS.salesA);
    // Work on a prospect this rep just created, for isolation.
    renderApp('/prospects/new');
    await waitForLoaded();
    await screen.findByRole('heading', { name: 'New prospect' });
    const name = `UI status ${Date.now().toString(36)}`;
    await createProspectViaUi(user, name, '0704');

    // Change status new -> contacted (the status <select> is the first combobox on the page).
    const statusSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    await user.selectOptions(statusSelect, 'Contacted');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText(/Status new -> contacted/i, {}, { timeout: 10000 })).toBeInTheDocument();
  });

  it('logging a manual activity adds it to the timeline immediately', async () => {
    const user = userEvent.setup();
    await signInAs(EMAILS.salesA);
    renderApp(`/prospects/${F.amakaProspectId}`);
    await waitForLoaded();
    await screen.findByRole('heading', { name: F.amakaProspectName });

    const activitySelect = screen.getAllByRole('combobox').at(-1) as HTMLSelectElement;
    await user.selectOptions(activitySelect, 'DM sent');
    const descr = `UI dm ${Date.now()}`;
    await user.type(screen.getByPlaceholderText(/What happened/i), descr);
    await user.click(screen.getByRole('button', { name: 'Log' }));

    // Timeline renders the description in a span prefixed with " — ", so match loosely.
    expect(await screen.findByText(descr, { exact: false }, { timeout: 10000 })).toBeInTheDocument();
  });
});

// ==========================================================================
//  §11.5 / §11.6 — mobile layout + env banner (structural checks)
// ==========================================================================
describe('§11.5-6  responsive shell + environment banner', () => {
  it('the shell renders both the sidebar and the mobile top-nav, plus the non-prod banner', async () => {
    await signInAs(EMAILS.admin);
    const { container } = renderApp('/');
    await waitForLoaded();
    await screen.findByRole('heading', { name: 'Dashboard' });

    // Both nav variants are always in the DOM; CSS @media(max-width:760px) swaps them.
    expect(container.querySelector('.sidebar')).toBeInTheDocument();
    expect(container.querySelector('.mobile-nav')).toBeInTheDocument();
    const nav = container.querySelector('.mobile-nav') as HTMLElement;
    expect(within(nav).getByText('Dashboard')).toBeInTheDocument();
    expect(within(nav).getByText('Prospects')).toBeInTheDocument();

    // Environment banner (hidden only when VITE_APP_ENV === 'production').
    expect(screen.getByText(/Environment: DEVELOPMENT/i)).toBeInTheDocument();
  });
});
