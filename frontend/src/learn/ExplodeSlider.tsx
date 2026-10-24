import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import css from './ExplodeSlider.module.css';

const TICKS = [0, 25, 50, 75, 100];

export function ExplodeSlider() {
  const v = Math.round(useViewer((s) => s.explodeAmount) * 100);
  const set = (p: number) => dispatch({ type: 'setExplosion', value: p / 100 }, 'pointer');
  return (
    <div className={css.card}>
      <div className={css.head}><span>Explode</span><span className={css.mono}>{v}%</span></div>
      <input className={css.range} type="range" min={0} max={100} value={v} aria-label="Explode amount"
        style={{ ['--fill' as string]: `${v}%` }} onChange={(e) => set(Number(e.target.value))} />
      <div className={css.ticks}>
        {TICKS.map((t) => <button key={t} className={v === t ? `${css.tick} ${css.on}` : css.tick} onClick={() => set(t)}>{t}%</button>)}
      </div>
    </div>
  );
}
