import content from './anatomy.json';

export interface StructureContent { description: string; functions: string[]; whenDamaged: string }

export const baseId = (id: string) => id.replace(/^(lh|rh)_/, '');

export function contentFor(id: string): StructureContent | undefined {
  return (content as Record<string, StructureContent>)[baseId(id)];
}
