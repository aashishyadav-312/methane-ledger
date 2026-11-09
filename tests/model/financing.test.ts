import { describe, expect, test } from 'vitest';
import { CONSTANTS, evaluate } from '../../src/model';
import { FIN_DEFAULTS, financing, type FinancingResult } from '../../src/model/financing';
import { MOONIDIH_V1, MOONIDIH_WB2034, REFERENCE_TECH } from '../../src/model/fixtures';
import { expectGolden, settingsWith } from './helpers';

import financingV1 from '../golden/financing_v1.json';

type Cases = 'at_15' | 'at_5' | 'wb2034_at_15';
const CASES: Record<Cases, { mine: typeof MOONIDIH_V1; priceUsdPerT: number }> = {
  at_15: { mine: MOONIDIH_V1, priceUsdPerT: 15 },
  at_5: { mine: MOONIDIH_V1, priceUsdPerT: 5 },
  wb2034_at_15: { mine: MOONIDIH_WB2034, priceUsdPerT: 15 },
};

const run = (name: Cases): FinancingResult => {
  const { mine, priceUsdPerT } = CASES[name];
  return financing(mine, settingsWith({ creditPriceUsdPerT: priceUsdPerT }), REFERENCE_TECH, CONSTANTS);
};

function cashMatches(actual: number[], expected: number[], label: string) {
  expect(actual.length, `${label} length`).toBe(expected.length);
  expected.forEach((e, i) => expectGolden(actual[i], e, 'usd', `${label}[${i}]`));
}

describe('financing parameters', () => {
  test('defaults equal FIN in reference/ref_v1.py', () => {
    const p = financingV1.params;
    expect(FIN_DEFAULTS).toEqual({
      royaltyShare: p.royalty,
      developerHurdleRate: p.hurdle,
      forwardYears: p.k,
      forwardDiscount: p.fwd_discount,
      floorUsdPerT: p.floor,
      floorPremiumUsdPerT: p.premium,
      floorYears: p.floor_years,
      grantShare: p.grant,
    });
  });
});

describe.each(Object.keys(CASES) as Cases[])('financing_v1 %s', (name) => {
  const g = financingV1[name];
  const f = run(name);

  test('A: Coal India funds it', () => {
    cashMatches(f.A.cilCashUsd, g.A.cil_cash, 'A cash');
    expectGolden(f.A.cilNpvUsd, g.A.cil_npv, 'usd', 'A npv');
    expectGolden(f.A.cilIrr, g.A.cil_irr, 'irr', 'A irr');
    expectGolden(f.A.breakevenUsdPerT, g.A.breakeven, 'usdPerT', 'A breakeven');
  });

  test('B: a developer builds and runs it', () => {
    cashMatches(f.B.developerCashUsd, g.B.dev_cash, 'B developer cash');
    cashMatches(f.B.cilCashUsd, g.B.cil_cash, 'B Coal India cash');
    expectGolden(f.B.cilNpvUsd, g.B.cil_npv, 'usd', 'B npv');
    expectGolden(f.B.developerIrr, g.B.dev_irr, 'irr', 'B developer irr');
    expect(f.B.developerDeclines).toBe(g.B.developer_declines);
    expectGolden(f.B.maxRoyaltyShare, g.B.max_royalty, 'irr', 'B max royalty');
    expectGolden(f.B.breakevenForDeveloperUsdPerT, g.B.breakeven_for_developer, 'usdPerT', 'B developer breakeven');
    expect(f.B.breakevenUsdPerT).toBe(f.B.breakevenForDeveloperUsdPerT);
  });

  test('C: a buyer pays in advance', () => {
    cashMatches(f.C.cilCashUsd, g.C.cil_cash, 'C cash');
    expectGolden(f.C.prepaymentUsd, g.C.prepayment, 'usd', 'C prepayment');
    expectGolden(f.C.prepaymentShareOfCapex, g.C.share_of_capex, 'irr', 'C share of capex');
    expectGolden(f.C.cilNpvUsd, g.C.cil_npv, 'usd', 'C npv');
    expectGolden(f.C.cilIrr, g.C.cil_irr, 'irr', 'C irr');
  });

  test('D: a price floor', () => {
    cashMatches(f.D.cilCashUsd, g.D.cil_cash, 'D cash');
    expectGolden(f.D.premiumPaidUsd, g.D.premium_paid, 'usd', 'D premium');
    expectGolden(f.D.cilNpvUsd, g.D.cil_npv, 'usd', 'D npv');
    expectGolden(f.D.cilIrr, g.D.cil_irr, 'irr', 'D irr');
    expectGolden(f.D.breakevenUsdPerT, g.D.breakeven, 'usdPerT', 'D breakeven');
    expect(f.D.floorCoversAtZero).toBe(g.D.floor_covers_at_zero);
  });

  test('E: a grant', () => {
    cashMatches(f.E.cilCashUsd, g.E.cil_cash, 'E cash');
    expectGolden(f.E.grantUsd, g.E.grant, 'usd', 'E grant');
    expectGolden(f.E.cilNpvUsd, g.E.cil_npv, 'usd', 'E npv');
    expectGolden(f.E.cilIrr, g.E.cil_irr, 'irr', 'E irr');
    expectGolden(f.E.breakevenUsdPerT, g.E.breakeven, 'usdPerT', 'E breakeven');
  });
});

