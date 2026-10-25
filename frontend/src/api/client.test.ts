import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, API_URL, createJob, getJob, responseError } from './client';
import type { Sequence } from './upload';

afterEach(() => vi.unstubAllGlobals());

describe('response errors', () => {
  it.each([
    [422, { code: 'INVALID_FORMAT', message: 'Upload NIfTI files' }, 'INVALID_FORMAT', 'Upload NIfTI files'],
    [404, { detail: 'Unknown job' }, 'HTTP_404', 'Unknown job'],
    [409, { detail: 'Still processing' }, 'HTTP_409', 'Still processing'],
    [500, null, 'HTTP_500', 'HTTP 500'],
    [422, { detail: [{ msg: 'Invalid input' }] }, 'HTTP_422', 'HTTP 422'],
  ])('maps HTTP %s without losing the backend message', (status, body, code, message) => {
    const error = responseError(status as number, body);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });

  it('keeps fetch callers on the same error contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Unknown job' }), { status: 404 })));
    await expect(getJob('missing')).rejects.toMatchObject({ status: 404, message: 'Unknown job' });
  });
});

class UploadRequest {
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 202;
  response: unknown = { jobId: 'accepted-job' };
  responseType = '';
  open = vi.fn();
  send = vi.fn();
}

function setupUpload() {
  const xhr = new UploadRequest();
  vi.stubGlobal('XMLHttpRequest', class { constructor() { return xhr; } });
  const files = Object.fromEntries(['t1c', 't1', 't2', 'flair'].map((seq) => [seq, new File(['scan'], `${seq}.nii`)])) as Record<Sequence, File>;
  return { xhr, files };
}

describe('job upload', () => {
  it('reports only computable byte progress and waits for server acceptance after 100%', async () => {
    const { xhr, files } = setupUpload();
    const progress = vi.fn();
    const accepted = vi.fn();
    const result = createJob(files, progress).then(accepted);
    expect(xhr.open).toHaveBeenCalledWith('POST', `${API_URL}/jobs`);
    const body = xhr.send.mock.calls[0][0] as FormData;
    expect([...body.keys()]).toEqual(['t1c', 't1', 't2', 'flair']);
    expect((body.get('flair') as File).name).toBe('flair.nii');
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 4, total: 0 });
    expect(progress).not.toHaveBeenCalled();
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    expect(progress.mock.calls).toEqual([[0.25], [1]]);
    await Promise.resolve();
    expect(accepted).not.toHaveBeenCalled();
    xhr.onload?.();
    await result;
    expect(accepted).toHaveBeenCalledWith('accepted-job');
  });

  it('rejects backend errors as ApiError', async () => {
    const { xhr, files } = setupUpload();
    const result = createJob(files);
    xhr.status = 422;
    xhr.response = { code: 'INVALID_FORMAT', message: 'Wrong format' };
    xhr.onload?.();
    await expect(result).rejects.toMatchObject({ name: 'ApiError', status: 422, code: 'INVALID_FORMAT', message: 'Wrong format' });
  });

  it.each(['onerror', 'onabort'] as const)('keeps %s outside ApiError for the offline message', async (event) => {
    const { xhr, files } = setupUpload();
    const result = createJob(files);
    xhr[event]?.();
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.not.toBeInstanceOf(ApiError);
  });
});
