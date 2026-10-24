import disclaimer from '../assets/figma/541d2.svg';
import css from './Footer.module.css';

export function Footer() {
  return (
    <footer className={css.bar}>
      <p className={css.note}>
        <img src={disclaimer} alt="" width={13} height={13} />
        Educational visualization — not for diagnosis or surgical planning.
      </p>
      <div className={css.links}>
        <span>Regulatory Note</span>
        <span>Data Accuracy</span>
        <span>Documentation</span>
        <span className={css.guide}>Gesture Guide</span>
      </div>
    </footer>
  );
}
