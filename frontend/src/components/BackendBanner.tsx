import { useEffect, useState } from 'react';
import { getHealth } from '../api/client';
import css from './BackendBanner.module.css';

export function BackendBanner() {
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking');
  useEffect(() => {
    const ac = new AbortController();
    let timer = 0;
    let stopped = false;
    const ping = () => {
      if (stopped) return;
      getHealth(ac.signal).then((h) => {
        if (ac.signal.aborted || stopped) return;
        if (h.ok) {
          stopped = true;
          window.clearInterval(timer);
          setState('online');
        } else setState('offline');
      }).catch(() => {
        if (!ac.signal.aborted && !stopped) setState('offline');
      });
    };
    timer = window.setInterval(ping, 3000);
    ping();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      ac.abort();
    };
  }, []);
  // Silent while the backend answers: only a problem is worth a line on the page.
  if (state !== 'offline') return null;
  return <p className={`${css.banner} ${css.off}`} role="alert">Backend offline — start <code>docker compose up</code></p>;
}
