import { useEffect, useRef, useState } from 'react';
import axialUrl from '../assets/home/axial.png';
import css from './ScanHero.module.css';
import { OUTLINES, SCAN } from './scanArt';

const A = OUTLINES.axial;
const [NX, NY, NZ] = SCAN.dims;
/** The tumor's centre on this slice, in screen voxels (rows flipped: anterior up). */
type Point = { x: number; y: number };
const HOME: Point = { x: SCAN.sagittalI, y: NY - 1 - SCAN.coronalJ };
const CENTRE: Point = { x: NX / 2, y: NY / 2 };
const EASE = 0.16;

type Region = 'Enhancing tumor' | 'Tumor core' | 'Edema' | 'Brain tissue' | 'Outside the brain';

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The home page's one interactive moment: a real FLAIR slice from the sample case with Lobe's
 * crosshair. It follows the pointer (or arrow keys) and reads out the slice numbers and the region
 * under it, the way the workspace ties a point to all three planes.
 */
export function ScanHero() {
  const svg = useRef<SVGSVGElement>(null);
  const paths = useRef<Partial<Record<'edema' | 'core' | 'enhancing', SVGPathElement | null>>>({});
  const alpha = useRef<Uint8ClampedArray | null>(null); // brain mask from the PNG's alpha channel
  // Starts at the centre and glides to the tumor once, unless motion is reduced.
  const [start] = useState<Point>(() => (reduced() ? HOME : CENTRE));
  const target = useRef<Point>(HOME);
  const pos = useRef<Point>(start);
  const kick = useRef(() => {});
  const [shown, setShown] = useState<Point & { region: Region }>({ ...start, region: 'Brain tissue' });

  // Read the brain mask once from the image, at voxel resolution.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = NX; c.height = NY;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, NX, NY);
      alpha.current = ctx.getImageData(0, 0, NX, NY).data;
      kick.current();
    };
    img.src = axialUrl;
  }, []);

  // Ease the crosshair toward its target, naming the region under it; no frames once it arrives.
  useEffect(() => {
    let frame = 0;
    const regionAt = (x: number, y: number): Region => {
      const inside = (k: 'edema' | 'core' | 'enhancing') => paths.current[k]?.isPointInFill(new DOMPoint(x, y)) ?? false;
      const a = alpha.current;
      const brain = a ? a[(Math.round(y) * NX + Math.round(x)) * 4 + 3] > 0 : true;
      return inside('enhancing') ? 'Enhancing tumor' : inside('core') ? 'Tumor core' : inside('edema') ? 'Edema' : brain ? 'Brain tissue' : 'Outside the brain';
    };
    const step = () => {
      const p = pos.current, t = target.current;
      const dx = t.x - p.x, dy = t.y - p.y;
      const done = Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05;
      pos.current = done || reduced() ? t : { x: p.x + dx * EASE, y: p.y + dy * EASE };
      setShown({ ...pos.current, region: regionAt(pos.current.x, pos.current.y) });
      frame = done ? 0 : requestAnimationFrame(step);
    };
    kick.current = () => { if (!frame) frame = requestAnimationFrame(step); };
    kick.current();
    return () => { cancelAnimationFrame(frame); kick.current = () => {}; };
  }, []);

  const aim = (x: number, y: number) => {
    target.current = { x: Math.max(0, Math.min(NX - 1, x)), y: Math.max(0, Math.min(NY - 1, y)) };
    kick.current();
  };
  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    aim(((e.clientX - r.left) / r.width) * NX, ((e.clientY - r.top) / r.height) * NY);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    aim(target.current.x + v[0], target.current.y + v[1]);
  };

  const { x, y, region } = shown;
  const tone = region === 'Enhancing tumor' ? css.enhancing : region === 'Tumor core' ? css.core : region === 'Edema' ? css.edema : css.plain;

  return (
    <figure className={css.hero}>
      <div className={css.table} tabIndex={0} role="img"
        aria-label="A real axial FLAIR slice from the sample case with a tumor in the right hemisphere. Move the pointer or use the arrow keys to move the crosshair."
        onPointerMove={onMove} onPointerLeave={() => aim(HOME.x, HOME.y)} onKeyDown={onKey}>
        <img className={css.scan} src={axialUrl} alt="" width={480} height={480} draggable={false} />
        <svg ref={svg} className={css.overlay} viewBox={`0 0 ${A.w} ${A.h}`} aria-hidden="true">
          <path ref={(el) => { paths.current.edema = el; }} d={A.edema} className={css.pEdema} />
          <path ref={(el) => { paths.current.core = el; }} d={A.core} className={css.pCore} />
          <path ref={(el) => { paths.current.enhancing = el; }} d={A.enhancing} className={css.pEnhancing} />
          <line x1={x} x2={x} y1={0} y2={A.h} className={css.line} />
          <line x1={0} x2={A.w} y1={y} y2={y} className={css.line} />
          <circle cx={x} cy={y} r={3.2} className={css.ring} />
        </svg>
        <span className={`${css.side} ${css.sideL}`} aria-hidden="true">L</span>
        <span className={`${css.side} ${css.sideR}`} aria-hidden="true">R</span>
      </div>
      <figcaption className={css.readout} aria-hidden="true">
        <span className={`${css.region} ${tone}`}>{region}</span>
        <dl className={css.planes}>
          <div><dt>Sagittal</dt><dd>{Math.round(x) + 1}<small>/{NX}</small></dd></div>
          <div><dt>Coronal</dt><dd>{NY - Math.round(y)}<small>/{NY}</small></dd></div>
          <div><dt>Axial</dt><dd>{SCAN.axialK + 1}<small>/{NZ}</small></dd></div>
        </dl>
      </figcaption>
    </figure>
  );
}
