import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import brainIcon from '../assets/figma/664bf.svg';
import { ApiError, getReport } from '../api/client';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { ago, hrefOf, listWorkspaces, removeWorkspace, saveWorkspace, type Workspace } from '../home/workspaces';
import css from './Home.module.css';

const MRI = { label: 'MRI Workspace', hint: 'Upload a brain MRI and see the segmentation' };

export default function Home() {
  const [items, setItems] = useState(() => listWorkspaces());

  useEffect(() => {
    const ctl = new AbortController();
    for (const row of listWorkspaces()) {
      getReport(row.id, ctl.signal).catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        if (!(e instanceof ApiError) || e.status !== 404) return;
        removeWorkspace(row.id);
        setItems((list) => list.filter((x) => x.id !== row.id));
      });
    }
    return () => ctl.abort();
  }, []);

  const open = (w: Workspace) => saveWorkspace({ ...w, openedAt: Date.now() });

  return (
    <div className={css.page}>
      <TopNavBar />
      <div className={css.body}>
        <aside className={css.side}>
          <button className={css.new} popoverTarget="nv-new-menu">New workspace</button>
          <div id="nv-new-menu" popover="auto" className={css.menu}>
            <Link className={css.item} to="/upload"><b>{MRI.label}</b><small>{MRI.hint}</small></Link>
          </div>
        </aside>
        <main className={css.main}>
          <h1 className={css.title}>Workspaces</h1>
          {items.length === 0 ? (
            <div className={css.empty}>
              <p>No workspaces yet.</p>
              <Link className={css.cta} to="/upload">Upload your first MRI</Link>
            </div>
          ) : (
            <ul className={css.grid}>
              {items.map((w) => (
                <li key={w.id}>
                  <Link className={css.card} to={hrefOf(w)} onClick={() => open(w)}>
                    <div className={`${css.thumb} ${css.mri}`}>
                      <img src={brainIcon} alt="" width={40} height={40} />
                    </div>
                    <div className={css.meta}>
                      <p className={css.name}>{w.name}</p>
                      <p className={css.when}>{MRI.label} · opened {ago(w.openedAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
