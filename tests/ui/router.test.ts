import { describe, expect, it } from 'vitest';
import { mineHref, parseHash, routeHref } from '../../src/app/router';

describe('parseHash', () => {
  it('matches every fixed route', () => {
    const cases: [string, string][] = [
      ['#/', 'map'],
      ['', 'map'],
      ['#', 'map'],
      ['#/compare', 'compare'],
      ['#/method', 'method'],
      ['#/assumptions', 'assumptions'],
      ['#/sources', 'sources'],
      ['#/data', 'data'],
      ['#/ui', 'ui'],
    ];
    for (const [hash, name] of cases) expect(parseHash(hash).route.name, hash).toBe(name);
  });

  it('reads the mine id', () => {
    expect(parseHash('#/mine/bccl-moonidih').route).toEqual({ name: 'mine', id: 'bccl-moonidih' });
  });

  it('keeps the query string and ignores it when matching', () => {
    const loc = parseHash('#/mine/bccl-moonidih?p=15&close=2034');
    expect(loc.route).toEqual({ name: 'mine', id: 'bccl-moonidih' });
    expect(loc.path).toBe('/mine/bccl-moonidih');
    expect(loc.query.get('p')).toBe('15');
    expect(loc.query.get('close')).toBe('2034');
    expect(parseHash('#/?x=1').route.name).toBe('map');
    expect(parseHash('#/?x=1').query.get('x')).toBe('1');
  });

  it('tolerates a trailing slash and a missing leading slash', () => {
    expect(parseHash('#/method/').route.name).toBe('method');
    expect(parseHash('#method').route.name).toBe('method');
  });

  it('shows not found for unknown routes', () => {
    expect(parseHash('#/nowhere').route).toEqual({ name: 'notFound', path: '/nowhere' });
    expect(parseHash('#/mine').route.name).toBe('notFound');
    expect(parseHash('#/mine/').route.name).toBe('notFound');
    expect(parseHash('#/mine/a/b').route.name).toBe('notFound');
    expect(parseHash('#/mine/%E0%A4%A').route.name).toBe('notFound');
  });
});

describe('links', () => {
  it('builds hash links with a query', () => {
    expect(routeHref('/method')).toBe('#/method');
    expect(routeHref('/compare', { p: 15 })).toBe('#/compare?p=15');
    expect(mineHref('bccl-moonidih', { p: 15, close: 2034 })).toBe('#/mine/bccl-moonidih?p=15&close=2034');
  });
});
