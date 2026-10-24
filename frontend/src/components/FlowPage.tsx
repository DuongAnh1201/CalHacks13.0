import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { FlowStepper } from './FlowStepper';
import { TopNavBar } from './TopNavBar';
import css from './FlowPage.module.css';

export function FlowPage({ step, title, lede, children }: { step: 1 | 2 | 3; title: string; lede: string; children: ReactNode }) {
  return (
    <div className={step === 2 ? `${css.page} ${css.fill}` : css.page}>
      <TopNavBar />
      <main className={step === 2 ? `${css.column} ${css.centered}` : css.column}>
        <FlowStepper step={step} />
        <header className={css.heading}>
          <h1>{title}</h1>
          <p>{lede}</p>
        </header>
        {children}
      </main>
      <Footer />
    </div>
  );
}
