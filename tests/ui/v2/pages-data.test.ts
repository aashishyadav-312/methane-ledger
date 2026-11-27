import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyReport } from '../../../src/pages/DataPage/upload';
import { getOverrides, reset } from '../../../src/state/session';
import { estimateOverridesFor } from '../../../src/v2/pages/estimateOverrides';
import { estimateById } from '../../../src/data/estimation';
import { inputsTemplateCsvV2 } from '../../../src/v2/pages/data/templates';
import {
  checkInputsCsvV2,
  checkSeriesCsvV2,
  clearUploadedV2,
  uploadedPathsV2,
} from '../../../src/v2/pages/data/upload';

const file = (name: string) => readFileSync(resolve(process.cwd(), 'public/templates', name), 'utf8');
const TEMPLATE = file('v2/mine_inputs_template.csv');
const V1_TEMPLATE = file('mine_inputs_template.csv');
const SERIES = file('mine_series_template.csv');

afterEach(() => reset());

describe('v2 inputs template', () => {
  it('the file in public/templates/v2 is the one the code builds', () => {
    expect(TEMPLATE).toBe(inputsTemplateCsvV2());
  });

  it('adds the optional columns degree and methane_mm3 to the v1 columns', () => {
    const header = TEMPLATE.split('\n')[0].split(',');
    expect(header.slice(-2)).toEqual(['degree', 'methane_mm3']);
    expect(header.slice(0, -2).join(',')).toBe(V1_TEMPLATE.split('\n')[0]);
  });

  it('uploading it unchanged changes nothing', () => {
    const report = checkInputsCsvV2(TEMPLATE);
    expect(report.errors).toEqual([]);
    expect(report.rowsRead).toBe(2);
    expect(report.rowsUsed).toBe(2);
    expect(report.assignments.length).toBeGreaterThan(0);
    expect(report.assignments.every((a) => !a.changed)).toBe(true);
    applyReport(report);
    expect(uploadedPathsV2(getOverrides())).toEqual([]);
  });

  it('the v1 template still uploads, and so does the v1 series template', () => {
    const inputs = checkInputsCsvV2(V1_TEMPLATE);
    expect(inputs.errors).toEqual([]);
    expect(inputs.rowsUsed).toBe(1);
    const series = checkSeriesCsvV2(SERIES);
    expect(series.errors).toEqual([]);
    expect(series.rowsUsed).toBe(8);
  });
});

describe('estimated mine rows', () => {
  const lines = TEMPLATE.trimEnd().split('\n');
  const withLast = (change: (cells: string[]) => void): string => {
    const cells = lines[lines.length - 1].split(',');
    change(cells);
    return [...lines.slice(0, -1), cells.join(',')].join('\n') + '\n';
  };
  const DEGREE = lines[0].split(',').indexOf('degree');
  const METHANE = lines[0].split(',').indexOf('methane_mm3');
  const OUTPUT = lines[0].split(',').indexOf('production_mt_per_yr');

  it('a new degree and methane value override the estimate for that mine in this session', () => {
    const csv = withLast((c) => {
      c[DEGREE] = '2';
      c[METHANE] = '5';
    });
    const report = checkInputsCsvV2(csv);
    expect(report.errors).toEqual([]);
    applyReport(report);
    expect(estimateOverridesFor('bccl-amp-colliery', getOverrides())).toEqual({ degree: 2, totalMm3: 5 });
    expect(uploadedPathsV2(getOverrides())).toHaveLength(2);
    const e = estimateById('bccl-amp-colliery', estimateOverridesFor('bccl-amp-colliery', getOverrides()))!;
    expect(e.degree).toBe(2);
    expect(e.totalMm3).toBe(5);
    clearUploadedV2();
    expect(uploadedPathsV2(getOverrides())).toEqual([]);
  });

  it('a bad cell is listed by line and column, and the row is not used', () => {
    const report = checkInputsCsvV2(withLast((c) => (c[DEGREE] = '4')));
    expect(report.errors).toEqual([{ row: 4, column: 'degree', message: 'must be 1, 2 or 3 (found 4)' }]);
    expect(report.rowsRead).toBe(2);
    expect(report.rowsUsed).toBe(1);
  });

  it('a negative output is refused', () => {
    const report = checkInputsCsvV2(withLast((c) => (c[OUTPUT] = '-1')));
    expect(report.errors.map((e) => e.column)).toEqual(['production_mt_per_yr']);
  });

  it('an unknown mine is refused', () => {
    const report = checkInputsCsvV2(withLast((c) => (c[0] = 'nowhere-colliery')));
    expect(report.errors[0].column).toBe('mine_id');
    expect(report.errors[0].message).toContain('unknown mine "nowhere-colliery"');
  });

  it('a column only a record reads is refused on an estimated mine', () => {
    const SPECIFIC = lines[0].split(',').indexOf('specific_emission_m3_per_t');
    const report = checkInputsCsvV2(withLast((c) => (c[SPECIFIC] = '5')));
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].column).toBe('specific_emission_m3_per_t');
  });

  it('degree on a mine with a record is refused with its line number', () => {
    const cells = lines[2].split(',');
    cells[DEGREE] = '3';
    const csv = [lines[0], lines[1], cells.join(','), lines[3]].join('\n') + '\n';
    const report = checkInputsCsvV2(csv);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ row: 3, column: 'degree' });
    expect(report.rowsRead).toBe(2);
    expect(report.rowsUsed).toBe(1);
  });

  it('a record row still changes Moonidih as in v1', () => {
    const cells = lines[2].split(',');
    const VAM = lines[0].split(',').indexOf('vam_conc');
    cells[VAM] = '0.006';
    const csv = [lines[0], lines[1], cells.join(','), lines[3]].join('\n') + '\n';
    const report = checkInputsCsvV2(csv);
    expect(report.errors).toEqual([]);
    expect(report.assignments.find((a) => a.path === 'mine.bccl-moonidih.vamConc')?.changed).toBe(true);
  });

  it('a bad record cell keeps its own line number when estimated rows sit above it', () => {
    const cells = lines[2].split(',');
    const VAM = lines[0].split(',').indexOf('vam_conc');
    cells[VAM] = '5';
    const csv = [lines[0], lines[1], lines[3], cells.join(',')].join('\n') + '\n';
    const report = checkInputsCsvV2(csv);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ row: 4, column: 'vam_conc' });
  });
});
