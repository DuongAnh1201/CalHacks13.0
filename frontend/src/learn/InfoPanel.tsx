import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { contentFor } from '../content';
import { displayName, GROUP_LABEL, SIDE_LABEL, type Atlas } from '../viewer/anatomy';
import css from './InfoPanel.module.css';

export function InfoPanel({ atlas, colors }: { atlas: Atlas; colors: Record<string, string> }) {
  const id = useViewer((s) => s.selectedStructure);
  const byId = new Map(atlas.structures.map((s) => [s.id, s]));
  const s = id ? byId.get(id) : undefined;
  if (!s) return <aside className={css.panel}><p className={css.empty}>Click any structure to learn about it.</p></aside>;
  const c = contentFor(s.id);
  return (
    <aside className={css.panel} aria-live="polite" aria-label="Structure details">
      <h2 className={css.title}>{s.name}</h2>
      <div className={css.chips}>
        <span className={css.chip}>{SIDE_LABEL[s.side]}</span>
        <span className={css.chip}><span className={css.dot} style={{ background: colors[s.id] }} />{GROUP_LABEL[s.group]}</span>
      </div>
      <dl className={css.facts}><dt>Volume</dt><dd className={css.mono}>{s.volumeCm3.toFixed(2)} cm³</dd></dl>
      {c && (
        <>
          <p>{c.description}</p>
          <h3 className={css.h3}>Key functions</h3>
          <ul className={css.list}>{c.functions.map((f) => <li key={f}>{f}</li>)}</ul>
          <h3 className={css.h3}>When damaged</h3>
          <p>{c.whenDamaged}</p>
        </>
      )}
      {s.neighbours.length > 0 && (
        <>
          <h3 className={css.h3}>Neighbours</h3>
          <div className={css.suggestions}>
            {s.neighbours.flatMap((n) => byId.get(n) ?? []).map((n) => (
              <button key={n.id} className={css.suggestion} onClick={() => dispatch({ type: 'selectStructure', id: n.id }, 'pointer')}>
                <span className={css.dot} style={{ background: colors[n.id] }} />{displayName(n)}
              </button>
            ))}
          </div>
        </>
      )}
      <p className={css.tag}>Educational · unreviewed</p>
    </aside>
  );
}
