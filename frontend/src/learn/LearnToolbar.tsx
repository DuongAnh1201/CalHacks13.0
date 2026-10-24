import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import css from './LearnToolbar.module.css';

export function LearnToolbar() {
  const mode = useViewer((s) => s.mode);
  const opacity = useViewer((s) => s.brainOpacity);
  const hidden = useViewer((s) => s.hidden);
  const isolate = useViewer((s) => s.isolate);
  const selected = useViewer((s) => s.selectedStructure);
  const xray = mode === 'xray';
  return (
    <div className={css.bar} role="toolbar" aria-label="View controls">
      <div className={css.tabs} role="tablist" aria-label="Render mode">
        <button role="tab" aria-selected={!xray} className={css.tab} onClick={() => dispatch({ type: 'setMode', mode: 'whole' }, 'pointer')}>Solid</button>
        <button role="tab" aria-selected={xray} className={css.tab} onClick={() => dispatch({ type: 'setMode', mode: 'xray' }, 'pointer')}>X-Ray</button>
      </div>
      <label className={css.opacity}>
        Cortex
        <input type="range" min={0} max={100} value={Math.round(opacity * 100)} disabled={!xray} aria-label="Cortex opacity"
          onChange={(e) => dispatch({ type: 'setOpacity', value: Number(e.target.value) / 100 }, 'pointer')} />
        <span className={css.mono}>{Math.round(opacity * 100)}%</span>
      </label>
      <span className={css.divider} />
      {(['left', 'right'] as const).map((side) => (
        <button key={side} className={css.chip} aria-pressed={!hidden[side]} aria-label={`${side} hemisphere`}
          onClick={() => dispatch({ type: 'setHemisphereVisible', side, visible: hidden[side] }, 'pointer')}>
          {side === 'left' ? 'L' : 'R'}
        </button>
      ))}
      <button className={css.chip} aria-pressed={isolate} disabled={!selected}
        onClick={() => dispatch({ type: 'setIsolate', on: !isolate }, 'pointer')}>Isolate</button>
      <button className={css.chip} onClick={() => dispatch({ type: 'resetView' }, 'pointer')}>Reset</button>
    </div>
  );
}
