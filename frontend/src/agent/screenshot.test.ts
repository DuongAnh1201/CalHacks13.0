import { describe, expect, it, vi } from 'vitest';
import { captureCanvas, uploadScreenshot } from './screenshot';

describe('browser screenshot capture/upload', () => {
  it('downscales to 1280 width, preserves aspect and encodes JPEG', async () => {
    const drawImage = vi.fn(); const toBlob = vi.fn((callback: BlobCallback, type: string) => callback(new Blob(['jpeg'], { type })));
    const output = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
    const image = await captureCanvas({ width: 2560, height: 1440 } as HTMLCanvasElement, () => output as unknown as HTMLCanvasElement);
    expect(image).toMatchObject({ width: 1280, height: 720 });
    expect(image.blob.type).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalled();
  });
  it('rejects unready canvas and encoder failure', async () => {
    await expect(captureCanvas({ width: 0, height: 0 } as HTMLCanvasElement)).rejects.toThrow(/not ready/);
    await expect(captureCanvas({ width: 2, height: 2 } as HTMLCanvasElement, () => ({ getContext: () => null }) as unknown as HTMLCanvasElement)).rejects.toThrow(/unavailable/);
  });
  it('uploads the blob then records the storage id and true dimensions', async () => {
    const recordScreenshot = vi.fn().mockResolvedValue('row'); const generateUploadUrl = vi.fn().mockResolvedValue('https://upload.invalid');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ storageId: 'file' }));
    await uploadScreenshot({ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), width: 12, height: 8 }, { generateUploadUrl, recordScreenshot }, fetcher);
    expect(recordScreenshot).toHaveBeenCalledWith({ storageId: 'file', width: 12, height: 8 });
  });
  it('does not record failed uploads', async () => {
    const recordScreenshot = vi.fn();
    await expect(uploadScreenshot({ blob: new Blob(['jpeg']), width: 1, height: 1 }, { generateUploadUrl: async () => 'url', recordScreenshot }, vi.fn().mockResolvedValue(new Response('', { status: 500 })))).rejects.toThrow(/upload failed/);
    expect(recordScreenshot).not.toHaveBeenCalled();
  });
});
