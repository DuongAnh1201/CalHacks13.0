import type { Report } from '../api/types';
import { segUrl } from '../api/client';
import { SAMPLES, SEQUENCE_LABEL, SEQUENCES, type Sequence } from '../api/upload';
import { Legend } from '../components/Legend';
import css from './CaseInfo.module.css';
import { certaintyText, cm3, headline, sideLabel } from './summary';

const sequenceLine = (names: string[]) => names.map((n) => (SEQUENCES.includes(n as Sequence) ? SEQUENCE_LABEL[n as Sequence] : n)).join(' · ');

function dimensions(r: Report) {
  const box = r.bboxMm;
  if (!box) return null;
  return box.max.map((v, i) => ((v - box.min[i]) / 10).toFixed(1)).join(' × ') + ' cm';
}

/** Everything the report says about the case: findings first, then the dataset and the caveats. */
export function CaseInfo({ report }: { report: Report }) {
  const sample = SAMPLES.some((s) => s.id === report.jobId);
  const dims = dimensions(report);
  const certainty = certaintyText(report.certainty);
  return (
    <div className={css.info}>
      <section className={css.hero}>
        <p className={css.kicker}><span className={report.tumorDetected ? css.dotWarm : css.dot} />AI volumetric analysis</p>
        <h3 className={css.headline}>{headline(report)}</h3>
        {report.tumorDetected && <p className={css.sub}>{sideLabel(report.side)} · {report.lesionCount} lesion{report.lesionCount === 1 ? '' : 's'}</p>}
      </section>

      {report.tumorDetected && (
        <dl className={css.tiles}>
          <div><dt>Whole tumor</dt><dd>{cm3(report.volumesCm3.whole)}</dd></div>
          <div><dt>Core</dt><dd>{cm3(report.volumesCm3.core)}</dd></div>
          <div><dt>Enhancing</dt><dd>{cm3(report.volumesCm3.enhancing)}</dd></div>
          {dims && <div><dt>Extent</dt><dd>{dims}</dd></div>}
        </dl>
      )}

      <dl className={css.rows}>
        {report.centroidMm && <><dt>Tumor centre</dt><dd className={css.mono}>{report.centroidMm.map((v) => v.toFixed(0)).join(', ')} mm</dd></>}
        {dims && <><dt>Extent axes</dt><dd>left–right × front–back × up–down</dd></>}
        {certainty && <><dt>Model certainty</dt><dd>{certainty}</dd></>}
        {report.expertDice && <><dt>Dice vs expert</dt><dd>whole {report.expertDice.whole.toFixed(2)} · core {report.expertDice.core.toFixed(2)} · enh. {report.expertDice.enhancing.toFixed(2)}</dd></>}
        <dt>Sequences</dt><dd>{sequenceLine(report.input.sequences)}</dd>
        <dt>Matrix</dt><dd className={css.mono}>{report.input.shape.join(' × ')}</dd>
        <dt>Voxel spacing</dt><dd className={css.mono}>{report.input.spacingMm.join(' × ')} mm</dd>
        <dt>Model</dt><dd>{report.model.arch} v{report.model.version} · {report.segmentationSource === 'expert' ? 'expert label' : 'model output'}</dd>
      </dl>

      <Legend available={{ edema: report.tumorDetected, core: report.tumorDetected, enhancing: report.volumesCm3.enhancing > 0 }} />

      <a className={css.export} href={segUrl(report.jobId)} download={`${report.jobId}-seg.nii.gz`}>Export NIfTI mask</a>

      <ul className={css.limits}>
        <li>Educational visualization; not clinically validated.</li>
        <li>Shown where the model segmented it, in the scan's own coordinates.</li>
        <li>BraTS-style preprocessed MRI only.</li>
        {sample && <li>Sample case from the BraTS dataset; it may be part of the model's training data.</li>}
      </ul>
    </div>
  );
}
