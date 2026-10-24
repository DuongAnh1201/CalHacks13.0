import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Brain3D from './routes/Brain3D';
import Home from './routes/Home';
import Learn from './routes/Learn';
import { legacyRoutes } from './routes/legacy';
import MriWorkspace from './routes/MriWorkspace';
import Processing from './routes/Processing';
import Upload from './routes/Upload';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/upload', element: <Upload /> },
  { path: '/jobs/:id/processing', element: <Processing /> },
  { path: '/jobs/:id/mri', element: <MriWorkspace /> },
  { path: '/jobs/:id/3d', element: <Brain3D /> },
  ...legacyRoutes,
  { path: '/learn', element: <Learn /> },
  { path: '/learn/:wsId', element: <Learn /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
