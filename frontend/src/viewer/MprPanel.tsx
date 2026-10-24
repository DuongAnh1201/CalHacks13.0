import { DRAG_MODE, Niivue, SLICE_TYPE } from '@niivue/niivue';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dispatch } from '../actions/dispatch';
import type { Axis } from '../actions/types';
import { flairUrl, segUrl } from '../api/client';
import { fracsOf, indicesOf } from '../share/mprSync';
import type { SliceIndices } from '../share/types';
import { AXIS_INDEX, labelColormap, PRESETS, sliceOf, windowFor, type Preset } from './slices';
import css from './MprPanel.module.css';

import caliperIcon from '../assets/figma/c18f8.svg';
import contrastIcon from '../assets/figma/94482.svg';
import maskIcon from '../assets/figma/e5b0c.svg';
import lockIcon from '../assets/figma/d8034.svg';

interface View { axis: Axis; label: string; type: SLICE_TYPE }
const VIEWS: readonly View[] = [
  { axis: 'axial', label: 'Axial', type: SLICE_TYPE.AXIAL },
  { axis: 'sagittal', label: 'Sagittal', type: SLICE_TYPE.SAGITTAL },
  { axis: 'coronal', label: 'Coronal', type: SLICE_TYPE.CORONAL },
];
const AXES: readonly Axis[] = ['sagittal', 'coronal', 'axial'];

// shortcut: 3 instances load the NIfTIs 3×, share one NVImage when load time hurts
function SliceView({ jobId, view, onNv, onCross }: { jobId: string; view: View; onNv: (axis: Axis, nv: Niivue | null) => void; onCross: (idx: SliceIndices) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slice, setSlice] = useState({ n: 0, of: 0 });
  const i = AXIS_INDEX[view.axis];

  useEffect(() => {
    let live = true;
    const nv = new Niivue({ backColor: [0.08, 0.13, 0.17, 1], crosshairColor: [0.92, 0.34, 0.34, 1], isResizeCanvas: true, loadingText: '' });
    // Each effect owns a canvas: StrictMode can clean up while attachToCanvas is still awaiting init.
    const canvas = document.createElement('canvas');
    canvas.className = css.canvas;
    canvas.setAttribute('aria-label', `${view.label} MRI view`);
    host.current!.appendChild(canvas);
    nv.keyDownListener = () => {};
    nv.keyUpListener = () => {};
    void (async () => {
      try {
        await nv.attachToCanvas(canvas);
        if (!live) { nv.cleanup(); return; }
        nv.setSliceType(view.type);
        await nv.loadVolumes([{ url: flairUrl(jobId) }, { url: segUrl(jobId), opacity: 0.6 }]);
        if (!live) { nv.cleanup(); return; }
        nv.volumes[1].setColormapLabel(labelColormap());
        nv.updateGLVolume();
        const of = nv.volumes[0].dimsRAS![i + 1];
        const update = () => setSlice({ n: sliceOf(nv.scene.crosshairPos[i], of), of });
        nv.onLocationChange = (d) => {
          update();
          const mm = (d as { mm: ArrayLike<number> }).mm;
          // Keep the store cursor in step (SPEC §7.3); the 3D crosshair (C2) reads it later.
          for (const a of AXES) dispatch({ type: 'setSlice', axis: a, offsetMm: mm[AXIS_INDEX[a]] }, 'pointer');
          onCross(indicesOf(nv.scene.crosshairPos, nv.volumes[0].dimsRAS!));
        };
        update();
        nvRef.current = nv;
        setState('ready');
        onNv(view.axis, nv);
      } catch (e) {
        nv.cleanup();
        if (live) { console.error('[mpr]', view.axis, e); setState('error'); }
      }
    })();
    return () => {
      live = false;
      nv.onLocationChange = () => {};
      nv.broadcastTo([]);
      nv.cleanup();
      canvas.remove();
      nvRef.current = null;
      onNv(view.axis, null);
    };
  }, [jobId, view, i, attempt, onNv, onCross]);

  const go = (n: number) => {
    const nv = nvRef.current;
    if (!nv) return;
    const d = [0, 0, 0]; d[i] = n - slice.n;
    // NiiVue broadcasts only from the focused canvas, including slider-driven moves.
    nv.canvas!.focus();
    nv.moveCrosshairInVox(d[0], d[1], d[2]);
  };

  return (
    <figure className={css.view} data-axis={view.axis}>
      <div ref={host} className={css.canvasHost} />
      <figcaption className={css.chip}>{view.label}</figcaption>
      {state === 'ready' && (
        <div className={css.sliceBar}>
          <span className={css.mono}>{slice.n} / {slice.of}</span>
          <input type="range" min={1} max={slice.of} value={slice.n} aria-label={`${view.label} slice`} onChange={(e) => go(Number(e.target.value))} />
        </div>
      )}
      {state === 'loading' && <p className={css.overlay}>Loading {view.label.toLowerCase()} slice…</p>}
      {state === 'error' && (
        <div className={css.overlay} role="alert">
          <p>The {view.label.toLowerCase()} view could not load the scan.</p>
          <button type="button" className={css.retry} onClick={() => { setState('loading'); setAttempt((n) => n + 1); }}>Retry</button>
        </div>
      )}
    </figure>
  );
}

