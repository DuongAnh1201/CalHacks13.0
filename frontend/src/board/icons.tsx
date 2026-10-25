import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const SelectIcon = () => <Icon><path d="M4.5 3.5v11l3-3.2 2.2 4.2 1.8-.9-2.2-4.1H14z" /></Icon>;
export const CommentIcon = () => <Icon><path d="M4 5.5h12v8H8.2L4 16.2z" /></Icon>;
export const StickyIcon = () => <Icon><path d="M5 3.5h7L15.5 7V16.5H5z" /><path d="M12 3.5V7h3.5" /></Icon>;
export const TextIcon = () => <Icon><path d="M5 5h10M10 5v11" /></Icon>;
export const PenIcon = () => <Icon><path d="M12.2 3.8l4 4L7.5 16.5H3.5v-4z" /></Icon>;
export const HighlightIcon = () => <Icon><path d="M4 13.5 10 7.5l3 3-6 6H4z" /><path d="M10 7.5 12 5.5l3 3-2 2" /></Icon>;
export const UndoIcon = () => <Icon><path d="M7.5 7H4V3.5" /><path d="M4.2 7a6 6 0 1 1-1.2 4" /></Icon>;
export const RedoIcon = () => <Icon><path d="M12.5 7H16V3.5" /><path d="M15.8 7a6 6 0 1 0 1.2 4" /></Icon>;
