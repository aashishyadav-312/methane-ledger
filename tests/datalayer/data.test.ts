import { describe, expect, test } from 'vitest';
import {
  getConstants,
  getCosts,
  getCostsRecord,
  getDefaultSettings,
  getMapData,
  getMine,
  getMineInput,
  getPrices,
  getSettings,
  getTech,
  getTimeline,
  listMines,
  loadAll,
  unwrapMine,
} from '../../src/data/load';
import {
  ClosureTimelineSchema,
  ConstantsRecordSchema,
  CostsRecordSchema,
  MapDataSchema,
  MineRecordsSchema,
  PriceScenariosSchema,
  QUALITY_VALUES,
  SettingsFileSchema,
  TechRecordSchema,
} from '../../src/data/schemas';
import { collectFields, listDummyFields } from '../../src/data/unwrap';
import { DataValidationError, parseData } from '../../src/data/validate';
import constantsJson from '../../data/constants.json';
import costsJson from '../../data/costs.json';
import minesJson from '../../data/mines.json';
import pricesJson from '../../data/prices.json';
import settingsJson from '../../data/settings.default.json';
import technologiesJson from '../../data/technologies.json';
import closureTimelineJson from '../../src/generated/closure_timeline.json';
import minesMapJson from '../../src/generated/mines_map.json';

const clone = <T>(x: T): T => structuredClone(x);

describe('every data file validates', () => {
  test.each([
    ['data/mines.json', MineRecordsSchema, minesJson],
    ['data/technologies.json', TechRecordSchema, technologiesJson],
    ['data/prices.json', PriceScenariosSchema, pricesJson],
    ['data/constants.json', ConstantsRecordSchema, constantsJson],
    ['data/settings.default.json', SettingsFileSchema, settingsJson],
    ['data/costs.json', CostsRecordSchema, costsJson],
    ['src/generated/closure_timeline.json', ClosureTimelineSchema, closureTimelineJson],
    ['src/generated/mines_map.json', MapDataSchema, minesMapJson],
  ] as const)('%s', (file, schema, raw) => {
    expect(() => parseData(file, schema, raw)).not.toThrow();
  });

  test('loadAll validates the whole bundle', () => {
    const bundle = loadAll();
    expect(bundle.mines).toHaveLength(6);
    expect(bundle.prices).toHaveLength(8);
  });
});

