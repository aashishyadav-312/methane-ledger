import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluate, type MineInput, type Result } from '../../src/model';
import { getMine } from '../../src/data/load';
import { getOverrides, reset, type Overrides } from '../../src/state/session';
import { mineBase, useMineModel } from '../../src/pages/MinePage/useMineModel';
import { entryInput } from '../../src/pages/ComparePage/compare';
import { INPUT_COLUMNS, SERIES_HEADER } from '../../src/pages/DataPage/columns';
import { inputsTemplateCsv, seriesTemplateCsv } from '../../src/pages/DataPage/templates';
import {
  applyReport,
  applyUploadedSeries,
  checkInputsCsv,
  checkSeriesCsv,
  clearUploaded,
  parseCell,
  type Assignment,
} from '../../src/pages/DataPage/upload';
import costsGolden from '../golden/costs_v1_1.json';

// The pages default to the cost build-up, so the matching case is the build-up one.
const golden = costsGolden.moonidih_2034_default;

const file = (name: string) => readFileSync(resolve(process.cwd(), 'public/templates', name), 'utf8');
const INPUTS = file('mine_inputs_template.csv');
const SERIES = file('mine_series_template.csv');
const MOONIDIH = getMine('bccl-moonidih')!;
const NO_OVERRIDES: Overrides = {};

afterEach(() => reset());

/** Every assignment of a report written in as overrides, whether or not it differs from the default. */
function asOverrides(assignments: Assignment[]): Overrides {
  return Object.fromEntries(assignments.map((a) => [a.path, a.value]));
}

/** Moonidih at its default view with the given overrides, as the Compare page builds it. */
function runMoonidih(overrides: Overrides): { input: MineInput; result: Result } {
  const base = mineBase(MOONIDIH, overrides);
  const input = entryInput(base, base.defaults, overrides);
  return { input, result: evaluate(input, base.settings, base.tech, base.constants, base.costs) };
}

describe('templates', () => {
  it('the files in public/templates are the ones the code builds', () => {
    expect(INPUTS).toBe(inputsTemplateCsv());
    expect(SERIES).toBe(seriesTemplateCsv());
  });

  it('have the header, a units row and one Moonidih row', () => {
    const lines = INPUTS.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].split(',')).toHaveLength(INPUT_COLUMNS.length + 1);
    expect(lines[1].split(',')[0]).toBe('units');
    expect(lines[2].split(',')[0]).toBe('bccl-moonidih');
    expect(SERIES.split('\n')[0]).toBe(SERIES_HEADER.join(','));
  });
});

describe('uploading the unmodified templates', () => {
  it('has no errors and every value equals the default', () => {
    const inputs = checkInputsCsv(INPUTS);
    expect(inputs.errors).toEqual([]);
    expect(inputs.rowsUsed).toBe(1);
    expect(inputs.assignments.length).toBeGreaterThan(10);
    expect(inputs.assignments.filter((a) => a.changed)).toEqual([]);

    const series = checkSeriesCsv(SERIES, NO_OVERRIDES);
    expect(series.errors).toEqual([]);
    expect(series.rowsUsed).toBe(8);
    expect(series.assignments).toHaveLength(3);
    expect(series.assignments.filter((a) => a.changed)).toEqual([]);
  });

  it('reproduces the Moonidih numbers exactly, through the loader and evaluate', () => {
    const before = runMoonidih(NO_OVERRIDES);
    const inputs = checkInputsCsv(INPUTS);
    const series = checkSeriesCsv(SERIES, NO_OVERRIDES);
    const uploaded = asOverrides([...inputs.assignments, ...series.assignments]);
    const after = runMoonidih(uploaded);

    expect(after.input).toEqual(expectSeries(before.input));
    expect(after.result).toEqual(before.result);
    expect(after.result.breakevenUsdPerT).toBeCloseTo(golden.breakeven, 6);
    expect(after.result.capexUsd).toBeCloseTo(golden.capex, 4);
    expect(after.result.erTotalTco2e).toBeCloseTo(golden.er_total, 4);
  });

  it('changes nothing in the session', () => {
    applyReport(checkInputsCsv(INPUTS));
    applyReport(checkSeriesCsv(SERIES, getOverrides()));
    expect(getOverrides()).toEqual({});
  });
});

