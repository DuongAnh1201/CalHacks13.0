import type { PointerEvent } from 'react';

/** Card tilt for a mouse. Coarse pointers and reduced motion ignore the variables in CSS. */
export function tilt(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const b = el.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) return;
  const x = (e.clientX - b.left) / b.width - 0.5;
  const y = (e.clientY - b.top) / b.height - 0.5;
  el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
  el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  el.style.setProperty('--px', `${(x * 18).toFixed(1)}px`);
  el.style.setProperty('--py', `${(y * 14).toFixed(1)}px`);
}

export function untilt(e: PointerEvent<HTMLElement>) {
  const s = e.currentTarget.style;
  s.removeProperty('--ry');
  s.removeProperty('--rx');
  s.removeProperty('--px');
  s.removeProperty('--py');
}