describe('malformed data fails with a readable message', () => {
  test('a string where a number is expected names the file, the path and the type', () => {
    const bad = clone(minesJson) as unknown as Array<{ captureEff: { vam: { value: unknown } } }>;
    bad[0]!.captureEff.vam.value = 'high';
    const run = () => parseData('data/mines.json', MineRecordsSchema, bad);
    expect(run).toThrow(DataValidationError);
    expect(run).toThrow(/data\/mines\.json/);
    expect(run).toThrow(/\[0\]\.captureEff\.vam\.value/);
    expect(run).toThrow(/expected number/);
  });

  test('a missing source is reported at its path', () => {
    const bad = clone(technologiesJson) as unknown as { power: { capexUsdPerKw: { source?: string } } };
    delete bad.power.capexUsdPerKw.source;
    expect(() => parseData('data/technologies.json', TechRecordSchema, bad)).toThrow(/power\.capexUsdPerKw\.source/);
  });

  test('an unknown quality value is rejected', () => {
    const bad = clone(constantsJson) as unknown as { lhvGjPerT: { quality: string } };
    bad.lhvGjPerT.quality = 'guess';
    expect(() => parseData('data/constants.json', ConstantsRecordSchema, bad)).toThrow(/lhvGjPerT\.quality/);
  });

  test('an unknown key is rejected, so typos do not pass silently', () => {
    const bad = clone(settingsJson) as unknown as Record<string, unknown>;
    bad.discountrate = bad.discountRate;
    expect(() => parseData('data/settings.default.json', SettingsFileSchema, bad)).toThrow(/discountrate/);
  });

  test('a fraction above 1 is rejected', () => {
    const bad = clone(minesJson) as unknown as Array<{ drainedConc: { value: number } }>;
    bad[0]!.drainedConc.value = 50;
    expect(() => parseData('data/mines.json', MineRecordsSchema, bad)).toThrow(/\[0\]\.drainedConc\.value/);
  });

  test('a bad closure year reports the failing branch of the union', () => {
    const bad = clone(minesJson) as unknown as Array<{ closureYear: { value?: unknown; from?: string } }>;
    bad[1]!.closureYear = { value: 'soon' };
    expect(() => parseData('data/mines.json', MineRecordsSchema, bad)).toThrow(/\[1\]\.closureYear/);
  });

  test('duplicate mine ids are rejected', () => {
    const bad = clone(minesJson) as unknown as Array<{ id: string }>;
    bad[1]!.id = bad[0]!.id;
    expect(() => parseData('data/mines.json', MineRecordsSchema, bad)).toThrow(/duplicate mine id/);
  });

  test('a mine with neither measured gas nor a specific emission is rejected', () => {
    const bad = clone(minesJson) as unknown as Array<Record<string, unknown>>;
    delete bad[1]!.specificEmissionM3PerT;
    expect(() => parseData('data/mines.json', MineRecordsSchema, bad)).toThrow(/specificEmissionM3PerT/);
  });

  test('price scenarios need exactly one default and a null price only for custom', () => {
    const noDefault = clone(pricesJson).map((p) => ({ ...p, default: false }));
    expect(() => parseData('data/prices.json', PriceScenariosSchema, noDefault)).toThrow(/exactly one default/);
    const priced = clone(pricesJson) as unknown as Array<{ id: string; priceUsdPerT: unknown }>;
    priced.find((p) => p.id === 'vcm_low')!.priceUsdPerT = null;
    expect(() => parseData('data/prices.json', PriceScenariosSchema, priced)).toThrow(/priceUsdPerT/);
  });

  test('a generated file with the wrong shape is reported by file and path', () => {
    const bad = clone(minesMapJson) as unknown as { mines: Array<{ x: unknown }> };
    bad.mines[0]!.x = '561';
    const run = () => parseData('src/generated/mines_map.json', MapDataSchema, bad);
    expect(run).toThrow(/src\/generated\/mines_map\.json/);
    expect(run).toThrow(/mines\[0\]\.x/);
  });

  test('crediting years other than 10 or 15 are rejected', () => {
    const bad = clone(settingsJson) as unknown as { creditingYears: { value: number } };
    bad.creditingYears.value = 12;
    expect(() => parseData('data/settings.default.json', SettingsFileSchema, bad)).toThrow(/creditingYears\.value/);
  });

  test('an unknown cost basis is rejected', () => {
    const bad = clone(settingsJson) as unknown as { costModel: { value: string } };
    bad.costModel.value = 'cheap';
    expect(() => parseData('data/settings.default.json', SettingsFileSchema, bad)).toThrow(/costModel\.value/);
  });

  test('cost shares that do not sum to 1 are rejected', () => {
    const bad = clone(costsJson) as unknown as { split: { power: { value: number[] } } };
    bad.split.power.value = [0.65, 0.1, 0.15, 0.2];
    expect(() => parseData('data/costs.json', CostsRecordSchema, bad)).toThrow(/split\.power\.value/);
  });

  test('a fractional headcount is rejected', () => {
    const bad = clone(costsJson) as unknown as { headcount: { power: { value: number } } };
    bad.headcount.power.value = 12.5;
    expect(() => parseData('data/costs.json', CostsRecordSchema, bad)).toThrow(/headcount\.power\.value/);
  });
});