/** The base input with the three per-year arrays the series template holds. */
function expectSeries(input: MineInput): MineInput {
  const years = 8;
  const flat = (v: number) => Array.from({ length: years }, () => v);
  return { ...input, productionMtPerYr: flat(0.6), drainedMm3PerYr: flat(20), vamMm3PerYr: flat(3.45) };
}

describe('merging changed values', () => {
  it('writes only the changed cells into the session and moves the result', () => {
    const edited = INPUTS.replace('0.003,,no', '0.006,,no'); // vam_conc 0.3% to 0.6%
    const report = checkInputsCsv(edited);
    expect(report.errors).toEqual([]);
    expect(report.assignments.filter((a) => a.changed).map((a) => a.path)).toEqual(['mine.bccl-moonidih.vamConc']);

    const before = runMoonidih(NO_OVERRIDES).result;
    expect(applyReport(report).set).toBe(1);
    expect(getOverrides()).toEqual({ 'mine.bccl-moonidih.vamConc': 0.006 });
    const after = runMoonidih(getOverrides()).result;
    expect(after.breakevenUsdPerT).not.toBe(before.breakevenUsdPerT);
  });

  it('putting a default back clears the earlier override', () => {
    applyReport(checkInputsCsv(INPUTS.replace('0.003,,no', '0.006,,no')));
    expect(Object.keys(getOverrides())).toHaveLength(1);
    applyReport(checkInputsCsv(INPUTS));
    expect(getOverrides()).toEqual({});
  });

  it('a changed series reaches evaluate and is cleared with the other uploads', () => {
    const edited = SERIES.replace('2028,0.6,20,3.45', '2028,0.6,10,3.45');
    const report = checkSeriesCsv(edited, NO_OVERRIDES);
    expect(report.errors).toEqual([]);
    expect(report.assignments.filter((a) => a.changed).map((a) => a.path)).toEqual([
      'series.bccl-moonidih.drainedMm3PerYr',
    ]);
    applyReport(report);
    const input = applyUploadedSeries(runMoonidih(NO_OVERRIDES).input, getOverrides());
    expect(input.drainedMm3PerYr).toEqual([20, 10, 20, 20, 20, 20, 20, 20]);
    expect(runMoonidih(getOverrides()).result.erTotalTco2e).toBeLessThan(runMoonidih(NO_OVERRIDES).result.erTotalTco2e);
    clearUploaded();
    expect(getOverrides()).toEqual({});
  });
});

describe('the mine page uses an uploaded series', () => {
  const edited = SERIES.replace('2028,0.6,20,3.45', '2028,0.6,10,3.45');

  it('leaves the mine page numbers alone when nothing was uploaded', () => {
    const base = mineBase(MOONIDIH, NO_OVERRIDES);
    expect(base.hasUploadedSeries).toBe(false);
    const { result } = renderHook(() => useMineModel(base, base.defaults));
    expect(result.current.result.breakevenUsdPerT).toBeCloseTo(golden.breakeven, 6);
  });

  it('feeds the series into the model, so it matches the Compare page entry', () => {
    applyReport(checkSeriesCsv(edited, NO_OVERRIDES));
    const overrides = getOverrides();
    const base = mineBase(MOONIDIH, overrides);
    expect(base.hasUploadedSeries).toBe(true);
    const { result } = renderHook(() => useMineModel(base, base.defaults));
    expect(result.current.input.drainedMm3PerYr).toEqual([20, 10, 20, 20, 20, 20, 20, 20]);
    expect(result.current.result.erTotalTco2e).toBeLessThan(runMoonidih(NO_OVERRIDES).result.erTotalTco2e);
    expect(result.current.result.erTotalTco2e).toBe(runMoonidih(overrides).result.erTotalTco2e);
  });
});

