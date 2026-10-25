/** Browser only: canvas -> JPEG -> authenticated upload. Event policy lives in Convex. */
export interface CapturedImage { blob: Blob; width: number; height: number }
export interface ScreenshotUpload {
  generateUploadUrl(): Promise<string>;
  recordScreenshot(image: { storageId: string; width: number; height: number }): Promise<unknown>;
}
const MAX_BYTES = 600 * 1024; // Mirror of convex/lib/screenshotPolicy.ts transport limit.
export async function captureCanvas(canvas: HTMLCanvasElement, createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')): Promise<CapturedImage> {
  if (!canvas.width || !canvas.height) throw new Error('Viewer canvas is not ready.');
  const scale = Math.min(1, 1280 / canvas.width);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const output = createCanvas(); output.width = width; output.height = height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Screenshot canvas is unavailable.');
  context.drawImage(canvas, 0, 0, width, height);
  for (const quality of [0.85, 0.7, 0.5, 0.3]) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      try { output.toBlob(result => result ? resolve(result) : reject(new Error('Screenshot encoding failed.')), 'image/jpeg', quality); }
      catch { reject(new Error('Screenshot capture is unavailable.')); }
    });
    if (blob.type !== 'image/jpeg') throw new Error('JPEG screenshots are unavailable.');
    if (blob.size <= MAX_BYTES) return { blob, width, height };
  }
  throw new Error('Screenshot exceeds 600 KB.');
}
export async function uploadScreenshot(image: CapturedImage, upload: ScreenshotUpload, fetcher: typeof fetch = fetch): Promise<unknown> {
  const url = await upload.generateUploadUrl();
  const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': image.blob.type }, body: image.blob });
  if (!response.ok) throw new Error('Screenshot upload failed.');
  const result: unknown = await response.json();
  const storageId = (result as { storageId?: unknown })?.storageId;
  if (typeof storageId !== 'string') throw new Error('Invalid screenshot upload response.');
  return upload.recordScreenshot({ storageId, width: image.width, height: image.height });
}
