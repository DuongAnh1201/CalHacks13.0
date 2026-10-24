import css from './FlowStepper.module.css';

const STEPS = [
  { n: 1 as const, label: 'Upload MRI' },
  { n: 2 as const, label: 'Segment & review' },
  { n: 3 as const, label: 'MRI workspace' },
];

export function FlowStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className={css.stepper} aria-label="Progress">
      {STEPS.map((s, i) => {
        const state = s.n < step ? 'done' : s.n === step ? 'current' : 'future';
        return (
          <li key={s.n} className={css.item} aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className={css.connector} aria-hidden="true" />}
            <span className={`${css.pill} ${css[state]}`}>
              <span className={css.index}>{state === 'done' ? '✓' : s.n}</span>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
