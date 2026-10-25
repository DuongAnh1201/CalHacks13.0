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

export function responseError(status: number, body: unknown): ApiError {
  const b = body as { code?: string; message?: string; detail?: unknown } | null;
  const detail = typeof b?.detail === 'string' ? b.detail : undefined;
  return new ApiError(status, b?.code ?? `HTTP_${status}`, b?.message ?? detail ?? `HTTP ${status}`);
}

async function json<T>(r: Response): Promise<T> {
  if (r.ok) return r.json() as Promise<T>;
  throw responseError(r.status, await r.json().catch(() => null));
}

export const getLibrary = (signal?: AbortSignal) => fetch(`${API_URL}/library`, { signal }).then((r) => json<LibraryCase[]>(r));
export const getHealth = (signal?: AbortSignal) => fetch(`${API_URL}/health`, { signal }).then((r) => json<Health>(r));
export const getJob = (id: string, signal?: AbortSignal) => fetch(`${API_URL}/jobs/${encodeURIComponent(id)}`, { signal }).then((r) => json<JobStatus>(r));
export const getReport = (id: string, signal?: AbortSignal) => fetch(`${API_URL}/jobs/${encodeURIComponent(id)}/report`, { signal }).then((r) => json<Report>(r));
export const modelUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/model.glb`;

export const segUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/seg.nii.gz`;
export const flairUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/flair.nii.gz`;

export async function createJob(files: Record<Sequence, File>, onProgress?: (fraction: number) => void): Promise<string> {
  const body = new FormData();
  for (const [seq, f] of Object.entries(files)) body.append(seq, f, f.name);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) reject(responseError(xhr.status, xhr.response));
      else if (typeof xhr.response?.jobId === 'string') resolve(xhr.response.jobId);
      else reject(new Error('Invalid job response'));
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.open('POST', `${API_URL}/jobs`);
    xhr.responseType = 'json';
    xhr.send(body);
  });
}
