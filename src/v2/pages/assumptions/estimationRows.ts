// Rows for the estimation parameters table (Assumptions page): every value, unit, source and quality tag comes from
// `data/estimation.json`. Only the names and the grouping are written here.
import { getEstimationRecord, type EstimationRecord } from '../../../data/estimation';
import type { Quality } from '../../../model';
import { coalfieldDisplayName } from '../mineFacts';

export interface EstimationRow {
  key: string;
  label: string;
  /** The value as text; the grade table is a list of coalfields. */
  valueText: string;
  unit: string;
  source: string;
  quality: Quality;
}

export interface EstimationGroup {
  id: string;
  title: string;
  rows: EstimationRow[];
}

type Wrapped<T> = { value: T; unit: string; source: string; quality: Quality };

function number(x: number): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function row(key: string, label: string, w: Wrapped<number>): EstimationRow {
  return { key, label, valueText: number(w.value), unit: w.unit, source: w.source, quality: w.quality };
}

const GRADE_LABEL = { '1': 'Degree I', '2': 'Degree II', '3': 'Degree III' } as const;

export function estimationGroups(record: EstimationRecord = getEstimationRecord()): EstimationGroup[] {
  const byField = record.degreeByField;
  const fieldList = Object.entries(byField.value)
    .map(([field, grade]) => `${coalfieldDisplayName(field)}: Degree ${'I'.repeat(grade)}`)
    .join('; ');
  const grades: EstimationGroup[] = (['1', '2', '3'] as const).map((g) => {
    const d = record.byDegree[g];
    return {
      id: `grade-${g}`,
      title: `${GRADE_LABEL[g]} underground mines`,
      rows: [
        row(`${g}.se`, 'Methane per tonne of coal', d.specificEmissionM3PerT),
        row(`${g}.drained`, 'Share of methane that is drained', d.drainedShare),
        row(`${g}.drainedConc`, 'Methane in drained gas', d.drainedConc),
        row(`${g}.vam`, 'Methane in ventilation air', d.vamConc),
      ],
    };
  });
  return [
    {
      id: 'gassiness',
      title: 'Gassiness grade by coalfield',
      rows: [
        {
          key: 'degreeByField',
          label: 'Coalfields with a grade of their own',
          valueText: fieldList,
          unit: byField.unit,
          source: byField.source,
          quality: byField.quality,
        },
        row('defaultDegree', 'Every other coalfield', record.defaultDegree),
      ],
    },
    ...grades,
    {
      id: 'other',
      title: 'Opencast, mixed mines, closure and capture',
      rows: [
        row('opencast', 'Methane per tonne of coal, opencast', record.opencastSpecificEmissionM3PerT),
        row('mixed', 'Underground share of a mixed mine', record.mixedUndergroundShare),
        row('fAmm', 'Gas after closure, share of the last year', record.afterClosure.fAmm),
        row('ammConc', 'Methane in gas after closure', record.afterClosure.conc),
        row('capDrained', 'Capture of drained gas', record.captureEff.drained),
        row('capVam', 'Capture of ventilation air', record.captureEff.vam),
        row('capAmm', 'Capture of gas after closure', record.captureEff.amm),
        row('oxidiser', 'Least methane in ventilation air an oxidiser takes', record.oxidiserMinVamConc),
      ],
    },
  ];
}
