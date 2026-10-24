import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Explore from './routes/Explore';
import Learn from './routes/Learn';
import Processing from './routes/Processing';
import Results from './routes/Results';
import Upload from './routes/Upload';

const router = createBrowserRouter([
  { path: '/', element: <Upload /> },
  { path: '/jobs/:id/processing', element: <Processing /> },
  { path: '/jobs/:id/results', element: <Results /> },
  { path: '/jobs/:id/explore', element: <Explore /> },
  { path: '/learn', element: <Learn /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
