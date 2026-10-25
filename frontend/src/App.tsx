import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Brain3D from './routes/Brain3D';
import Explore from './routes/Explore';
import Play from './routes/Play';
import Home from './routes/Home';
import Join from './routes/Join';
import { legacyRoutes } from './routes/legacy';
import MriWorkspace from './routes/MriWorkspace';
import Processing from './routes/Processing';
import Upload from './routes/Upload';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/explore', element: <Explore /> },
  { path: '/play', element: <Play /> },
  { path: '/upload', element: <Upload /> },
  { path: '/jobs/:id/processing', element: <Processing /> },
  { path: '/jobs/:id/mri', element: <MriWorkspace /> },
  { path: '/jobs/:id/3d', element: <Brain3D /> },
  ...legacyRoutes,
  { path: '/join/:code', element: <Join /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
