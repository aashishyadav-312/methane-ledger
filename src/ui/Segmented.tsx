import { useId } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Keep the label for screen readers but do not show it. */
  hideLabel?: boolean;
}

/** One choice from a few. A group of buttons with `aria-pressed`, named by its label. */
export function Segmented<T extends string>({ label, options, value, onChange, hideLabel = false }: SegmentedProps<T>) {
  const labelId = useId();
  return (
    <div className="field">
      <span id={labelId} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
