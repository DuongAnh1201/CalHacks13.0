import { LAYERS, type Layer } from '../viewer/layers';
import css from './Legend.module.css';

export function Legend({ available }: { available: Partial<Record<Layer, boolean>> }) {
  return (
    <ul className={css.legend} aria-label="Segmentation legend">
      {LAYERS.map((l) => (
        <li key={l.layer} className={available[l.layer] ? css.row : `${css.row} ${css.off}`}>
          <span className={css.swatch} style={{ background: l.color }} />
          {l.label}
          {!available[l.layer] && <span className={css.note}>not in this case</span>}
        </li>
      ))}
    </ul>
  );
}
