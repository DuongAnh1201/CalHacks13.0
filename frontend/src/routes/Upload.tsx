import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, createJob } from '../api/client';
import { INVALID_FORMAT_MESSAGE, SAMPLES, SEQUENCE_LABEL, SEQUENCES, guessSequence, isNifti, type Sequence } from '../api/upload';
import browseIcon from '../assets/figma/3f40b.svg';
import uploadIcon from '../assets/figma/47363.svg';
import flaskIcon from '../assets/figma/d5c9a.svg';
import checkIcon from '../assets/figma/f8d34.svg';
import { BackendBanner } from '../components/BackendBanner';
import { FlowPage } from '../components/FlowPage';
import css from './Upload.module.css';

const empty = (): Partial<Record<Sequence, File>> => ({});

function FormatCard({ title, badge, extensions, text, warn }: { title: string; badge: string; extensions: string; text: string; warn?: boolean }) {
  return (
    <article className={css.format}>
      <div className={css.formatTop}>
        <p className={css.formatTitle}>{title}</p>
        <span className={warn ? css.badgeWarn : css.badge}>{badge}</span>
      </div>
      <p className={css.ext}>{extensions}</p>
      <p className={css.formatText}>{text}</p>
    </article>
  );
}

export default function Upload() {
  const navigate = useNavigate();
  const [slots, setSlots] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function take(list: FileList | File[], only?: Sequence) {
    const files = [...list];
    if (files.some((f) => !isNifti(f.name))) { setError(INVALID_FORMAT_MESSAGE); return; }
    setError(null);
    setSlots((prev) => {
      const next = { ...prev };
      for (const f of files) {
        const seq = only ?? guessSequence(f.name) ?? SEQUENCES.find((s) => !next[s]);
        if (seq) next[seq] = f;
      }
      return next;
    });
  }

  function picked(e: ChangeEvent<HTMLInputElement>, only?: Sequence) {
    if (e.target.files?.length) take(e.target.files, only);
    e.target.value = '';
  }

  async function start() {
    setBusy(true); setError(null);
    try { navigate(`/jobs/${await createJob(slots as Record<Sequence, File>)}/processing`); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Backend offline — start docker compose up'); }
    finally { setBusy(false); }
  }

  const ready = SEQUENCES.every((s) => slots[s]);

  return (
    <FlowPage step={1} title="Load an MRI study" lede="Pick a sample case, or upload the 4 MRI sequences of one study. NeuroVision segments the tumor and places it on the 3D brain.">
      <div className={css.stack}>
        <BackendBanner />
        <ul className={css.samples}>
          {SAMPLES.map((s) => (
            <li key={s.id} className={css.sample}>
              <img src={flaskIcon} alt="" width={24} height={24} />
              <div className={css.copy}>
                <p className={css.cardTitle}>{s.title}</p>
                <p className={css.cardDetail}>{s.detail}</p>
              </div>
              <Link className={css.ghost} to={`/jobs/${s.id}/processing`}>Use sample</Link>
            </li>
          ))}
        </ul>
        <div
          className={css.drop}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files); }}
        >
          <div className={css.well}><img src={uploadIcon} alt="" width={32} height={32} /></div>
          <p className={css.dropTitle}>Drag & drop 4 NIfTI files here</p>
          <p className={css.sub}>T1c, T1, T2 and FLAIR · .nii or .nii.gz · BraTS-style preprocessed MRI only</p>
          <label className={css.primary}>
            <img src={browseIcon} alt="" width={18} height={18} />
            Browse files
            <input hidden type="file" multiple accept=".nii,.nii.gz" onChange={(e) => picked(e)} />
          </label>
          <p className={css.foot}>Max 200 MB per file</p>
        </div>
        <div className={css.formats}>
          <FormatCard title="NIfTI volume" badge="3D" extensions=".nii  .nii.gz" text="Full 3D volume. The tumor is placed on the 3D brain." />
          <FormatCard title="Images & screenshots" badge="Not accepted" extensions=".jpg  .png  .heic" text="2D pictures don't contain 3D scan data." warn />
        </div>
        <ul className={css.slots}>
          {SEQUENCES.map((seq) => (
            <li key={seq} className={css.slot}>
              <span className={css.slotLabel}>{SEQUENCE_LABEL[seq]}</span>
              {slots[seq] && <img src={checkIcon} alt="" width={12} height={12} />}
              <span className={slots[seq] ? css.fileName : css.fileEmpty}>{slots[seq]?.name ?? 'No file'}</span>
              <label className={css.ghost}>
                Choose
                <input hidden type="file" accept=".nii,.nii.gz" onChange={(e) => picked(e, seq)} />
              </label>
            </li>
          ))}
        </ul>
        {error && (
          <div className={css.alert} role="alert">
            <p>{error}</p>
            <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
          </div>
        )}
        <button className={css.primary} type="button" disabled={!ready || busy} onClick={start}>{busy ? 'Uploading…' : 'Start'}</button>
        <aside className={css.notice}>
          <p className={css.cardTitle}>Educational visualization</p>
          <p className={css.cardDetail}>Not clinically validated. Not for diagnosis or surgical planning.</p>
        </aside>
      </div>
    </FlowPage>
  );
}
