import { NavLink } from 'react-router-dom';
import brandMark from '../assets/figma/664bf.svg';
import css from './TopNavBar.module.css';

type Active = 'explore' | 'workspace' | 'learn' | null;

export function TopNavBar({ active }: { active: Active }) {
  const cls = (k: Active) => (k === active ? `${css.link} ${css.active}` : css.link);
  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>
        <img src={brandMark} alt="" width={19} height={20} />
        NeuroVision
      </NavLink>
      <nav className={css.nav} aria-label="Main">
        <NavLink to="/jobs/sample/explore" className={cls('explore')}>Explore</NavLink>
        <NavLink to="/jobs/sample/results" className={cls('workspace')}>MRI Workspace</NavLink>
        <NavLink to="/learn" className={cls('learn')}>Learning Mode</NavLink>
        <span className={css.link} aria-disabled="true">Help</span>
      </nav>
      <div className={css.chips}>
        <button className={css.chip} disabled title="Gestures arrive with ticket E1">Gestures off</button>
      </div>
    </header>
  );
}
