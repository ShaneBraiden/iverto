/**
 * Re-runs a query when the screen comes back into focus — so returning from
 * the request form, or from a detail screen that approved something, shows the
 * new state rather than the state the list was left in.
 *
 * The first focus is skipped: `useQuery` has already fetched by then.
 */
import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

export function useRefetchOnFocus(refetch: () => void) {
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch])
  );
}