export function MprPanel({ jobId, onCrosshair, remote }: { jobId: string; onCrosshair?: (idx: SliceIndices) => void; remote?: SliceIndices | null }) {
  const [nvs, setNvs] = useState<Partial<Record<Axis, Niivue>>>({});
  const onNv = useCallback((axis: Axis, nv: Niivue | null) => setNvs((m) => {
    const next = { ...m };
    if (nv) next[axis] = nv; else delete next[axis];
    return next;
  }), []);
  // A ref, so a new onCrosshair from the parent never reloads the NiiVue views.
  const cross = useRef(onCrosshair);
  useEffect(() => { cross.current = onCrosshair; });
  const onCross = useCallback((idx: SliceIndices) => cross.current?.(idx), []);

  // Following a host: move every view to the shared indices. createOnLocationChange refreshes the slice labels;
  // the echo it sends to onCrosshair equals `remote`, and useMprShare ignores it.
  useEffect(() => {
    if (!remote) return;
    for (const nv of Object.values(nvs)) {
      nv.scene.crosshairPos = fracsOf(remote, nv.volumes[0].dimsRAS!);
      nv.createOnLocationChange();
      nv.drawScene();
    }
  }, [nvs, remote]);

  const [preset, setPreset] = useState<Preset>('Brain');
  const [gamma, setGamma] = useState(1);
  const [mask, setMask] = useState(60);
  const [caliper, setCaliper] = useState(false);

  // One crosshair across the three views (#11).
  useEffect(() => {
    const all = Object.values(nvs);
    for (const nv of all) nv.broadcastTo(all.filter((o) => o !== nv), { '2d': true, '3d': false });
    return () => { for (const nv of all) nv.broadcastTo([]); };
  }, [nvs]);

  // Tool settings apply to every loaded view, including one that just reloaded.
  useEffect(() => {
    for (const nv of Object.values(nvs)) {
      const v = nv.volumes[0];
      [v.cal_min, v.cal_max] = windowFor(preset, v.robust_min ?? v.cal_min ?? 0, v.robust_max ?? v.cal_max ?? 1);
      nv.setGamma(gamma);
      nv.setOpacity(1, mask / 100);
      nv.opts.dragMode = caliper ? DRAG_MODE.measurement : DRAG_MODE.contrast;
      nv.updateGLVolume();
    }
  }, [nvs, preset, gamma, mask, caliper]);

  const locked = Object.keys(nvs).length === 3;
  return (
    <section className={css.panel} aria-label="Slice views">
      <header className={css.head}>
        <h2 className={css.title}>Synchronized Multi-Planar Reconstruction</h2>
        <div className={css.presets} role="group" aria-label="Window preset">
          {PRESETS.map((p) => <button key={p} type="button" aria-pressed={preset === p} className={css.preset} onClick={() => setPreset(p)}>{p}</button>)}
        </div>
      </header>
      <div className={css.views}>
        {VIEWS.map((v) => <SliceView key={`${jobId}:${v.axis}`} jobId={jobId} view={v} onNv={onNv} onCross={onCross} />)}
      </div>
      <div className={css.tools}>
        <button type="button" aria-pressed={caliper} title="Right-drag on a slice to measure." className={css.tool} onClick={() => setCaliper((c) => !c)}><img src={caliperIcon} alt="" />Electronic Caliper</button>
        <label className={css.tool}><img src={contrastIcon} alt="" />Contrast / Gamma <input type="range" min={0.3} max={3} step={0.1} value={gamma} onChange={(e) => setGamma(Number(e.target.value))} /></label>
        <label className={css.tool}><img src={maskIcon} alt="" />Mask Overlay {mask}% <input type="range" min={0} max={100} value={mask} onChange={(e) => setMask(Number(e.target.value))} /></label>
        <span className={locked ? `${css.lock} ${css.on}` : css.lock} role="status"><img src={lockIcon} alt="" />{locked ? '3-Axis Triangulation Locked' : 'Linking views…'}</span>
      </div>
      {caliper && <p className={css.hint}>Right-drag on a slice to measure.</p>}
    </section>
  );
}
