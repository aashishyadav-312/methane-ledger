import { useState } from 'react';
import { DASH, inr, pct, tonnes, usdM, usdPerT } from '../lib/format';
import {
  Button,
  Card,
  Chip,
  Eyebrow,
  LegendList,
  LegendRow,
  MetricGrid,
  MetricTile,
  Segmented,
  Slider,
  Tag,
  VerdictPill,
  type SwatchToken,
  type TagKind,
} from '../ui';

// Sample inputs for the gallery only. They are not model output.
const SAMPLE = { priceUsdPerT: 8.33, npvUsd: 8.6e6, irr: 0.237, creditsT: 384_781, fxInrPerUsd: 85, shortByUsdPerT: 3.5 };

const wholeUsd = (x: number) => usdPerT(x).replace(/\.00$/, '');

const PAPER_SWATCHES: readonly { token: string; label: string }[] = [
  { token: 'paper', label: 'Paper' },
  { token: 'card', label: 'Card' },
  { token: 'land', label: 'Land' },
  { token: 'line', label: 'Hairline' },
  { token: 'ink', label: 'Ink' },
  { token: 'ink-2', label: 'Ink 2' },
  { token: 'ink-3', label: 'Ink 3' },
  { token: 'eyebrow', label: 'Eyebrow' },
];

const BANDS: readonly { swatch: SwatchToken; label: string; sampleCount: number }[] = [
  { swatch: 'band-2031', label: 'By 2031', sampleCount: 55 },
  { swatch: 'band-2036', label: '2032 to 2036', sampleCount: 25 },
  { swatch: 'band-2050', label: '2037 to 2050', sampleCount: 44 },
  { swatch: 'band-after', label: 'After 2050', sampleCount: 142 },
  { swatch: 'band-closed', label: 'Already closed', sampleCount: 315 },
  { swatch: 'band-nodate', label: 'No date', sampleCount: 45 },
];

const STREAMS: readonly { swatch: SwatchToken; label: string }[] = [
  { swatch: 'stream-drained', label: 'Drained gas' },
  { swatch: 'stream-vam', label: 'Ventilation air' },
  { swatch: 'stream-amm', label: 'After closure' },
];

const QUALITY_TAGS: readonly TagKind[] = ['measured', 'estimated', 'literature', 'dummy', 'illustrative'];

type Use = 'power' | 'flare';
type Gwp = '21' | '28' | '29.8';