describe('financing properties', () => {
  const settings = settingsWith();

  test('A matches evaluate', () => {
    const f = financing(MOONIDIH_V1, settings, REFERENCE_TECH, CONSTANTS);
    const r = evaluate(MOONIDIH_V1, settings, REFERENCE_TECH, CONSTANTS);
    expect(f.A.breakevenUsdPerT).toBeCloseTo(r.breakevenUsdPerT as number, 9);
    expect(f.A.cilNpvUsd).toBeCloseTo(r.npvUsd, 3);
    expect(f.A.cilCashUsd).toEqual(r.cashUsd);
  });

  test('Coal India pays nothing up front under B, so it has no IRR', () => {
    const f = financing(MOONIDIH_V1, settings, REFERENCE_TECH, CONSTANTS);
    expect(f.B.cilCashUsd[0]).toBe(0);
    expect(f.B.cilIrr).toBeNull();
  });

  test('NPV of C and E at their own break-even is 0', () => {
    const at = (p: number) => financing(MOONIDIH_V1, settingsWith({ creditPriceUsdPerT: p }), REFERENCE_TECH, CONSTANTS);
    const c = at(15).C.breakevenUsdPerT as number;
    expect(Math.abs(at(c).C.cilNpvUsd)).toBeLessThan(1);
    const e = at(15).E.breakevenUsdPerT as number;
    expect(Math.abs(at(e).E.cilNpvUsd)).toBeLessThan(1);
  });

  test('the user grant counts in A to D, and structure E replaces it', () => {
    const noGrant = financing(MOONIDIH_V1, settings, REFERENCE_TECH, CONSTANTS);
    const withGrant = financing(MOONIDIH_V1, settingsWith({ grantShare: 0.15 }), REFERENCE_TECH, CONSTANTS);
    expect(withGrant.A.breakevenUsdPerT as number).toBeLessThan(noGrant.A.breakevenUsdPerT as number);
    expect(withGrant.E.breakevenUsdPerT).toBeCloseTo(noGrant.E.breakevenUsdPerT as number, 9);
    expect(withGrant.E.grantUsd).toBeCloseTo(noGrant.E.grantUsd, 6);
  });

  test('a mine with nothing to abate has no break-even and the floor never pays', () => {
    const none = { ...MOONIDIH_V1, drainedConc: 0.1, vamConc: 0.001, amm: undefined };
    const f = financing(none, settings, REFERENCE_TECH, CONSTANTS);
    expect(f.A.breakevenUsdPerT).toBeNull();
    expect(f.D.breakevenUsdPerT).toBeNull();
    expect(f.D.floorCoversAtZero).toBe(false);
  });
});
