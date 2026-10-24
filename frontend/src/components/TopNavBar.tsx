import { NavLink, useParams } from 'react-router-dom';
import brandMark from '../assets/figma/664bf.svg';
import css from './TopNavBar.module.css';

type Active = 'workspace' | 'learn' | null;

export function TopNavBar({ active }: { active: Active }) {
  const { id } = useParams();
  const cls = (k: Active) => (k === active ? `${css.link} ${css.active}` : css.link);
  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>
        <img src={brandMark} alt="" width={19} height={20} />
        NeuroVision
      </NavLink>
      <nav className={css.nav} aria-label="Main">
        <NavLink to={id ? `/jobs/${id}/mri` : '/upload'} className={cls('workspace')}>MRI Workspace</NavLink>
        <NavLink to="/learn" className={cls('learn')}>Learning Mode</NavLink>
      </nav>
      <div className={css.chips}>
        <button className={css.chip} disabled title="Gestures arrive with ticket E1">Gestures off</button>
      </div>
    </header>
  );
}
