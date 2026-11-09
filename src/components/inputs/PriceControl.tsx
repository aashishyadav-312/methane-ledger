import { useId, useState } from 'react';
import { Chip } from '../../ui';

export interface PriceChip {
  id: string;
  /** Visible text, for example "CCTS floor est. $11". */
  text: string;
  /** Read after the text by screen readers, for example ", benchmark only". */
  srText?: string;
  priceUsdPerT: number;
  /** Shown under the chips while this chip is chosen. */
  description: string;
}

export interface PriceControlProps {
  priceUsdPerT: number;
  onChange: (priceUsdPerT: number) => void;
  /** The price as shown, for example "$15 / t". */
  valueText: string;
  slider: { min: number; max: number; step: number };
  input: { min: number; max: number; step: number };
  chips: PriceChip[];
  note: string;
}

const PRICE_DECIMALS = 2;

function sameCents(a: number, b: number): boolean {
  return a.toFixed(PRICE_DECIMALS) === b.toFixed(PRICE_DECIMALS);
}

/** Credit price: a slider for the usual range, a number input for any price up to the input maximum, and chips. */
export function PriceControl({ priceUsdPerT, onChange, valueText, slider, input, chips, note }: PriceControlProps) {
  const sliderId = useId();
  const inputId = useId();
  const noteId = useId();
  // While the user types, the box shows their text; otherwise it shows the current price.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Number(priceUsdPerT.toFixed(PRICE_DECIMALS)));
  const chosen = chips.find((c) => sameCents(c.priceUsdPerT, priceUsdPerT));

  const commitText = (text: string) => {
    setDraft(text);
    if (text.trim() === '') return;
    const x = Number(text);
    if (Number.isFinite(x) && x >= input.min && x <= input.max) onChange(Number(x.toFixed(PRICE_DECIMALS)));
  };

  return (
    <div className="price-control">
      <div className="slider-head">
        <label className="field-label field-label-strong" htmlFor={sliderId}>
          Credit price
        </label>
        <span className="price-entry">
          <label className="sr-only" htmlFor={inputId}>
            Credit price in US dollars a tonne, up to {input.max}
          </label>
          <span aria-hidden="true">$</span>
          <input
            id={inputId}
            className="num price-entry-input"
            type="number"
            inputMode="decimal"
            min={input.min}
            max={input.max}
            step={input.step}
            value={shown}
            onChange={(e) => commitText(e.target.value)}
            onBlur={() => setDraft(null)}
          />
          <span aria-hidden="true">/ t</span>
        </span>
      </div>
      <div className="slider">
        <input
          id={sliderId}
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={Math.min(slider.max, Math.max(slider.min, priceUsdPerT))}
          aria-valuetext={valueText}
          aria-describedby={noteId}
          onChange={(e) => {
            setDraft(null);
            onChange(Number(e.target.value));
          }}
        />
      </div>
      <div className="chip-row" role="group" aria-label="Price scenarios">
        {chips.map((c) => (
          <Chip
            key={c.id}
            pressed={chosen?.id === c.id}
            onPressedChange={() => {
              setDraft(null);
              onChange(c.priceUsdPerT);
            }}
          >
            {c.text}
            {c.srText ? <span className="sr-only">{c.srText}</span> : null}
          </Chip>
        ))}
      </div>
      {chosen ? <p className="price-chosen">{chosen.description}</p> : null}
      <p id={noteId} className="control-note">
        {note}
      </p>
    </div>
  );
}
