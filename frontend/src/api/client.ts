import type { Health } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const r = await fetch(`${API_URL}/health`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<Health>;
}
