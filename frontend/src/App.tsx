import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from './routes/Home';
import Join from './routes/Join';
import { legacyRoutes } from './routes/legacy';
import PlayJoin from './routes/PlayJoin';
import Processing from './routes/Processing';
import Upload from './routes/Upload';

// The viewer pages carry three.js and NiiVue: load them on first visit, so the home page stays light.
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/explore', lazy: page(() => import('./routes/Explore')) },
  { path: '/play', lazy: page(() => import('./routes/Play')) },
  { path: '/play/join/:code', element: <PlayJoin /> },
  { path: '/upload', element: <Upload /> },
  { path: '/jobs/:id/processing', element: <Processing /> },
  { path: '/jobs/:id/mri', lazy: page(() => import('./routes/MriWorkspace')) },
  { path: '/jobs/:id/3d', lazy: page(() => import('./routes/Brain3D')) },
  ...legacyRoutes,
  { path: '/join/:code', element: <Join /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
