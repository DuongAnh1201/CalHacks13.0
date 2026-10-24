import { isValidElement } from 'react';
import { matchRoutes, resolvePath } from 'react-router-dom';
import { expect, it } from 'vitest';
import { legacyRoutes } from './legacy';

const target = (url: string) => {
  const el = matchRoutes(legacyRoutes, url)?.[0].route.element;
  if (!isValidElement<{ to: string }>(el)) throw new Error(`no redirect for ${url}`);
  return resolvePath(el.props.to, url).pathname;
};

it('/results redirects to /mri', () => expect(target('/jobs/abc/results')).toBe('/jobs/abc/mri'));
it('/explore redirects to /3d', () => expect(target('/jobs/abc/explore')).toBe('/jobs/abc/3d'));
