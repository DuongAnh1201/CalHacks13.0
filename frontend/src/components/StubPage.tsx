import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from './Footer';
import { TopNavBar } from './TopNavBar';
import css from './StubPage.module.css';

interface Props { title: string; figmaFrame: string; active?: 'explore' | 'workspace' | null; children?: ReactNode }

export function StubPage({ title, figmaFrame, active = null, children }: Props) {
  return (
    <div className={css.page}>
      <TopNavBar active={active} />
      <main className={css.main}>
        <section className={css.card}>
          <h1 className={css.title}>{title}</h1>
          <p className={css.meta}>Layout: Figma frame {figmaFrame}. Full screen arrives in spec #2.</p>
          {children}
          <Link to="/learn" className={css.cta}>Open Learning Mode</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
