import { NavLink } from 'react-router-dom';
import brandMark from '../assets/figma/664bf.svg';
import { ShareControls } from '../share/ShareControls';
import css from './TopNavBar.module.css';

export function TopNavBar() {
  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>
        <img src={brandMark} alt="" width={19} height={20} />
        Lobe
      </NavLink>
      <nav className={css.links} aria-label="Main">
        <NavLink to="/explore" className={({ isActive }) => (isActive ? `${css.link} ${css.on}` : css.link)}>Explore</NavLink>
        <NavLink to="/play" className={({ isActive }) => (isActive ? `${css.link} ${css.on}` : css.link)}>Games</NavLink>
        <NavLink to="/upload" className={({ isActive }) => (isActive ? `${css.link} ${css.on}` : css.link)}>Upload</NavLink>
      </nav>
      <ShareControls css={css} />
    </header>
  );
}
