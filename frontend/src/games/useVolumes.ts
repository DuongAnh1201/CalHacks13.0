import { useEffect, useState } from 'react';
import { loadVolume, type Volume } from './volume';

type State = { key: string; vols: Volume[] | null; error: string | null };

/** Loads several NIfTI volumes; `vols` is null while loading or after an error. */
export function useVolumes(urls: string[]): { vols: Volume[] | null; error: string | null; retry: () => void } {
  const key = urls.join('|');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ key: '', vols: null, error: null });
  useEffect(() => {
    let live = true;
    Promise.all(key.split('|').map(loadVolume))
      .then((vols) => { if (live) setState({ key, vols, error: null }); })
      .catch((e: unknown) => { if (live) setState({ key, vols: null, error: e instanceof Error ? e.message : 'Could not load the scan.' }); });
    return () => { live = false; };
  }, [key, attempt]);
  const current = state.key === key ? state : { vols: null, error: null };
  return { ...current, retry: () => setAttempt((n) => n + 1) };
}
