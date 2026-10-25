import { useViewer } from '../actions/store';
import css from './StatusPill.module.css';

export function StatusPill() {
  const mode = useViewer((s) => s.mode);
  const explode = useViewer((s) => s.explodeAmount);
  return (
    <div className={css.pill} role="status">
      <span className={css.title}>{mode === 'xray' ? 'X-Ray' : 'Solid'}</span>
      <span className={css.sep} />
      <span className={css.detail}>Explode {Math.round(explode * 100)}%</span>
    </div>
  );
}
