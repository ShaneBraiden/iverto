/**
 * Which ward the guardian is currently looking at.
 *
 * A guardian with more than one child on campus sees one ward at a time —
 * every screen in the guardian tab shell (approvals, history, ward, late
 * entries, profile) reads from here, so switching in the header re-points the
 * whole shell at the sibling in one move.
 *
 * The provider is mounted in `app/parent/_layout.tsx`, above the tabs, so the
 * selection survives moving between tabs.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { wards as allWards, type Ward } from '@/constants/sample';

type WardContextValue = {
  /** The ward currently in view. */
  ward: Ward;
  /** Everyone on this guardian's account. */
  wards: Ward[];
  /** Switch by roll number. Unknown roll numbers are ignored. */
  selectWard: (rollNo: string) => void;
  /** True when there is somebody to switch to. */
  hasSiblings: boolean;
};

const WardContext = createContext<WardContextValue | null>(null);

export function WardProvider({
  children,
  wards = allWards,
}: {
  children: React.ReactNode;
  wards?: Ward[];
}) {
  const [rollNo, setRollNo] = useState(wards[0].rollNo);

  const selectWard = useCallback(
    (next: string) => {
      if (wards.some((w) => w.rollNo === next)) setRollNo(next);
    },
    [wards]
  );

  const value = useMemo<WardContextValue>(
    () => ({
      ward: wards.find((w) => w.rollNo === rollNo) ?? wards[0],
      wards,
      selectWard,
      hasSiblings: wards.length > 1,
    }),
    [rollNo, wards, selectWard]
  );

  return <WardContext.Provider value={value}>{children}</WardContext.Provider>;
}

export function useWard() {
  const ctx = useContext(WardContext);
  if (!ctx) throw new Error('useWard must be used inside a <WardProvider>');
  return ctx;
}
