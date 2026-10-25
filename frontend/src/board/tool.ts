import { create } from 'zustand';
import type { CameraPoseDto } from '../share/types';
import type { Vec3 } from '../viewer/transform';

export type Tool = 'select' | 'comment' | 'sticky' | 'text' | 'pen' | 'highlight';
export type Placeable = 'comment' | 'sticky' | 'text';
interface BoardTool {
  tool: Tool;
  /** A click on the brain with a placing tool: the inline editor opens here (scan mm). */
  draft: { tool: Placeable; mm: Vec3 } | null;
  selected: string | null;
  /** Live camera pose of this tab, for stroke fading. */
  pose: CameraPoseDto | null;
  /** A request like notes.goTo: the canvas acts when `n` changes. */
  goToPose: { pose: CameraPoseDto; n: number } | null;
}
export const useBoardTool = create<BoardTool>()(() => ({ tool: 'select', draft: null, selected: null, pose: null, goToPose: null }));
export const setTool = (tool: Tool) => useBoardTool.setState({ tool, draft: null });
export const setBoardDraft = (draft: BoardTool['draft']) => useBoardTool.setState({ draft });
export const selectItem = (selected: string | null) => useBoardTool.setState({ selected });
export const setPose = (pose: CameraPoseDto) => useBoardTool.setState({ pose });
export const requestPose = (pose: CameraPoseDto) => useBoardTool.setState((s) => ({ goToPose: { pose, n: (s.goToPose?.n ?? 0) + 1 } }));
export const isPlacing = (t: Tool): t is Placeable => t === 'comment' || t === 'sticky' || t === 'text';
