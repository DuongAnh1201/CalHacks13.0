import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import brandMark from '../../assets/figma/664bf.svg';
import { ChatDock } from '../../share/ChatDock';
import { ShareControls } from '../../share/ShareControls';
import { CloseIcon } from './icons';
import css from './Workspace.module.css';

export interface Tool { id: string; label: string; icon: ReactNode; panel: ReactNode; badge?: number }

interface Props {
  jobId: string;
  title: string;
  tools: Tool[];
  /** Tool open on arrival; null keeps the stage clear. */
  initialTool?: string | null;
  /** Opens this tool whenever it changes to a tool id (e.g. Notes while a pin is being placed). */
  focusTool?: string | null;
  /** A tool's panel was closed or swapped for another. */
  onToolClose?: (id: string) => void;
  /** Floating controls centred at the bottom of the stage. */
  dock?: ReactNode;
  children: ReactNode;
}

/**
 * Whiteboard-style case page: the viewer fills the window and everything else floats over it.
 * Top left: brand, case and the 3D / Slices switch. Top right: sharing. Left: a tool rail whose
 * tools open one panel at a time. Bottom right: the session chat.
 */
export function Workspace({ jobId, title, tools, initialTool = null, focusTool = null, onToolClose, dock, children }: Props) {
  const [open, setOpenState] = useState<string | null>(initialTool);
  const setOpen = (next: string | null) => {
    if (open && open !== next) onToolClose?.(open);
    setOpenState(next);
  };
  const [focused, setFocused] = useState(focusTool);
  if (focusTool !== focused) {
    setFocused(focusTool);
    if (focusTool) setOpen(focusTool);
  }
  const tool = tools.find((t) => t.id === open);
  return (
    <div className={css.page}>
      <main className={css.stage}>{children}</main>

      <header className={css.case}>
        <NavLink to="/" className={css.brand} aria-label="NeuroVision home"><img src={brandMark} alt="" width={19} height={20} /></NavLink>
        <span className={css.title} title={title}>{title}</span>
        <nav className={css.views} aria-label="View">
          <NavLink to={`/jobs/${jobId}/3d`} className={({ isActive }) => (isActive ? `${css.view} ${css.active}` : css.view)}>3D</NavLink>
          <NavLink to={`/jobs/${jobId}/mri`} className={({ isActive }) => (isActive ? `${css.view} ${css.active}` : css.view)}>Slices</NavLink>
        </nav>
      </header>

      <div className={css.shareBar}><ShareControls css={css} /></div>

      <nav className={css.rail} aria-label="Tools">
        {tools.map((t) => (
          <button key={t.id} type="button" className={css.tool} aria-pressed={open === t.id} title={t.label} aria-label={t.label}
            onClick={() => setOpen(open === t.id ? null : t.id)}>
            {t.icon}
            {!!t.badge && <span className={css.badge}>{t.badge}</span>}
          </button>
        ))}
      </nav>

      {tool && (
        <aside className={css.panel} aria-label={tool.label}>
          <header className={css.panelHead}>
            <h2 className={css.panelTitle}>{tool.label}</h2>
            <button type="button" className={css.iconBtn} aria-label={`Close ${tool.label}`} onClick={() => setOpen(null)}><CloseIcon /></button>
          </header>
          <div className={css.panelBody}>{tool.panel}</div>
        </aside>
      )}

      {dock && <div className={css.dock}>{dock}</div>}
      <p className={css.disclaimer}>Educational visualization — not for diagnosis or surgical planning.</p>
      <ChatDock />
    </div>
  );
}
