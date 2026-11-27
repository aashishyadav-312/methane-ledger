import { useId, useState } from 'react';

export interface NumberFieldProps {
  label: string;
  /** Shown after the number, for example "Mm³ a year". */
  unit?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Decimals shown while the field is not being edited. */
  decimals: number;
  onCommit: (value: number) => void;
  /** A short line under the field, for example where the default comes from. */
  note?: string;
}

const format = (x: number, decimals: number) => String(Number(x.toFixed(decimals)));

/**
 * A number input that commits every valid value as it is typed and shows the committed value again on blur.
 * Out-of-range text is kept on screen, marked invalid, and not committed.
 */
export function NumberField({ label, unit, value, min, max, step, decimals, onCommit, note }: NumberFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? format(value, decimals);
  const parsed = Number(shown);
  const valid = shown.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max;

  return (
    <div className="v2-numfield">
      <label htmlFor={id} className="v2-numfield-label">
        {label}
      </label>
      <span className="v2-numfield-box" data-invalid={valid ? undefined : 'true'}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className="num"
          min={min}
          max={max}
          step={step ?? 'any'}
          value={shown}
          aria-invalid={valid ? undefined : true}
          aria-describedby={note ? noteId : undefined}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const x = Number(t);
            if (t.trim() !== '' && Number.isFinite(x) && x >= min && x <= max) onCommit(x);
          }}
          onBlur={() => setText(null)}
        />
        {unit ? <span className="v2-numfield-unit">{unit}</span> : null}
      </span>
      {note ? (
        <span id={noteId} className="v2-numfield-note">
          {note}
        </span>
      ) : null}
    </div>
  );
}
