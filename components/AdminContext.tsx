/**
 * The campus counters behind the admin shell.
 *
 * The tab badges and the overview tiles are the same numbers, so they come
 * from one call — mounted above the tabs in `app/admin/_layout.tsx` rather
 * than fetched once per screen.
 *
 * `GET /admin/stats` already carries `pendingProfileRequests` and
 * `openEmergencies`, so the shell needs nothing else to badge every tab.
 *
 * A warden is scoped to their assigned sites automatically; an admin sees the
 * whole tenant and can narrow to one site here, which every admin screen then
 * reads and passes along as `siteId`.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { admin as adminApi } from '@/lib/api/endpoints';
import { useQuery } from '@/lib/api/useQuery';
import { useAuth } from '@/lib/auth';
import type { AdminStats, Site } from '@/types';

type AdminContextValue = {
  stats: AdminStats | undefined;
  loading: boolean;
  error: Error | null;
  /** How many profile change requests are waiting on the admin. */
  pendingProfiles: number;
  /** Sites this account can act on. Empty for an admin who sees the tenant. */
  sites: Site[];
  /** The site filter, or undefined for "everything I can see". */
  siteId: string | undefined;
  setSiteId: (siteId: string | undefined) => void;
  refresh: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  const [siteId, setSiteId] = useState<string | undefined>(undefined);

  const stats = useQuery((signal) => adminApi.stats(siteId, signal), [siteId]);

  const refresh = useCallback(() => stats.refetch(), [stats.refetch]);

  const value = useMemo<AdminContextValue>(
    () => ({
      stats: stats.data,
      loading: stats.loading,
      error: stats.error,
      pendingProfiles: stats.data?.pendingProfileRequests ?? 0,
      sites: me?.assignedSites ?? [],
      siteId,
      setSiteId,
      refresh,
    }),
    [stats.data, stats.loading, stats.error, me?.assignedSites, siteId, refresh]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside an <AdminProvider>');
  return ctx;
}
