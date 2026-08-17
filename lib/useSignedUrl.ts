/**
 * A storage key turned into something `<Image>` can actually render.
 *
 * Uploads come back from the API as opaque keys; the read link for one is a
 * separate call and lasts five minutes. Every screen that draws an uploaded
 * image therefore needs a resolve step, so it lives here once — along with the
 * decision that a failure is not worth surfacing. Callers draw a fallback.
 *
 * `ready` short-circuits the request entirely: where the API already sends a
 * URL beside the key (see `iconUrl`), pass it and nothing is fetched. That is
 * the cheap path, and the one to prefer as the server grows it.
 *
 * A branding `iconUrl` is not the five-minute kind — it is a permanent CDN
 * link where the branding bucket is public, and a seven-day signed one where
 * it is not, so it cannot expire mid-session. It is still re-read from the API
 * on each launch rather than persisted, because on a private bucket the string
 * itself does eventually die. The bytes behind it never change (every key ends
 * in a fresh UUID), so the platform image cache is free to hold them.
 */
import { useEffect, useState } from 'react';
import { uploads as uploadsApi } from '@/lib/api/endpoints';

export function useSignedUrl(key: string | null | undefined, ready?: string | null) {
  const [url, setUrl] = useState<string | null>(ready ?? null);

  useEffect(() => {
    if (ready) {
      setUrl(ready);
      return;
    }
    if (!key) {
      setUrl(null);
      return;
    }

    let alive = true;
    uploadsApi
      .signedUrl(key)
      .then((res) => {
        if (alive) setUrl(res?.url ?? null);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });

    return () => {
      alive = false;
    };
  }, [key, ready]);

  return url;
}
