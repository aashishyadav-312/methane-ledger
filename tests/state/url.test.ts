import { describe, expect, it } from 'vitest';
import { decodeMineView, encodeMineView, type MineView, type MineViewContext } from '../../src/state/url';
import { applyOverrides } from '../../src/state/session';

const defaults: MineView = {
  priceUsdPerT: 15,
  drainedMm3PerYr: 20,
  closureBasis: 'now',
  closureYear: 2034,
  vamConc: 0.003,
  drainedUse: 'power',
  grantShare: 0,
  discountRate: 0.1,
  gwp: 28,
  creditingYears: 10,
};

const ctx: MineViewContext = {
  defaults,
  basisYears: { now: 2034, target: 2030 },
  priceRangeUsdPerT: { min: 0, max: 200 },
  drainedRangeMm3PerYr: { min: 5, max: 80 },
  startYear: 2027,
  vamConcOptions: [0.001, 0.003, 0.006],
  grantOptions: [0, 0.15, 0.3],
  discountOptions: [0.08, 0.1, 0.12],
  gwpOptions: [21, 28, 29.8],
  creditingOptions: [10, 15],
};

describe('mine view in the URL', () => {
  it('round-trips every control', () => {
    const view: MineView = {
      priceUsdPerT: 18.25,
      drainedMm3PerYr: 42,
      closureBasis: 'custom',
      closureYear: 2031,
      vamConc: 0.006,
      drainedUse: 'flare',
      grantShare: 0.15,
      discountRate: 0.12,
      gwp: 29.8,
      creditingYears: 15,
    };
    const query = encodeMineView(view);
    expect(query.toString()).toBe('p=18.25&d=42&cb=custom&close=2031&vam=0.6&use=flare&g=15&r=12&gwp=29.8&n=15');
    expect(decodeMineView(query, ctx)).toEqual(view);
  });

  it('takes the year from a basis, and the defaults for missing or bad values', () => {
    const view = decodeMineView(new URLSearchParams('cb=target&close=2040&r=9&vam=x&use=oil&p=-3'), ctx);
    expect(view.closureYear).toBe(2030);
    expect(view.discountRate).toBe(0.1);
    expect(view.vamConc).toBe(0.003);
    expect(view.drainedUse).toBe('power');
    expect(view.priceUsdPerT).toBe(0);
  });

  it('reads a link that only gives a year', () => {
    expect(decodeMineView(new URLSearchParams('close=2034'), ctx).closureBasis).toBe('now');
    const custom = decodeMineView(new URLSearchParams('close=2050'), ctx);
    expect([custom.closureBasis, custom.closureYear]).toEqual(['custom', 2036]);
  });
});

describe('session overrides', () => {
  it('writes values under a prefix and leaves the original alone', () => {
    const target = { power: { capexUsdPerKw: 1300 }, flare: { minConc: 0.25 } };
    const out = applyOverrides(target, { 'tech.power.capexUsdPerKw': 1500, 'tech.flare': 1, other: 2 }, 'tech');
    expect(out.power.capexUsdPerKw).toBe(1500);
    expect(out.flare.minConc).toBe(0.25);
    expect(target.power.capexUsdPerKw).toBe(1300);
  });
});
