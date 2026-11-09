import { useId } from 'react';
import { Segmented, Slider } from '../../ui';

export interface ClosureOption {
  id: string;
  /** For example "At current output (2034)". */
  label: string;
  /** `null` for "Custom". */
  year: number | null;
}

export interface ClosureControlProps {
  /** Basis buttons. Leave empty to show the slider alone. */
  options: ClosureOption[];
  basis: string;
  year: number;
  range: { min: number; max: number };
  customId: string;
  onChange: (basis: string, year: number) => void;
}

/** Last year of mining: a basis (current output, a target, or custom) plus a year slider. */
export function ClosureControl({ options, basis, year, range, customId, onChange }: ClosureControlProps) {
  const sliderId = useId();
  const sliderYear = Math.min(range.max, Math.max(range.min, year));
  return (
    <div className="closure-control">
      <Slider
        id={sliderId}
        label="Last year of mining"
        valueText={String(year)}
        min={range.min}
        max={range.max}
        value={sliderYear}
        onChange={(y) => onChange(customId, y)}
      />
      {options.length > 0 ? (
        <Segmented
          label="Basis for the last year"
          hideLabel
          options={options.map((o) => ({ value: o.id, label: o.label }))}
          value={basis}
          onChange={(id) => {
            const chosen = options.find((o) => o.id === id);
            onChange(id, chosen?.year ?? year);
          }}
        />
      ) : null}
    </div>
  );
}
