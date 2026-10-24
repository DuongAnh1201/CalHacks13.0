import { NavLink, useParams } from 'react-router-dom';
import brandMark from '../assets/figma/664bf.svg';
import css from './TopNavBar.module.css';

export function TopNavBar() {
  const { id, wsId } = useParams();
  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>
        <img src={brandMark} alt="" width={19} height={20} />
        NeuroVision
      </NavLink>
      {(id || wsId) && (
        <button className={css.share} type="button" disabled title="Sharing arrives with shared workspaces (W2)">Share</button>
      )}
    </header>
  );
}
