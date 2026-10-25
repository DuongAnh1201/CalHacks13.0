import type { ReactNode } from 'react';

/** 20px stroke icons for the workspace rail and toolbars; they take the text colour. */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const InfoIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>;
export const PinIcon = () => <Icon><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></Icon>;
export const SlidersIcon = () => <Icon><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Icon>;
export const SparkIcon = () => <Icon><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></Icon>;
export const ChatIcon = () => <Icon><path d="M5 18l-1 3 4-1.5A8.5 8.5 0 1 0 5 18z" /></Icon>;
export const HomeIcon = () => <Icon><path d="M4 11l8-7 8 7M6 10v10h12V10" /></Icon>;
export const TargetIcon = () => <Icon><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Icon>;
export const CloseIcon = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const MinimizeIcon = () => <Icon><path d="M6 12h12" /></Icon>;
