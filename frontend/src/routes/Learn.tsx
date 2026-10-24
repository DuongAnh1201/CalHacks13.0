import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';

export default function Learn() {
  return (<><TopNavBar active="learn" /><main style={{ height: 'calc(100vh - var(--nv-header-h) - var(--nv-footer-h))' }}>Loading atlas…</main><Footer /></>);
}