describe('quality values', () => {
  test('the four allowed values', () => {
    expect([...QUALITY_VALUES]).toEqual(['measured', 'estimated', 'literature', 'dummy']);
  });

  test('every wrapped field in every authored file uses one of them, and has a unit and a source', () => {
    const all = [loadAll().mines, loadAll().tech, loadAll().prices, loadAll().constants, loadAll().settings];
    const fields = all.flatMap((x) => collectFields(x));
    expect(fields.length).toBeGreaterThan(100);
    for (const { path, field } of fields) {
      expect(QUALITY_VALUES, path).toContain(field.quality);
      expect(field.unit.length, path).toBeGreaterThan(0);
      expect(field.source.length, path).toBeGreaterThan(0);
    }
  });

  test('dummy values say DUMMY or placeholder in their source', () => {
    const bundle = loadAll();
    for (const { path, field } of listDummyFields([bundle.mines, bundle.tech, bundle.settings])) {
      expect(field.source, path).toMatch(/DUMMY|placeholder/i);
    }
  });
});

describe('Moonidih', () => {
  const timeline = getTimeline();
  const moonidihRecord = getMine('bccl-moonidih')!;

  // PLAN_V1 Appendix B6, written out here so this test does not depend on Step 2's fixtures.
  const moonidihV1 = {
    id: 'bccl-moonidih',
    name: 'Moonidih',
    closureYear: 2030,
    productionMtPerYr: 0.6,
    drainedMm3PerYr: 20,
    drainedConc: 0.5,
    vamMm3PerYr: 3.45,
    vamConc: 0.003,
    hasDrainageSystem: false,
    powerOfftake: true,
    captureEff: { drained: 1.0, vam: 0.85, amm: 0.7 },
    amm: { fAmm: 0.3, declineD: 0.25, hyperbolicB: 1, conc: 0.6, floodingFactor: 0.5 },
    destructionMandated: { drained: false, vam: false, amm: false },
  };

  test('with the closure year forced to 2030 it deep-equals the moonidih_v1 input', () => {
    expect(unwrapMine(moonidihRecord, timeline, { closureYear: 2030 })).toStrictEqual(moonidihV1);
  });

  test('its default closure year is the workbook year, 2034, read from the timeline', () => {
    expect(moonidihRecord.closureYear).toMatchObject({ from: 'timeline', quality: 'estimated' });
    expect(unwrapMine(moonidihRecord, timeline).closureYear).toBe(2034);
    expect(getMineInput('bccl-moonidih')).toStrictEqual({ ...moonidihV1, closureYear: 2034 });
  });

  test('the closure year follows the timeline, not a copy of it', () => {
    const shifted = { ...timeline, 'bccl-moonidih': { ...timeline['bccl-moonidih']!, runoutYear: 2041 } };
    expect(unwrapMine(moonidihRecord, shifted).closureYear).toBe(2041);
  });

  test('a missing or undated timeline entry gives a readable error', () => {
    expect(() => unwrapMine(moonidihRecord, {})).toThrow(/closure_timeline\.json/);
    const undated = {
      'bccl-moonidih': { ...timeline['bccl-moonidih']!, runoutYear: null, runoutLabel: 'No reserve reported' },
    };
    expect(() => unwrapMine(moonidihRecord, undated)).toThrow(/runoutYear/);
  });

  test('its alternative closure basis is 2030 at the FY2026-27 target, and matches the timeline', () => {
    expect(moonidihRecord.closureAlternatives).toHaveLength(1);
    const alt = moonidihRecord.closureAlternatives![0]!;
    expect(alt).toMatchObject({ id: 'target', value: 2030, quality: 'estimated' });
    expect(alt.value).toBe(timeline['bccl-moonidih']!.yearAtTarget);
  });

  test('it is on the map as the modelled mine', () => {
    const onMap = getMapData().mines.find((m) => m.id === 'bccl-moonidih');
    expect(onMap?.modelled).toBe(true);
  });
});

