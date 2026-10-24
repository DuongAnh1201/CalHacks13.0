import { useEffect, useMemo, useState } from 'react';
import { dispatch, viewEvents } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import eyeOff from '../assets/figma/73f19.svg';
import { GROUP_LABEL, type Atlas } from '../viewer/anatomy';
import { filterStructures, groupStructures } from './filter';
import css from './StructureTree.module.css';

interface Props { atlas: Atlas; colors: Record<string, string>; missing: ReadonlySet<string> }

export function StructureTree({ atlas, colors, missing }: Props) {
  const [q, setQ] = useState('');
  const selected = useViewer((s) => s.selectedStructure);
  const hiddenMap = useViewer((s) => s.hiddenStructures);
  useEffect(() => {
    const clear = () => setQ('');
    viewEvents.addEventListener('reset', clear);
    return () => viewEvents.removeEventListener('reset', clear);
  }, []);
  const groups = useMemo(() => groupStructures(filterStructures(atlas.structures, q)), [atlas, q]);
  return (
    <aside className={css.card} aria-label="Brain structures">
      <h2 className={css.heading}>Structures</h2>
      <input className={css.search} type="search" placeholder="Search structures" value={q}
        onChange={(e) => setQ(e.target.value)} aria-label="Search structures" />
      <div className={css.scroll}>
        {groups.map(([g, list]) => (
          <section key={g}>
            <h3 className={css.group}>{GROUP_LABEL[g]}</h3>
            <ul className={css.list}>
              {list.map((s) => {
                const hidden = !!hiddenMap[s.id];
                return (
                  <li key={s.id} className={s.id === selected ? `${css.row} ${css.selected}` : css.row}>
                    <button className={css.name} disabled={missing.has(s.id)} aria-current={s.id === selected}
                      onClick={() => dispatch({ type: 'selectStructure', id: s.id }, 'pointer')}>
                      <span className={css.dot} style={{ background: colors[s.id] }} />
                      {s.name}
                      {s.side !== 'midline' && <span className={css.side}>{s.side === 'left' ? 'L' : 'R'}</span>}
                    </button>
                    <button className={hidden ? `${css.eye} ${css.eyeOff}` : css.eye} aria-pressed={!hidden}
                      aria-label={`${hidden ? 'Show' : 'Hide'} ${s.name} ${s.side}`} disabled={missing.has(s.id)}
                      onClick={() => dispatch({ type: 'setStructureVisible', id: s.id, visible: hidden }, 'pointer')}>
                      <img src={eyeOff} alt="" width={16} height={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className={css.credit}>
        Geometry: {atlas.source.atlas} atlas, {atlas.source.license}, doi:{atlas.source.doi}. Template brain (MNI-ICBM2009c), not a patient scan.
      </p>
    </aside>
  );
}
