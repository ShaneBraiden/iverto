/**
 * Minimal data-fetching hooks — enough for this app without pulling in a
 * cache library. Every screen gets the same four-state contract:
 * loading / error / empty / data, plus `refetch`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';

export type QueryResult<T> = {
  data: T | undefined;
  error: Error | null;
  /** True on the first load only — refetches keep the previous data visible. */
  loading: boolean;
  refetching: boolean;
  refetch: () => void;
};

export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  /** Re-runs whenever one of these changes — same idea as a query key. */
  deps: readonly unknown[] = [],
  options: { enabled?: boolean } = {}
): QueryResult<T> {
  const enabled = options.enabled ?? true;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refetching, setRefetching] = useState(false);
  const [tick, setTick] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const loaded = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let alive = true;

    if (loaded.current) setRefetching(true);
    else setLoading(true);

    fetcherRef.current(controller.signal)
      .then((result) => {
        if (!alive) return;
        loaded.current = true;
        setData(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (!alive || err.name === 'AbortError') return;
        setError(err);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefetching(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refetching, refetch };
}

export type MutationResult<TArgs extends unknown[], TResult> = {
  mutate: (...args: TArgs) => Promise<TResult | undefined>;
  pending: boolean;
  error: Error | null;
  reset: () => void;
};

/**
 * For everything that writes: submit, approve, reject, cancel, apply branding.
 * Rejections are captured in `error` rather than thrown, so a button handler
 * can stay a one-liner.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: { onSuccess?: (result: TResult) => void; onError?: (error: Error) => void } = {}
): MutationResult<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      try {
        const result = await action(...args);
        if (alive.current) optionsRef.current.onSuccess?.(result);
        return result;
      } catch (err) {
        const e = err as Error;
        if (alive.current) {
          setError(e);
          optionsRef.current.onError?.(e);
        }
        return undefined;
      } finally {
        if (alive.current) setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action]
  );

  const reset = useCallback(() => setError(null), []);

  return { mutate, pending, error, reset };
}

/** Human-readable message for anything thrown by the client. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

/** The documented error code, for branching on a specific failure. */
export function errorCode(error: unknown) {
  return error instanceof ApiError ? error.code : undefined;
}

/**
 * The HTTP status, for branching on a failure the error *envelope* cannot
 * describe.
 *
 * `errorCode` reads `error` out of the documented envelope, which only exists
 * for routes the API actually implements. A route that has not been deployed
 * yet is answered by the framework, not the app — Nest sends
 * `{"error":"Not Found"}` rather than `{"error":"NOT_FOUND"}` — so feature
 * detection has to go by the status. See `mobile-api-additions.md`.
 */
export function errorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : undefined;
}

/* --------------------------------------------------------- Cursor paging */

export type PagedResult<T> = QueryResult<T[]> & {
  /** True while the next page is in flight. */
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
};

type Fetcher<T> = (
  cursor: string | undefined,
  signal: AbortSignal
) => Promise<{ items: T[]; nextCursor: string | null; hasMore: boolean }>;

/**
 * Every list in this API is cursor-paginated: pass `limit`, then hand back the
 * `nextCursor` you were given. This keeps the accumulated rows, so a screen
 * renders `data` and calls `loadMore` at the bottom without tracking cursors.
 *
 * Changing `deps` (a filter, a search term) resets the accumulation — the new
 * query's first page replaces the old list rather than appending to it.
 */
export function usePagedQuery<T>(
  fetcher: Fetcher<T>,
  deps: readonly unknown[] = [],
  options: { enabled?: boolean } = {}
): PagedResult<T> {
  const enabled = options.enabled ?? true;

  const [data, setData] = useState<T[] | undefined>(undefined);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tick, setTick] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const loaded = useRef(false);

  /* First page. Re-runs on any dep change, and drops whatever was accumulated
     under the previous filter. */
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let alive = true;

    if (loaded.current) setRefetching(true);
    else setLoading(true);

    fetcherRef.current(undefined, controller.signal)
      .then((page) => {
        if (!alive) return;
        loaded.current = true;
        setData(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setError(null);
      })
      .catch((err: Error) => {
        if (!alive || err.name === 'AbortError') return;
        setError(err);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefetching(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  /* Guards against a second call while one is already in flight — otherwise a
     fast scroll fires the same cursor twice and duplicates a page. */
  const fetchingMore = useRef(false);
  const loadMore = useCallback(() => {
    if (!cursor || !hasMore || fetchingMore.current) return;
    fetchingMore.current = true;
    setLoadingMore(true);

    const controller = new AbortController();
    fetcherRef.current(cursor, controller.signal)
      .then((page) => {
        setData((prev) => [...(prev ?? []), ...page.items]);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err);
      })
      .finally(() => {
        fetchingMore.current = false;
        setLoadingMore(false);
      });
  }, [cursor, hasMore]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refetching, refetch, loadingMore, hasMore, loadMore };
}

/** Adapts `{ data, nextCursor, hasMore }` to what `usePagedQuery` expects. */
export function fromPage<T>(page: {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}) {
  return { items: page.data ?? [], nextCursor: page.nextCursor, hasMore: page.hasMore };
}

/** Same, for the one endpoint that names its array `permissions`. */
export function fromParentPage<T>(page: {
  permissions: T[];
  nextCursor: string | null;
  hasMore: boolean;
}) {
  return { items: page.permissions ?? [], nextCursor: page.nextCursor, hasMore: page.hasMore };
}
