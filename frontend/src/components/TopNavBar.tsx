import { NavLink } from 'react-router-dom';
import brandMark from '../assets/figma/664bf.svg';
import { ShareControls } from '../share/ShareControls';
import css from './TopNavBar.module.css';

export function TopNavBar() {
  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>
        <img src={brandMark} alt="" width={19} height={20} />
        Pons
      </NavLink>
      <ShareControls css={css} />
    </header>
  );
}
