import { useBoardToast } from './history';

export function Toast() {
  const text = useBoardToast((s) => s.text);
  if (!text) return null;
  return (
    <p role="status" style={{
      position: 'fixed', left: '50%', bottom: 24, zIndex: 40, transform: 'translateX(-50%)',
      margin: 0, padding: '8px 14px', borderRadius: 999, background: '#fff', color: 'var(--nv-text)',
      boxShadow: '0 8px 24px rgba(0,0,0,.16)', font: '600 13px/1.3 var(--nv-font)',
    }}>{text}</p>
  );
}
