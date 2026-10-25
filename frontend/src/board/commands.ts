import { sessionCall } from '../share/store';
import type { BoardItem, BoardRow, NoteAnchor, StickyColor } from '../share/types';
import type { Command } from './history';

type Patch = { anchor?: NoteAnchor; text?: string; color?: StickyColor };
type Ref = { id: string; updatedAt: number };

const create = async (item: BoardItem, ref: Ref) => {
  const r = await sessionCall<{ itemId: string; updatedAt: number }>('board.create', { item });
  ref.id = r.itemId; ref.updatedAt = r.updatedAt;
};
const remove = (ref: Ref) => sessionCall('board.remove', { itemId: ref.id, expectedUpdatedAt: ref.updatedAt }).then(() => {});

/** Redo re-creates the item under a new id; `ref` follows it so later steps still find it. */
export function createItem(item: BoardItem): Command {
  const ref: Ref = { id: '', updatedAt: 0 };
  return { label: `add ${item.kind}`, do: () => create(item, ref), undo: () => remove(ref) };
}

export function removeItem(row: BoardRow): Command {
  const ref: Ref = { id: row.itemId, updatedAt: row.updatedAt };
  return { label: `delete ${row.item.kind}`, do: () => remove(ref), undo: () => create(row.item, ref) };
}

export function updateItem(row: BoardRow, patch: Patch): Command {
  const ref: Ref = { id: row.itemId, updatedAt: row.updatedAt };
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (row.item as Record<string, unknown>)[k]])) as Patch;
  const apply = (p: Patch) => async () => {
    const r = await sessionCall<{ updatedAt: number }>('board.update', { itemId: ref.id, expectedUpdatedAt: ref.updatedAt, patch: p });
    ref.updatedAt = r.updatedAt;
  };
  return { label: `edit ${row.item.kind}`, do: apply(patch), undo: apply(before) };
}

export function createComment(text: string, anchor: NoteAnchor): Command {
  let id = '';
  return {
    label: 'add comment',
    do: async () => { id = (await sessionCall<{ annotationId: string }>('annotations.create', { text, anchor })).annotationId; },
    // ifNoReplies: undo never deletes other people's replies; the server answers STALE and the step is skipped.
    undo: () => sessionCall('annotations.remove', { annotationId: id, ifNoReplies: true }).then(() => {}),
  };
}

export function setResolved(annotationId: string, resolved: boolean): Command {
  const call = (r: boolean) => () => sessionCall(r ? 'annotations.resolve' : 'annotations.unresolve', { annotationId }).then(() => {});
  return { label: resolved ? 'resolve' : 'reopen', do: call(resolved), undo: call(!resolved) };
}
