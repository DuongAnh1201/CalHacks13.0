import { useEffect, useState } from 'react';
import { getHealth } from '../api/client';
import dot from '../assets/figma/1b654.svg';
import css from './BackendBanner.module.css';

export function BackendBanner() {
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking');
  useEffect(() => {
    const ac = new AbortController();
    getHealth(ac.signal).then((h) => setState(h.ok ? 'online' : 'offline')).catch(() => {
      if (!ac.signal.aborted) setState('offline');
    });
    return () => ac.abort();
  }, []);
  if (state === 'checking') return null;
  return state === 'online'
    ? <p className={`${css.banner} ${css.ok}`} role="status"><img src={dot} alt="" width={6} height={6} />Backend online</p>
    : <p className={`${css.banner} ${css.off}`} role="alert">Backend offline — start <code>docker compose up</code></p>;
}
