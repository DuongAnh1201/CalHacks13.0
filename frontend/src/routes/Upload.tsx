import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, createJob } from '../api/client';
import { INVALID_FORMAT_MESSAGE, SEQUENCE_LABEL, SEQUENCES, guessSequence, isNifti, type Sequence } from '../api/upload';
import browseIcon from '../assets/figma/3f40b.svg';
import uploadIcon from '../assets/figma/47363.svg';
import flaskIcon from '../assets/figma/d5c9a.svg';
import checkIcon from '../assets/figma/f8d34.svg';
import { BackendBanner } from '../components/BackendBanner';
import { saveWorkspace, scanName } from '../home/workspaces';
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
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [invalidAttempt, setInvalidAttempt] = useState(0);
  const dragDepth = useRef(0);

  function take(list: FileList | File[], only?: Sequence) {
    if (busy) return;
    const files = [...list];
    if (!files.length) return;
    if (files.some((f) => !isNifti(f.name))) {
      setError(INVALID_FORMAT_MESSAGE);
      setInvalidAttempt((n) => n + 1);
      return;
    }
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
    if (!ready || busy) return;
    setBusy(true); setError(null); setProgress(null); setOver(false); dragDepth.current = 0;
    try {
      const jobId = await createJob(slots as Record<Sequence, File>, setProgress);
      saveWorkspace({ id: jobId, kind: 'mri', name: scanName(slots.flair!.name, jobId), openedAt: Date.now() });
      navigate(`/jobs/${jobId}/processing`);
    }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Backend offline — start docker compose up'); }
    finally { setBusy(false); }
  }

  const ready = SEQUENCES.every((s) => slots[s]);

  return (
    <FlowPage step={1} title="Load an MRI study" lede="Explore a ready-made case, or upload the 4 MRI sequences of one study. Lobe segments the tumor and places it on the 3D brain.">
      <div className={css.stack}>
        <BackendBanner />
        <div className={css.sample}>
          <img src={flaskIcon} alt="" width={24} height={24} />
          <div className={css.copy}>
            <p className={css.cardTitle}>No scan of your own?</p>
            <p className={css.cardDetail}>Browse the library of real brain MRIs with expert-outlined tumors, ready to study.</p>
          </div>
          <Link className={css.ghost} to="/explore">Explore scans</Link>
        </div>
        <div
          className={css.drop}
          data-over={over && !busy}
          onDragEnter={(e) => { e.preventDefault(); if (!busy) { dragDepth.current++; setOver(true); } }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = busy ? 'none' : 'copy'; }}
          onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setOver(false); }}
          onDrop={(e) => { e.preventDefault(); dragDepth.current = 0; setOver(false); if (!busy) take(e.dataTransfer.files); }}
        >
          {invalidAttempt > 0 && <span key={invalidAttempt} className={css.invalidFlash} aria-hidden="true" />}
          <div className={css.well}><img src={uploadIcon} alt="" width={32} height={32} /></div>
          <p className={css.dropTitle}><span className={css.desktopTitle}>{over && !busy ? 'Drop to add files' : 'Drag & drop 4 NIfTI files here'}</span><span className={css.touchTitle}>Tap to add 4 NIfTI files</span></p>
          <p className={css.sub}>T1c, T1, T2 and FLAIR · .nii or .nii.gz · BraTS-style preprocessed MRI only</p>
          <label className={css.primary} aria-disabled={busy}>
            <img src={browseIcon} alt="" width={18} height={18} />
            Browse files
            {/* macOS matches accept on the last suffix only, so '.nii.gz' never enables .gz files. */}
            <input className={css.file} type="file" multiple accept=".nii,.gz" disabled={busy} onChange={(e) => picked(e)} />
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
              {slots[seq] && <span key={slots[seq].name} className={css.slotFill} aria-hidden="true" />}
              <span className={css.slotLabel}>{SEQUENCE_LABEL[seq]}</span>
              {slots[seq] && <img key={`check-${slots[seq].name}`} className={css.slotCheck} src={checkIcon} alt="" width={12} height={12} />}
              <span className={slots[seq] ? css.fileName : css.fileEmpty}>{slots[seq]?.name ?? 'No file'}</span>
              <label className={css.ghost} aria-disabled={busy}>
                Choose
                <input className={css.file} type="file" accept=".nii,.gz" disabled={busy} onChange={(e) => picked(e, seq)} />
              </label>
            </li>
          ))}
        </ul>
        {error && (
          <div key={invalidAttempt} className={css.alert} role="alert">
            <p>{error}</p>
            <Link className={css.ghost} to="/jobs/sample/processing" onClick={() => saveWorkspace({ id: 'sample', kind: 'mri', name: 'Sample case A', openedAt: Date.now() })}>Use sample case</Link>
          </div>
        )}
        <button className={css.primary} type="button" disabled={!ready || busy} aria-busy={busy} onClick={start}>
          {busy && <span className={css.spinner} aria-hidden="true" />}
          {busy ? progress === 1 ? 'Starting job…' : 'Uploading 4 files…' : 'Start'}
        </button>
        {busy && progress !== null && (
          <div className={css.progress} role="progressbar" aria-label="File upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span className={css.progressFill} style={{ transform: `scaleX(${progress})` }} />
          </div>
        )}
        <aside className={css.notice}>
          <p className={css.cardTitle}>Educational visualization</p>
          <p className={css.cardDetail}>Not clinically validated. Not for diagnosis or surgical planning.</p>
        </aside>
      </div>
    </FlowPage>
  );
}
