import type { Health, JobStatus, LibraryCase, Report } from './types';
import type { Sequence } from './upload';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

/** Non-2xx response. 422 bodies are {code, message}; FastAPI 404/409 bodies are {detail}. */
// Fields declared explicitly: tsconfig has erasableSyntaxOnly, so no constructor parameter properties.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function json<T>(r: Response): Promise<T> {
  if (r.ok) return r.json() as Promise<T>;
  const b = (await r.json().catch(() => null)) as { code?: string; message?: string; detail?: unknown } | null;
  const detail = typeof b?.detail === 'string' ? b.detail : undefined;
  throw new ApiError(r.status, b?.code ?? `HTTP_${r.status}`, b?.message ?? detail ?? `HTTP ${r.status}`);
}

export const getLibrary = (signal?: AbortSignal) => fetch(`${API_URL}/library`, { signal }).then((r) => json<LibraryCase[]>(r));
export const getHealth = (signal?: AbortSignal) => fetch(`${API_URL}/health`, { signal }).then((r) => json<Health>(r));
export const getJob = (id: string, signal?: AbortSignal) => fetch(`${API_URL}/jobs/${encodeURIComponent(id)}`, { signal }).then((r) => json<JobStatus>(r));
export const getReport = (id: string, signal?: AbortSignal) => fetch(`${API_URL}/jobs/${encodeURIComponent(id)}/report`, { signal }).then((r) => json<Report>(r));
export const modelUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/model.glb`;

export const segUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/seg.nii.gz`;
export const flairUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/flair.nii.gz`;

export async function createJob(files: Record<Sequence, File>): Promise<string> {
  const body = new FormData();
  for (const [seq, f] of Object.entries(files)) body.append(seq, f, f.name);
  const r = await fetch(`${API_URL}/jobs`, { method: 'POST', body });
  return (await json<{ jobId: string }>(r)).jobId;
}