export function UiGallery() {
  const [useOfGas, setUseOfGas] = useState<Use>('power');
  const [gwp, setGwp] = useState<Gwp>('28');
  const [chipA, setChipA] = useState(true);
  const [chipB, setChipB] = useState(false);
  const [drainedMm3, setDrainedMm3] = useState(20);

  return (
    <div className="page-width">
      <div className="gallery-intro" style={{ paddingTop: 40 }}>
        <div className="field" style={{ gap: 8 }}>
          <Eyebrow>Look and feel</Eyebrow>
          <h1 className="t-h1" style={{ fontSize: 'var(--fs-h2)' }}>
            Component gallery
          </h1>
        </div>
        <p>
          Every component in every state, built from the tokens in docs/DESIGN.md. Values here are samples, not model
          output.
        </p>
      </div>

      <div className="gallery-grid">
        <section className="gallery-col" aria-labelledby="g-colour">
          <h2 id="g-colour" className="t-caps">
            Colour
          </h2>
          <div className="gallery-block">
            <span className="t-label">Paper and ink</span>
            <div className="swatch-grid">
              {PAPER_SWATCHES.map((s) => (
                <div key={s.token} className="swatch">
                  <span className="swatch-chip" style={{ background: `var(--${s.token})` }} />
                  {s.label}
                  <span className="swatch-name">--{s.token}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="gallery-block">
            <span className="t-label">Closure bands, the map&apos;s only loud colours</span>
            <LegendList label="Closure bands">
              {BANDS.map((b) => (
                <LegendRow key={b.swatch} swatch={b.swatch} label={b.label} count={b.sampleCount} />
              ))}
            </LegendList>
          </div>
          <div className="gallery-block">
            <span className="t-label">Gas streams, in charts only</span>
            <div className="stream-grid">
              {STREAMS.map((s) => (
                <div key={s.swatch}>
                  <span className="stream-chip" style={{ background: `var(--${s.swatch})` }} />
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="gallery-col" aria-labelledby="g-type">
          <h2 id="g-type" className="t-caps">
            Type
          </h2>
          <div className="specimen-stack">
            <span className="specimen-note">Newsreader · display · 450</span>
            <span className="t-mine-title">Moonidih</span>
            <span className="t-h2">Which closing mines can pay?</span>
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500, fontSize: 22 }}>
              Jharia coalfield
            </span>
          </div>
          <div className="specimen-stack">
            <span className="specimen-note">Instrument Sans · interface</span>
            <span className="t-lede" style={{ color: 'var(--ink)' }}>
              Lede 18 / 1.55. Open a mine to see what capturing its methane would cost.
            </span>
            <span className="t-body" style={{ color: 'var(--ink-2)' }}>
              Body 16 / 1.5. The answer updates as you move.
            </span>
            <span className="t-label">Label 14 semibold</span>
            <span className="t-caps">Section caps 12</span>
          </div>
          <div className="gallery-block" style={{ gap: 8 }}>
            <span className="specimen-note">IBM Plex Mono · every figure</span>
            <span className="num" style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em' }}>
              {usdPerT(SAMPLE.priceUsdPerT)} {pct(SAMPLE.irr)} {usdM(SAMPLE.npvUsd)}
            </span>
            <span className="num" style={{ fontSize: 15, color: 'var(--ink-2)' }}>
              {tonnes(SAMPLE.creditsT)} CO2e in the first year
            </span>
            <span className="num" style={{ fontSize: 15, color: 'var(--ink-2)' }}>
              {inr(SAMPLE.priceUsdPerT, SAMPLE.fxInrPerUsd)} · {inr(-SAMPLE.npvUsd, SAMPLE.fxInrPerUsd)} · {DASH}
            </span>
          </div>
          <div className="gallery-block" style={{ gap: 8 }}>
            <span className="specimen-note">Headline result</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="t-headline">{usdPerT(SAMPLE.priceUsdPerT)}</span>
              <span style={{ color: 'var(--ink-2)' }}>per tonne CO2e</span>
            </div>
          </div>
        </section>

        <section className="gallery-col" aria-labelledby="g-components">
          <h2 id="g-components" className="t-caps">
            Components
          </h2>

          <div className="gallery-block">
            <span className="t-label">Buttons</span>
            <div className="gallery-row">
              <Button variant="primary" href="#/mine/bccl-moonidih" arrow>
                Open Moonidih
              </Button>
              <Button variant="secondary">Reset to defaults</Button>
              <Button variant="link" href="#/method">
                How the model works
              </Button>
            </div>
            <div className="gallery-row">
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </div>
          </div>

          <div className="gallery-block">
            <span className="t-label">Chips (one pressed, one not)</span>
            <div className="chip-row">
              <Chip pressed={chipA} onPressedChange={setChipA}>
                California offset {wholeUsd(18)}
              </Chip>
              <Chip pressed={chipB} onPressedChange={setChipB}>
                CCTS floor est. {wholeUsd(11)}
              </Chip>
            </div>
          </div>

          <Segmented
            label="Use the drained gas to"
            value={useOfGas}
            onChange={setUseOfGas}
            options={[
              { value: 'power', label: 'Make power' },
              { value: 'flare', label: 'Flare it' },
            ]}
          />
          <Segmented
            label="Global warming potential"
            value={gwp}
            onChange={setGwp}
            options={[
              { value: '21', label: '21' },
              { value: '28', label: '28' },
              { value: '29.8', label: '29.8' },
            ]}
          />

          <Slider
            label="Drained gas"
            valueText={`${drainedMm3} Mm³ / yr`}
            min={5}
            max={80}
            value={drainedMm3}
            onChange={setDrainedMm3}
          />

          <div className="gallery-block">
            <span className="t-label">Verdicts and tags</span>
            <div className="gallery-row">
              <VerdictPill verdict="ok">Covered at {wholeUsd(15)}</VerdictPill>
              <VerdictPill verdict="short">Short by {usdPerT(SAMPLE.shortByUsdPerT)} a tonne</VerdictPill>
            </div>
            <div className="gallery-row" aria-label="Quality tags">
              {QUALITY_TAGS.map((kind) => (
                <Tag key={kind} kind={kind} />
              ))}
            </div>
          </div>

          <MetricGrid>
            <MetricTile label="Net present value" value={usdM(SAMPLE.npvUsd)} />
            <MetricTile label="Return (IRR)" value={pct(SAMPLE.irr)} />
            <MetricTile label="Negative example" value={usdM(-SAMPLE.npvUsd / 2)} note="Uses a true minus sign" />
            <MetricTile label="No IRR" value={pct(null)} />
          </MetricGrid>

          <Card as="section">
            <div className="field" style={{ gap: 4 }}>
              <Eyebrow>Card with eyebrow</Eyebrow>
              <span className="t-label">Cards hold panels, results and the pin.</span>
            </div>
          </Card>

          <div className="pin-demo">
            <span className="pin-demo-dot" aria-hidden="true">
              <span className="pulse-ring" />
              <span className="dot" />
            </span>
            <span className="pin-card">
              <Eyebrow>Start here</Eyebrow>
              <span className="pin-card-name">Moonidih</span>
              <span className="pin-card-meta">BCCL · underground · open the model</span>
            </span>
          </div>
        </section>
      </div>

      <div className="gallery-notes">
        <div>
          <strong>Motion</strong>
          <span>
            One easing everywhere, a strong ease-out. Presses shrink to 97% in 160 ms. Numbers and bars settle in 200 ms.
            Only the start mine pulses.
          </span>
        </div>
        <div>
          <strong>Access</strong>
          <span>
            Every control is a real button, link or input with a 44 px target. Text meets 4.5 to 1 contrast. Closure
            colours always sit next to a label. Reduced motion turns off the pulse and transitions.
          </span>
        </div>
        <div>
          <strong>Voice</strong>
          <span>
            Plain questions and plain verbs. Spell out every acronym on first use. Mark sample numbers with the amber tag
            until real gas data arrives.
          </span>
        </div>
      </div>
    </div>
  );
}
