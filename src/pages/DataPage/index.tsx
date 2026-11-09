import { useId, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { getOverrides, subscribe as subscribeOverrides } from '../../state/session';
import { Button, Card } from '../../ui';
import { INPUTS_TEMPLATE_FILE, SERIES_TEMPLATE_FILE } from './templates';
import { applyReport, checkInputsCsv, checkSeriesCsv, clearUploaded, uploadedPaths, type UploadReport } from './upload';
import './data.css';

const BASE = import.meta.env.BASE_URL;

type Kind = UploadReport['kind'];

interface Outcome {
  fileName: string;
  report: UploadReport;
  changed: number;
  unchanged: number;
}

const KIND_TEXT: Record<Kind, { title: string; help: string }> = {
  inputs: {
    title: 'Mine inputs',
    help: 'One row per mine. Leave a cell blank to keep the default.',
  },
  series: {
    title: 'Yearly series',
    help: 'One row per mine and year. Years you leave out count as zero, so list every year up to the last year of mining. Series are used on the Compare page.',
  },
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function DataPage() {
  const overrides = useSyncExternalStore(subscribeOverrides, getOverrides, getOverrides);
  const [outcomes, setOutcomes] = useState<Partial<Record<Kind, Outcome>>>({});
  const uploaded = uploadedPaths(overrides);

  const handleFile = async (kind: Kind, event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const report = kind === 'inputs' ? checkInputsCsv(text) : checkSeriesCsv(text);
    const { set, cleared } = applyReport(report);
    setOutcomes((prev) => ({ ...prev, [kind]: { fileName: file.name, report, changed: set, unchanged: cleared } }));
    input.value = ''; // so the same file can be chosen again after a fix
  };

  return (
    <div className="page-width data-page">
      <div className="data-title">
        <span className="eyebrow">Data</span>
        <h1 className="t-h1">Use your own mine data</h1>
        <p className="t-lede data-lede">
          Download the two templates, fill them in with your mine&rsquo;s numbers, and upload them. The site checks
          every row, lists any problem by row and column, and uses the valid rows in place of the defaults.
        </p>
        <p className="data-session" data-testid="session-note">
          Uploaded data is used only in this browser session.
        </p>
      </div>

      <Card as="section" className="data-card">
        <h2 className="data-card-title">1. Download the templates</h2>
        <p className="control-note">
          Both templates are filled in with the illustrative Moonidih numbers, so you can upload them unchanged to see
          that nothing moves.
        </p>
        <div className="data-downloads">
          <a className="btn btn-secondary" href={`${BASE}templates/${INPUTS_TEMPLATE_FILE}`} download>
            {INPUTS_TEMPLATE_FILE}
          </a>
          <a className="btn btn-secondary" href={`${BASE}templates/${SERIES_TEMPLATE_FILE}`} download>
            {SERIES_TEMPLATE_FILE}
          </a>
        </div>
        <ul className="data-notes">
          <li>
            <strong>{INPUTS_TEMPLATE_FILE}</strong> has one row per mine, a second header row of units, and a{' '}
            <code>mine_id</code> from the mine list. Yes or no cells take yes or no.
          </li>
          <li>
            <strong>{SERIES_TEMPLATE_FILE}</strong> has the columns{' '}
            <code>mine_id, year, production_mt, drained_mm3, vam_mm3</code> (VAM is ventilation air methane).
          </li>
        </ul>
      </Card>

      <Card as="section" className="data-card">
        <h2 className="data-card-title">2. Upload your files</h2>
        <div className="data-uploads">
          {(['inputs', 'series'] as const).map((kind) => (
            <UploadBox key={kind} kind={kind} outcome={outcomes[kind]} onFile={(e) => handleFile(kind, e)} />
          ))}
        </div>
      </Card>

      <Card as="section" className="data-card">
        <h2 className="data-card-title">3. What the site is using</h2>
        {uploaded.length === 0 ? (
          <p className="t-body" data-testid="uploaded-count">
            No uploaded values are in use. The site is using its built-in defaults.
          </p>
        ) : (
          <>
            <p className="t-body" data-testid="uploaded-count">
              {plural(uploaded.length, 'uploaded value is', 'uploaded values are')} in use, replacing the defaults.
            </p>
            <div className="data-actions">
              <Button variant="secondary" onClick={clearUploaded}>
                Remove uploaded values
              </Button>
            </div>
          </>
        )}
        <div className="data-actions">
          <Button variant="link" href="#/compare" arrow>
            See the Compare page
          </Button>
          <Button variant="link" href="#/mine/bccl-moonidih" arrow>
            See the Moonidih page
          </Button>
        </div>
      </Card>

      <p className="mine-footnote">
        Results are indicative, at pre-feasibility level, and not investment advice. Uploaded numbers are used as given
        and are not checked against any source.
      </p>
    </div>
  );
}

function UploadBox({
  kind,
  outcome,
  onFile,
}: {
  kind: Kind;
  outcome: Outcome | undefined;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputId = useId();
  const { title, help } = KIND_TEXT[kind];
  return (
    <div className="data-upload" data-testid={`upload-${kind}`}>
      <label className="data-upload-label" htmlFor={inputId}>
        {title}
      </label>
      <p className="control-note">{help}</p>
      <input id={inputId} className="data-file" type="file" accept=".csv,text/csv" onChange={onFile} />
      <div aria-live="polite">{outcome ? <Result outcome={outcome} /> : null}</div>
    </div>
  );
}

function Result({ outcome }: { outcome: Outcome }) {
  const { report, fileName } = outcome;
  return (
    <div className="data-result">
      <p className="data-summary" data-testid="upload-summary">
        <strong>{fileName}</strong>: {report.rowsUsed} of {plural(report.rowsRead, 'row', 'rows')} used.{' '}
        {report.rowsUsed > 0
          ? `${plural(outcome.changed, 'value differs', 'values differ')} from the defaults and ${
              outcome.unchanged === 1 ? 'is' : 'are'
            } now in use; ${outcome.unchanged} already matched.`
          : 'Nothing was changed.'}
      </p>
      {report.errors.length > 0 ? (
        <div className="data-errors" data-testid="upload-errors">
          <p className="data-errors-title">{plural(report.errors.length, 'problem', 'problems')} to fix</p>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Column</th>
                  <th scope="col">Problem</th>
                </tr>
              </thead>
              <tbody>
                {report.errors.map((e, i) => (
                  <tr key={i}>
                    <td className="num">{e.row}</td>
                    <td className="num">{e.column ?? 'whole row'}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