describe('row errors', () => {
  const row = (cells: string) => INPUTS.replace('bccl-moonidih,2034,0.6,,20,,0.5,3.45,0.003', cells);

  it('names the row, the column and the problem for a value outside its range', () => {
    const report = checkInputsCsv(row('bccl-moonidih,2034,0.6,,20,,0.5,3.45,5'));
    expect(report.rowsUsed).toBe(0);
    expect(report.errors).toEqual([{ row: 3, column: 'vam_conc', message: 'must be at most 1 (found 5)' }]);
    expect(report.assignments).toEqual([]);
  });

  it('says when a cell is not a number', () => {
    const report = checkInputsCsv(row('bccl-moonidih,2034,lots,,20,,0.5,3.45,0.003'));
    expect(report.errors).toEqual([{ row: 3, column: 'production_mt_per_yr', message: '"lots" is not a number' }]);
  });

  it('says when a yes or no cell is something else', () => {
    const report = checkInputsCsv(INPUTS.replace(',no,yes,1,', ',maybe,yes,1,'));
    expect(report.errors).toEqual([{ row: 3, column: 'has_drainage_system', message: '"maybe" is not yes or no' }]);
  });

  it('rejects a mine it does not know and lists the ones it does', () => {
    const report = checkInputsCsv(INPUTS.replace('\nbccl-moonidih,', '\nnowhere-mine,'));
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ row: 3, column: 'mine_id' });
    expect(report.errors[0].message).toContain('unknown mine "nowhere-mine"');
    expect(report.errors[0].message).toContain('bccl-moonidih');
  });

  it('keeps the good rows when another row is bad', () => {
    const csv = [
      'mine_id,vam_conc',
      'units,fraction',
      'archetype-degree-3-ug,0.004',
      'archetype-degree-2-ug,-1',
      'archetype-degree-3-closing,0.005',
    ].join('\n');
    const report = checkInputsCsv(csv);
    expect(report.rowsRead).toBe(3);
    expect(report.errors.map((e) => [e.row, e.column, e.message])).toEqual([
      [4, 'vam_conc', 'must be at least 0 (found -1)'],
    ]);
    expect(report.rowsUsed).toBe(2);
    expect(report.assignments.map((a) => a.mineId)).toEqual(['archetype-degree-3-ug', 'archetype-degree-3-closing']);
  });

  it('says so when a mine has no abandoned mine methane inputs', () => {
    const report = checkInputsCsv('mine_id,amm_conc\narchetype-degree-3-ug,0.5\n');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ row: 2, column: 'amm_conc' });
    expect(report.errors[0].message).toContain('no abandoned mine methane inputs');
  });

  it('flags a repeated mine and an unknown column', () => {
    const csv = 'mine_id,colour,vam_conc\narchetype-degree-3-ug,red,0.004\narchetype-degree-3-ug,red,0.004\n';
    const report = checkInputsCsv(csv);
    expect(report.errors.map((e) => [e.row, e.column])).toEqual([
      [1, 'colour'],
      [3, 'mine_id'],
    ]);
    expect(report.errors[1].message).toBe('"archetype-degree-3-ug" already has a row on line 2');
  });

  it('needs a mine_id column', () => {
    const report = checkInputsCsv('name,vam_conc\nMoonidih,0.003\n');
    expect(report.errors).toEqual([{ row: 1, column: 'mine_id', message: 'the header has no "mine_id" column' }]);
  });

  it('checks series years and values', () => {
    const csv = [
      'mine_id,year,production_mt,drained_mm3,vam_mm3',
      'bccl-moonidih,2027,0.6,20,3.45',
      'bccl-moonidih,2027,0.6,20,3.45',
      'bccl-moonidih,2090,0.6,20,3.45',
      'bccl-moonidih,2029,-3,20,3.45',
      'bccl-moonidih,two,0.6,20,3.45',
    ].join('\n');
    const report = checkSeriesCsv(csv, NO_OVERRIDES);
    expect(report.errors.map((e) => [e.row, e.column])).toEqual([
      [3, 'year'],
      [4, 'year'],
      [5, 'production_mt'],
      [6, 'year'],
    ]);
    expect(report.errors[2].message).toBe('must be at least 0 (found -3)');
    expect(report.rowsUsed).toBe(1);
  });
});

describe('parseCell', () => {
  it('reads numbers, years and yes or no', () => {
    expect(parseCell('number', ' 0.5 ')).toEqual({ value: 0.5 });
    expect(parseCell('year', '2034')).toEqual({ value: 2034 });
    expect(parseCell('year', '2034.5')).toHaveProperty('problem');
    expect(parseCell('yesno', 'Yes')).toEqual({ value: true });
    expect(parseCell('yesno', '0')).toEqual({ value: false });
    expect(parseCell('number', 'NaN')).toHaveProperty('problem');
  });
});
