import { useId, useState } from 'react';
import { setOverride } from '../../state/session';
import { overrideProblem } from './rows';

export interface EditableValueProps {
  path: string;
  label: string;
  unit: string;
  /** The value in the data files. */
  defaultValue: number;
  /** The value in use: the session override if there is one. */
  value: number;
}

/**
 * A number input that writes a session override. A value the data schema rejects is not saved: the field stays
 * as typed and says why. A value equal to the data file's removes the override.
 */
export function EditableValue({ path, label, unit, defaultValue, value }: EditableValueProps) {
  const [draft, setDraft] = useState(String(value));
  const [problem, setProblem] = useState<string | null>(null);
  const errorId = useId();

  // Follow changes made elsewhere (Reset, a row's own Reset), but never overwrite what is being typed.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if (!(draft.trim() !== '' && Number(draft) === value)) setDraft(String(value));
    setProblem(null);
  }

  function change(text: string) {
    setDraft(text);
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) {
      setProblem('Enter a number');
      return;
    }
    const issue = overrideProblem(path, n);
    setProblem(issue);
    if (issue === null) setOverride(path, n === defaultValue ? undefined : n);
  }

  return (
    <span className="assume-edit">
      <input
        className="assume-input num"
        type="number"
        inputMode="decimal"
        step="any"
        value={draft}
        aria-label={`${label}, ${unit}`}
        aria-invalid={problem !== null}
        aria-describedby={problem !== null ? errorId : undefined}
        onChange={(e) => change(e.target.value)}
      />
      {problem !== null ? (
        <span className="assume-problem" id={errorId} role="alert">
          Not saved: {problem}
        </span>
      ) : null}
    </span>
  );
}
