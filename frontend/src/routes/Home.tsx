import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { ago, hrefOf, listWorkspaces, saveWorkspace, type Workspace, type WorkspaceKind } from '../home/workspaces';
import css from './Home.module.css';

const KIND: Record<WorkspaceKind, { label: string; hint: string }> = {
  mri: { label: 'MRI Workspace', hint: 'Upload a brain MRI and see the segmentation' },
  learn: { label: 'Learning Mode', hint: 'Explore a labelled brain atlas' },
};
const FILTERS = [['all', 'All workspaces'], ['mri', 'MRI'], ['learn', 'Learning']] as const;

export default function Home() {
  const navigate = useNavigate();
  const [items] = useState(() => listWorkspaces());
  const [filter, setFilter] = useState<'all' | WorkspaceKind>('all');
  const shown = items.filter((w) => filter === 'all' || w.kind === filter);

  const newLearn = () => {
    const id = crypto.randomUUID().slice(0, 8);
    saveWorkspace({ id, kind: 'learn', name: 'Learning Mode', openedAt: Date.now() });
    navigate(`/learn/${id}`);
  };
  const open = (w: Workspace) => saveWorkspace({ ...w, openedAt: Date.now() });

  return (
    <div className={css.page}>
      <TopNavBar active={null} />
      <div className={css.body}>
        <aside className={css.side}>
          <button className={css.new} popoverTarget="nv-new-menu">New workspace</button>
          <div id="nv-new-menu" popover="auto" className={css.menu}>
            <Link className={css.item} to="/upload"><b>{KIND.mri.label}</b><small>{KIND.mri.hint}</small></Link>
            <button className={css.item} type="button" onClick={newLearn}><b>{KIND.learn.label}</b><small>{KIND.learn.hint}</small></button>
          </div>
          <nav className={css.filters} aria-label="Filter workspaces">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} className={css.filter} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </nav>
        </aside>
        <main className={css.main}>
          <h1 className={css.title}>Workspaces</h1>
          {shown.length === 0 ? (
            <div className={css.empty}>
              <p>No workspaces yet.</p>
              <Link className={css.cta} to="/upload">Upload your first MRI</Link>
              <button className={css.ghost} type="button" onClick={newLearn}>Open Learning Mode</button>
            </div>
          ) : (
            <ul className={css.grid}>
              {shown.map((w) => (
                <li key={w.id}>
                  <Link className={css.card} to={hrefOf(w)} onClick={() => open(w)}>
                    <div className={`${css.thumb} ${css[w.kind]}`} />
                    <div className={css.meta}>
                      <p className={css.name}>{w.name}</p>
                      <p className={css.when}>{KIND[w.kind].label} · opened {ago(w.openedAt)}</p>
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
