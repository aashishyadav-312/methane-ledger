// Downloads from the browser: a CSV table and a chart as a PNG. No dependencies: the PNG is the chart's SVG,
// serialised with its computed styles inlined, drawn onto a canvas at 2x.

export type CsvCell = string | number;

function csvCell(cell: CsvCell): string {
  const text = typeof cell === 'number' ? (Number.isFinite(cell) ? String(cell) : '') : cell;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV: a header row, then one line per row, CRLF line ends. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Save a blob under a file name. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, csv: string): void {
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

/** Style properties that SVG needs to look the same outside the page (CSS variables do not travel). */
const INLINE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linejoin',
  'stroke-linecap',
  'stroke-opacity',
  'opacity',
  'paint-order',
  'font-family',
  'font-size',
  'font-weight',
  'font-variant-numeric',
  'letter-spacing',
  'transform',
  'visibility',
] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The PNG is drawn at twice the on-screen size (Step 8). */
export const PNG_SCALE = 2;
const TITLE_PX = 30;
const PAD_PX = 16;

export interface SvgImageOptions {
  /** Written above the chart. */
  title?: string;
  /** Background colour; defaults to the page's card colour. */
  background?: string;
  scale?: number;
}

/** A standalone copy of an on-screen SVG, with computed styles inlined, a background and an optional title. */
export function standaloneSvg(svg: SVGSVGElement, options: SvgImageOptions = {}): { text: string; width: number; height: number } {
  const box = svg.getBoundingClientRect();
  const w = Math.ceil(box.width);
  const h = Math.ceil(box.height);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const source = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const target = [clone, ...Array.from(clone.querySelectorAll('*'))];
  source.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const out = target[i] as SVGElement;
    // `fill: none` matters (lines must not fill); only an empty value or `transform: none` is left out.
    const style = INLINE_PROPS.map((p) => [p, cs.getPropertyValue(p)] as const)
      .filter(([p, v]) => v !== '' && !(p === 'transform' && v === 'none'))
      .map(([p, v]) => `${p}:${v}`)
      .join(';');
    out.setAttribute('style', style);
    out.removeAttribute('class');
  });
  const title = options.title ?? '';
  const top = title ? TITLE_PX + PAD_PX : PAD_PX;
  const outerW = w + 2 * PAD_PX;
  const outerH = h + top + PAD_PX;
  const rootStyle = getComputedStyle(document.documentElement);
  const bg = options.background ?? (rootStyle.getPropertyValue('--card').trim() || '#ffffff');
  const ink = rootStyle.getPropertyValue('--ink').trim() || '#000000';
  const font = getComputedStyle(svg).getPropertyValue('font-family');

  const outer = document.createElementNS(SVG_NS, 'svg');
  outer.setAttribute('xmlns', SVG_NS);
  outer.setAttribute('width', String(outerW));
  outer.setAttribute('height', String(outerH));
  outer.setAttribute('viewBox', `0 0 ${outerW} ${outerH}`);
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', bg);
  outer.appendChild(rect);
  if (title) {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(PAD_PX));
    t.setAttribute('y', String(PAD_PX + TITLE_PX / 2));
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('style', `fill:${ink};font-family:${font};font-size:16px;font-weight:600`);
    t.textContent = title;
    outer.appendChild(t);
  }
  clone.setAttribute('x', String(PAD_PX));
  clone.setAttribute('y', String(top));
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.removeAttribute('role');
  outer.appendChild(clone);
  return { text: new XMLSerializer().serializeToString(outer), width: outerW, height: outerH };
}

/** Render an on-screen SVG to a PNG blob at `scale` times its size. */
export async function svgToPng(svg: SVGSVGElement, options: SvgImageOptions = {}): Promise<Blob> {
  const scale = options.scale ?? PNG_SCALE;
  const { text, width, height } = standaloneSvg(svg, options);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The chart could not be drawn as an image.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the chart as an image.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be saved.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A file name from words: `methane-ledger-moonidih-cash-flow.png`. */
export function fileName(parts: string[], ext: string): string {
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}.${ext}`;
}
