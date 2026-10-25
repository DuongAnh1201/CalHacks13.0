import { useState } from 'react';
import css from './BrainFact.module.css';
import { factFor, type FactCategory } from './facts';
import { tilt, untilt } from './tilt';

const TONE: Record<FactCategory, string> = {
  'Tumor biology': css.tumor,
  'MRI imaging': css.mri,
  Neuroanatomy: css.anatomy,
  Segmentation: css.segmentation,
};

/** One sourced fact per California day (facts.ts), the same for everyone. */
export function BrainFact() {
  const [now] = useState(() => new Date());
  const fact = factFor(now);
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' }).format(now);
  return (
    <section className={`${css.fact} ${css.tilt}`} aria-labelledby="brain-fact" onPointerMove={tilt} onPointerLeave={untilt}>
      <div className={`${css.aside} ${css.parallax}`}>
        <h2 id="brain-fact" className={css.heading}>Today’s brain fact</h2>
        <p className={css.date}><time dateTime={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now)}>{date}</time></p>
        <p className={`${css.category} ${TONE[fact.category]}`}>{fact.category}</p>
      </div>
      <div className={`${css.main} ${css.shift}`}>
        <p className={css.title}>{fact.title}</p>
        <p className={css.body}>{fact.body}</p>
        <a className={css.source} href={fact.source.url} target="_blank" rel="noreferrer">Learn more from {fact.source.label}</a>
      </div>
    </section>
  );
}
