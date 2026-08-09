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

/* ------------------------------------------------------------ Error copy */

/**
 * What a failure looks like on screen.
 *
 * The server's own `message` is the right thing to show when it describes
 * something the user did — a validation failure, a duplicate request, a rule
 * they broke. It is the wrong thing to show for everything else: a dropped
 * connection surfaces as "Network request failed", a 500 as "Internal server
 * error", an unrouted path as "Cannot GET /v1/mobile/…". None of those tell
 * anyone what to do next, so those cases are worded here instead.
 */
export type ErrorCopy = {
  title: string;
  message: string;
  /** Ionicons name. */
  icon: string;
  /** False when trying the exact same thing again cannot possibly help. */
  canRetry: boolean;
};

export function errorCopy(error: unknown, fallback?: string): ErrorCopy {
  const status = errorStatus(error);
  const code = errorCode(error);
  const raw = error instanceof Error ? error.message : '';

  if (code === 'NETWORK' || status === 0) {
    return {
      title: "You're offline",
      message:
        "This device can't reach Iverto.ai right now. Check your Wi-Fi or mobile data, then try again.",
      icon: 'cloud-offline-outline',
      canRetry: true,
    };
  }

  if (code === 'TIMEOUT') {
    return {
      title: 'That took too long',
      message:
        'The server did not answer in time. It may be busy, or the connection may be weak — try again in a moment.',
      icon: 'time-outline',
      canRetry: true,
    };
  }

  if (status === 401 || code === 'UNAUTHORIZED') {
    return {
      title: 'Your session ended',
      message: 'You have been signed out. Sign in again to carry on.',
      icon: 'log-out-outline',
      canRetry: false,
    };
  }

  if (status === 403 || code === 'FORBIDDEN') {
    return {
      title: 'Not yours to see',
      message:
        "This account doesn't have access to that. If you think it should, the campus office can check your record.",
      icon: 'lock-closed-outline',
      canRetry: false,
    };
  }

  if (status === 404 || code === 'NOT_FOUND') {
    return {
      title: 'Not found',
      message: fallback ?? "That record isn't there any more. It may have been removed or cancelled.",
      icon: 'help-circle-outline',
      canRetry: false,
    };
  }

  if (status === 429 || code === 'TOO_MANY_REQUESTS') {
    return {
      title: 'Slow down a moment',
      message: 'That was sent a few too many times in a row. Give it five seconds and try again.',
      icon: 'hourglass-outline',
      canRetry: true,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      title: 'The server had a problem',
      message:
        "Nothing you did — the campus server failed to answer. It usually clears on its own; try again in a moment.",
      icon: 'server-outline',
      canRetry: true,
    };
  }

  /* Everything left is the server describing something concrete about this
     request, which is worth showing verbatim. */
  return {
    title: "Couldn't load this",
    message: raw || fallback || 'Something went wrong. Try again.',
    icon: 'alert-circle-outline',
    canRetry: true,
  };
}

/**
 * Human-readable message for anything thrown by the client.
 *
 * Goes through `errorCopy`, so an offline phone reads the same sentence
 * wherever the failure happens to surface — a full-screen error state, a note
 * under a form, or an alert after a button press.
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  return errorCopy(error, fallback).message;
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