describe('archetypes (PLAN_V1 Appendix B6)', () => {
  // id, production Mt/yr, specific emission m3/t, drained share, drained conc, VAM conc, closure year
  const table: Array<[string, number, number, number, number, number, number]> = [
    ['archetype-degree-1-ug', 0.5, 0.8, 0, 0, 0.0005, 2036],
    ['archetype-degree-2-ug', 0.5, 5, 0.3, 0.35, 0.002, 2036],
    ['archetype-degree-3-ug', 0.5, 15, 0.5, 0.5, 0.004, 2036],
    ['archetype-degree-3-closing', 0.5, 15, 0.5, 0.5, 0.004, 2030],
    ['archetype-opencast', 5, 0.3, 0, 0, 0, 2036],
  ];

  test.each(table)('%s', (id, prod, se, share, dconc, vconc, closure) => {
    const input = getMineInput(id)!;
    expect(input).toMatchObject({
      id,
      closureYear: closure,
      productionMtPerYr: prod,
      specificEmissionM3PerT: se,
      drainedShare: share,
      drainedConc: dconc,
      vamConc: vconc,
      hasDrainageSystem: false,
      powerOfftake: true,
      captureEff: { drained: 1, vam: 0.85, amm: 0.7 },
      destructionMandated: { drained: false, vam: false, amm: false },
    });
    expect(input.drainedMm3PerYr).toBeUndefined();
    expect(input.vamMm3PerYr).toBeUndefined();
  });

  test('only the closing archetype has an AMM object, with conc 0.60 as for Moonidih', () => {
    const withAmm = listMines()
      .filter((m) => m.amm !== undefined)
      .map((m) => m.id);
    expect(withAmm).toEqual(['bccl-moonidih', 'archetype-degree-3-closing']);
    expect(getMineInput('archetype-degree-3-closing')!.amm).toStrictEqual({
      fAmm: 0.3,
      declineD: 0.25,
      hyperbolicB: 1,
      conc: 0.6,
      floodingFactor: 0.5,
    });
  });

  test('there are five, and the opencast one has no DGMS degree', () => {
    expect(listMines().filter((m) => m.kind === 'archetype')).toHaveLength(5);
    expect(getMine('archetype-opencast')).toMatchObject({ mineType: 'OC', dgmsDegree: null });
  });
});

describe('technology library, constants and settings', () => {
  test('technology values are the SPEC section 5 numbers', () => {
    expect(getTech()).toStrictEqual({
      power: {
        minConc: 0.3,
        destructionEff: 0.995,
        electricalEff: 0.38,
        capexUsdPerKw: 1300,
        opexUsdPerMwh: 15,
        availability: 0.9,
      },
      flare: { minConc: 0.25, destructionEff: 0.98, capexUsdPerMm3Yr: 40000, opexFracOfCapex: 0.05 },
      rto: {
        minConc: 0.002,
        destructionEff: 0.97,
        capexUsdPerM3s: 60000,
        opexFracOfCapex: 0.06,
        fanKwhPerM3sYr: 60000,
      },
      drainage: { capexUsdPerMm3Yr: 250000, opexFracOfCapex: 0.04 },
      monitoring: { capexUsd: 250000 },
    });
  });

  test('constants', () => {
    expect(getConstants()).toStrictEqual({
      rhoTPerThousandM3: 0.67,
      lhvGjPerT: 50,
      co2PerCh4: 44 / 16,
      gwpOptions: [21, 28, 29.8],
    });
  });

  test('settings are the SPEC section 11 defaults plus escalation 0 and grant 0', () => {
    expect(getSettings()).toStrictEqual({
      startYear: 2027,
      creditingYears: 10,
      creditPriceUsdPerT: 15,
      priceEscalation: 0,
      discountRate: 0.1,
      gwp: 28,
      brokerShare: 0.05,
      issuanceFeeUsdPerT: 0.2,
      powerPriceUsdPerMwh: 80,
      validationCostUsd: 80000,
      verificationCostUsdPerYr: 50000,
      contingency: 0.15,
      grantShare: 0,
      usdToInr: 95,
      costModel: 'v1', // temporary: pages do not pass cost parameters yet (see getSettings in src/data/load.ts)
    });
  });

  test('the file default is the India build-up, at 95 rupees per dollar', () => {
    expect(getDefaultSettings().costModel).toBe('buildup');
    expect(getDefaultSettings().usdToInr).toBe(95);
  });

  test('cost parameters are the Appendix G defaults', () => {
    const c = getCosts();
    expect(c.localFactor).toBe(0.6);
    expect(c.staffCostInr).toBe(900_000);
    expect(c.headcount).toEqual({ power: 12, flare: 2, rto: 4, drainage: 6, monitoring: 1 });
    expect(c.split.drainage).toEqual([0.3, 0.3, 0.25, 0.15]);
    expect(c.nonlabourOm).toEqual({ powerPerMwh: 9, flareFrac: 0.03, rtoFrac: 0.035, drainageFrac: 0.025 });
  });

  test('every cost parameter is marked dummy until real costs arrive', () => {
    expect(listDummyFields(getCostsRecord()).length).toBe(collectFields(getCostsRecord()).length);
  });

  test('the default GWP is one of the GWP options', () => {
    expect(getConstants().gwpOptions).toContain(getSettings().gwp);
  });
});

