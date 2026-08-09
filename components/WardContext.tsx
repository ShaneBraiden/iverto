/**
 * Which ward the guardian is currently looking at, and the approval queue
 * behind the whole guardian shell.
 *
 * A guardian with more than one child on campus sees one ward at a time —
 * every screen in the guardian tab shell (approvals, history, ward, late
 * entries, profile) reads from here, so switching in the header re-points the
 * whole shell at the sibling in one move.
 *
 * Two calls serve the entire shell:
 *   `GET /parent/children`     — the wards, each with its own `pendingApprovals`
 *   `GET /parent/permissions`  — everything still waiting, across all of them
 *
 * The per-ward queue, the "waiting under your other wards" nudge, the tab badge
 * and the counts in the switcher all derive from those two, so they cannot
 * disagree with each other.
 *
 * The provider is mounted in `app/parent/_layout.tsx`, above the tabs, so the
 * selection survives moving between tabs.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { parent as parentApi } from '@/lib/api/endpoints';
import { useQuery } from '@/lib/api/useQuery';
import type { Permission, Ward } from '@/types';

type WardContextValue = {
  /** The ward currently in view — null until the wards call answers. */
  ward: Ward | null;
  /** Everyone on this guardian's account. */
  wards: Ward[];
  /** Every request awaiting a decision, across all wards. */
  queue: Permission[];
  loading: boolean;
  error: Error | null;
  /** Re-runs both calls — used after approving or rejecting. */
  refresh: () => void;
  /** Switch by student id. Unknown ids are ignored. */
  selectWard: (studentId: string) => void;
  /** True when there is somebody to switch to. */
  hasSiblings: boolean;
  /** The requests waiting on this guardian for one ward. */
  pendingFor: (studentId: string) => Permission[];
  /** How many are waiting under every *other* ward. */
  pendingElsewhere: (studentId: string) => number;
};

const WardContext = createContext<WardContextValue | null>(null);

export function WardProvider({ children }: { children: React.ReactNode }) {
  const [studentId, setStudentId] = useState<string | null>(null);

  const wardsQuery = useQuery((signal) => parentApi.children(signal), []);
  /* `waiting_parent` is the only status this guardian can act on, so the queue
     asks for exactly that rather than filtering a broader page client-side. */
  const queueQuery = useQuery(
    (signal) => parentApi.permissions({ status: 'waiting_parent', limit: 50 }, signal),
    []
  );

  const wards = useMemo(() => wardsQuery.data ?? [], [wardsQuery.data]);
  const queue = useMemo(() => queueQuery.data?.permissions ?? [], [queueQuery.data]);

  const selectWard = useCallback(
    (next: string) => {
      if (wards.some((w) => w.id === next)) setStudentId(next);
    },
    [wards]
  );

  const refresh = useCallback(() => {
    wardsQuery.refetch();
    queueQuery.refetch();
  }, [wardsQuery.refetch, queueQuery.refetch]);

  const pendingFor = useCallback(
    (target: string) => queue.filter((p) => p.studentId === target),
    [queue]
  );

  const pendingElsewhere = useCallback(
    (target: string) => queue.filter((p) => p.studentId !== target).length,
    [queue]
  );

  const value = useMemo<WardContextValue>(
    () => ({
      /* Falls back to the first ward until one is picked, and again if the
         selected sibling disappears from the account. */
      ward: wards.find((w) => w.id === studentId) ?? wards[0] ?? null,
      wards,
      queue,
      loading: wardsQuery.loading || queueQuery.loading,
      error: wardsQuery.error ?? queueQuery.error,
      refresh,
      selectWard,
      hasSiblings: wards.length > 1,
      pendingFor,
      pendingElsewhere,
    }),
    [
      studentId,
      wards,
      queue,
      wardsQuery.loading,
      queueQuery.loading,
      wardsQuery.error,
      queueQuery.error,
      refresh,
      selectWard,
      pendingFor,
      pendingElsewhere,
    ]
  );

  return <WardContext.Provider value={value}>{children}</WardContext.Provider>;
}

export function useWard() {
  const ctx = useContext(WardContext);
  if (!ctx) throw new Error('useWard must be used inside a <WardProvider>');
  return ctx;
}
