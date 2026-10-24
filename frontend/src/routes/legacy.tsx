import { Navigate, type RouteObject } from 'react-router-dom';

// Old links keep working: /results became /mri, /explore became /3d (W1).
export const legacyRoutes: RouteObject[] = [
  { path: '/jobs/:id/results', element: <Navigate to="../mri" relative="path" replace /> },
  { path: '/jobs/:id/explore', element: <Navigate to="../3d" relative="path" replace /> },
];
