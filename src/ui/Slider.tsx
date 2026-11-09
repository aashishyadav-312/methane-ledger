import { useId } from 'react';

export interface SliderProps {
  label: string;
  /** The value as shown, with its unit, for example `20 Mm³ / yr`. */
  valueText: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  id?: string;
}

export function Slider({ label, valueText, min, max, step = 1, value, onChange, id }: SliderProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="field slider">
      <div className="slider-head">
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        <span className="num slider-value" aria-hidden="true">
          {valueText}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
