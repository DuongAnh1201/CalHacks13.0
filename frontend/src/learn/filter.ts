import { GROUP_LABEL, GROUP_ORDER, type Group, type Structure } from '../viewer/anatomy';

export function filterStructures(list: readonly Structure[], q: string): Structure[] {
  const t = q.trim().toLowerCase();
  if (!t) return [...list];
  return list.filter((s) => s.name.toLowerCase().includes(t) || GROUP_LABEL[s.group].toLowerCase().includes(t));
}

export function groupStructures(list: readonly Structure[]): [Group, Structure[]][] {
  return GROUP_ORDER.map((g) => [g, list.filter((s) => s.group === g)] as [Group, Structure[]]).filter(([, l]) => l.length > 0);
}
