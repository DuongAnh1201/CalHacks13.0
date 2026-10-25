import { useState } from 'react';
import type { Report } from '../api/types';
import { anchorMm, goToMm, indicesToScanMm, scanMmToRas, selectNote, setDraft, setPlacing, useNoteUi } from './notes';
import css from './NotesPanel.module.css';
import { addNote, removeNote, setFollowing, useShare } from './store';
import type { Note, NoteAnchor, SliceIndices } from './types';

const MAX = 280; // convex/annotations.ts MAX_ANNOTATION_LENGTH

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface Props {
  report: Report;
  notes: Note[];
  /** 3D: pins go where the brain is clicked. Slices: at the current crosshair. */
  mode: '3d' | 'mri';
  crosshair?: () => SliceIndices | null;
}

export function NotesPanel({ report, notes, mode, crosshair }: Props) {
  const live = useShare((s) => s.stored?.jobId === report.jobId && s.session?.status === 'active');
  const { placing, draft, selected } = useNoteUi();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!live) return <p className={css.empty}>Share this case to pin notes that everyone in the session sees.</p>;

  const save = async (anchor: NoteAnchor) => {
    setBusy(true);
    const err = await addNote(text, anchor);
    setBusy(false);
    setError(err);
    if (!err) { setText(''); setDraft(null); }
  };
  const pinHere = () => {
    if (mode === '3d') { if (draft) void save({ kind: 'point', ras_mm: scanMmToRas(draft, report) }); return; }
    const idx = crosshair?.();
    if (idx) void save({ kind: 'point', ras_mm: scanMmToRas(indicesToScanMm(idx, report), report) });
    else setError('Click a slice to set the crosshair first.');
  };
  const goTo = (n: Note) => {
    const mm = anchorMm(n.anchor, report);
    if (!mm) return;
    selectNote(n.annotationId);
    goToMm(mm);
    const { stored, session } = useShare.getState();
    if (stored?.role === 'viewer' && session?.me.following) void setFollowing(false); // the guest chose where to look
  };

  const ready = text.trim().length > 0 && !busy && (mode === 'mri' || !!draft);
  return (
    <div className={css.notes}>
      <form className={css.compose} onSubmit={(e) => { e.preventDefault(); if (ready) pinHere(); }}>
        {mode === '3d' && !draft && (
          <button type="button" className={placing ? `${css.place} ${css.placing}` : css.place} aria-pressed={placing} onClick={() => setPlacing(!placing)}>
            {placing ? 'Click a spot on the brain…' : 'Place a pin on the brain'}
          </button>
        )}
        {(mode === 'mri' || draft) && (
          <>
            <p className={css.hint}>{mode === '3d' ? 'Pin placed. What should the room know?' : 'Pins go at the crosshair. Click a slice to move it.'}</p>
            <textarea className={css.field} rows={2} maxLength={MAX} placeholder="Add a note" aria-label="Note text" value={text}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ready) pinHere(); } }} />
            <div className={css.row}>
              {mode === '3d' && <button type="button" className={css.ghost} onClick={() => setDraft(null)}>Cancel</button>}
              <button type="submit" className={css.primary} disabled={!ready}>{mode === '3d' ? 'Save note' : 'Pin at crosshair'}</button>
            </div>
          </>
        )}
        {error && <p className={css.error} role="alert">{error}</p>}
      </form>

      {notes.length === 0
        ? <p className={css.empty}>No notes yet.</p>
        : (
          <ol className={css.list}>
            {notes.map((n, i) => {
              const where = anchorMm(n.anchor, report);
              return (
                <li key={n.annotationId} className={selected === n.annotationId ? `${css.item} ${css.selected}` : css.item}>
                  <span className={css.num}>{i + 1}</span>
                  <div className={css.body}>
                    <p className={css.text}>{n.text}</p>
                    <p className={css.meta}>
                      {n.authorName} · {time(n.createdAt)}
                      {n.status === 'suggested' && <span className={css.tag}>Suggested</span>}
                      {n.anchor.kind === 'structure' && <span className={css.tag}>{n.anchor.id}</span>}
                    </p>
                  </div>
                  <div className={css.actions}>
                    {where && <button type="button" className={css.link} onClick={() => goTo(n)}>Go to</button>}
                    {n.canRemove && <button type="button" className={css.link} aria-label={`Remove note ${i + 1}`} onClick={() => void removeNote(n.annotationId).then(setError)}>Remove</button>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
    </div>
  );
}
