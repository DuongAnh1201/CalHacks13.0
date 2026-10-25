/** Fixed, key-free screenshot policy; owned by the server; browser submits event facts only. */
export const SCREENSHOT_INTERVAL_MS = 30_000;
export const SCREENSHOT_MEETING_CAP = 20;
export const SCREENSHOT_MAX_BYTES = 600 * 1024;
export function screenshotRequest(text: string): boolean {
  return /\b(screenshot|screen\s?shot|capture (?:the |this |a )?(?:screen|view))\b/i.test(text);
}
export function screenshotReason(tool: string, args: Record<string, unknown>): string | null {
  if (tool === 'capture_screenshot') {
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    return reason && reason.length <= 120 ? reason : null;
  }
  if (tool === 'focus_region' && args.region === 'tumor') return 'Tumor focused';
  if (tool === 'get_tumor_metrics') return 'Tumor metrics requested';
  if (tool === 'get_report') return 'Report requested';
  if (tool === 'set_mode' && ['xray', 'exploded', 'cutaway'].includes(String(args.mode))) return `Mode set to ${args.mode}`;
  if (tool === 'add_annotation') return 'Annotation added';
  return null;
}
