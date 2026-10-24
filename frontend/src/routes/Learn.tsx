import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { initCase } from '../actions/dispatch';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { ExplodeSlider } from '../learn/ExplodeSlider';
import { InfoPanel } from '../learn/InfoPanel';
import { LearnToolbar } from '../learn/LearnToolbar';
import { StatusPill } from '../learn/StatusPill';
import { StructureTree } from '../learn/StructureTree';
import { ATLAS_GLB_URL, loadAtlas, structureColors, type Atlas } from '../viewer/anatomy';
import { AtlasCanvas } from '../viewer/AtlasCanvas';
import css from './Learn.module.css';

class LoadBoundary extends Component<{ onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <LoadError onRetry={() => { useGLTF.clear(ATLAS_GLB_URL); this.setState({ failed: false }); this.props.onRetry(); }} />;
  }
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={css.error} role="alert">
      <p>Atlas failed to load.</p>
      <button className={css.retry} onClick={onRetry}>Retry</button>
    </div>
  );
}

export default function Learn() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadAtlas().then((a) => {
      if (!live) return;
      initCase({ jobId: 'atlas', hasTumor: false, structureIds: new Set(a.structures.map((s) => s.id)), bboxMm: a.brain.bboxMm });
      setAtlas(a);
    }).catch((e: unknown) => { console.error(e); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  const colors = useMemo(() => (atlas ? structureColors(atlas.structures) : {}), [atlas]);
  const missingSet = useMemo(() => new Set(missing), [missing]);
  const retry = () => setAttempt((n) => n + 1);

  return (
    <div className={css.page}>
      <TopNavBar />
      <main className={css.grid}>
        {atlas ? <StructureTree atlas={atlas} colors={colors} missing={missingSet} /> : <aside className={css.side} />}
        <section className={css.stage} aria-label="3D brain">
          {failed && <LoadError onRetry={retry} />}
          {!failed && !atlas && <p className={css.loading}>Loading atlas…</p>}
          {atlas && (
            <LoadBoundary onRetry={retry}>
              <Suspense fallback={<p className={css.loading}>Loading 3D brain…</p>}>
                <AtlasCanvas atlas={atlas} colors={colors} onMissing={setMissing} />
              </Suspense>
            </LoadBoundary>
          )}
          <div className={css.top}><StatusPill /></div>
          {atlas && <div className={css.bottom}><ExplodeSlider /><LearnToolbar /></div>}
        </section>
        {atlas ? <InfoPanel atlas={atlas} colors={colors} /> : <aside className={css.side} />}
      </main>
      <Footer />
    </div>
  );
}