describe('price scenarios (PLAN_V1 Appendix E)', () => {
  const byId = Object.fromEntries(getPrices().map((p) => [p.id, p]));

  test('the eight ids, prices and badges', () => {
    expect(getPrices().map((p) => p.id)).toEqual([
      'vcm_low',
      'ccts_floor',
      'ccp_premium',
      'ca_offset',
      'ccts_ceiling',
      'ca_allowance',
      'eu_ets',
      'custom',
    ]);
    const priced = Object.fromEntries(getPrices().map((p) => [p.id, p.priceUsdPerT?.value ?? null]));
    expect(priced).toStrictEqual({
      vcm_low: 7,
      ccts_floor: 11,
      ccp_premium: 15,
      ca_offset: 18.25,
      ccts_ceiling: 30,
      ca_allowance: 33.4,
      eu_ets: 95,
      custom: null,
    });
    const badges = Object.fromEntries(getPrices().map((p) => [p.id, p.badge?.label ?? null]));
    expect(badges).toStrictEqual({
      vcm_low: 'Sellable now (Verra)',
      ccts_floor: 'Sellable later (CCTS)',
      ccp_premium: 'Sellable now (Verra)',
      ca_offset: 'Benchmark only',
      ccts_ceiling: 'Sellable later (CCTS)',
      ca_allowance: 'Benchmark only',
      eu_ets: 'Benchmark only',
      custom: null,
    });
  });

  test('chips and ruler ticks', () => {
    expect(
      getPrices()
        .filter((p) => p.chip)
        .map((p) => p.id),
    ).toEqual(['vcm_low', 'ccts_floor', 'ccp_premium', 'ca_offset', 'ccts_ceiling']);
    expect(
      getPrices()
        .filter((p) => p.ruler)
        .map((p) => p.id),
    ).toEqual(['vcm_low', 'ccts_floor', 'ca_offset', 'ccts_ceiling', 'ca_allowance']);
  });

  test('the default scenario matches the default credit price in settings', () => {
    const def = getPrices().find((p) => p.default)!;
    expect(def.id).toBe('ccp_premium');
    expect(def.priceUsdPerT!.value).toBe(getSettings().creditPriceUsdPerT);
  });

  test('every priced scenario has a date; custom has none', () => {
    for (const p of getPrices()) expect(p.asOf === null, p.id).toBe(p.priceUsdPerT === null);
    expect(byId.custom!.priceUsdPerT).toBeNull();
  });
});

describe('generated files agree with the mine records', () => {
  test('every modelled map mine has a mine record, and every real mine record is on the map as modelled', () => {
    const records = new Map(listMines().map((m) => [m.id, m]));
    for (const m of getMapData().mines.filter((x) => x.modelled)) {
      expect(records.get(m.id)?.kind, m.id).toBe('mine');
    }
    for (const r of listMines().filter((x) => x.kind === 'mine')) {
      expect(getMapData().mines.find((x) => x.id === r.id)?.modelled, r.id).toBe(true);
    }
  });

  test('every record that takes its closure year from the timeline has a dated entry', () => {
    for (const r of listMines()) {
      if ('from' in r.closureYear) expect(getTimeline()[r.id]?.runoutYear, r.id).toBeTypeOf('number');
    }
  });
});
