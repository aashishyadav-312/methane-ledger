// Shared layout for the three row charts (waterfall, who could pay, what moves it most): a label column and a plot,
// or, on narrow cards, each label on its own line above its bar.
import { STACKED_BELOW_PX, textWidthPx } from './frame';

/** The label column is as wide as the longest label, at most this share of the chart; past it, labels go above. */
const LABEL_MAX_SHARE = 0.45;
const LABEL_MIN_PX = 96;
const LABEL_FONT_PX = 12.5;
const LABEL_GAP_PX = 12;
const STACKED_LABEL_PX = 18;

export interface RowLayout {
  stacked: boolean;
  /** Right edge of the label column (text anchors here, `end`); 0 when stacked. */
  labelRight: number;
  plotLeft: number;
  plotRight: number;
  rowH: number;
  /** Top of the bar in row i. */
  barY: (i: number) => number;
  /** Baseline of the label text in row i. */
  labelY: (i: number) => number;
  height: (rows: number, extraPx?: number) => number;
}

export function rowLayout(
  width: number,
  opts: {
    labels: string[];
    barPx: number;
    rowPx: number;
    topPx: number;
    valueRoomLeftPx: number;
    valueRoomRightPx: number;
  },
): RowLayout {
  const longest = Math.max(0, ...opts.labels.map((t) => textWidthPx(t, LABEL_FONT_PX)));
  const stacked = width < STACKED_BELOW_PX || longest > width * LABEL_MAX_SHARE;
  const { barPx, rowPx, topPx } = opts;
  if (stacked) {
    const rowH = rowPx + STACKED_LABEL_PX;
    return {
      stacked,
      labelRight: 0,
      plotLeft: opts.valueRoomLeftPx,
      plotRight: Math.max(opts.valueRoomLeftPx + 1, width - opts.valueRoomRightPx),
      rowH,
      barY: (i) => topPx + i * rowH + STACKED_LABEL_PX + (rowPx - barPx) / 2,
      labelY: (i) => topPx + i * rowH + STACKED_LABEL_PX - 5,
      height: (rows, extra = 0) => topPx + rows * rowH + extra,
    };
  }
  const labelRight = Math.max(LABEL_MIN_PX, longest);
  const plotLeft = labelRight + LABEL_GAP_PX + opts.valueRoomLeftPx;
  return {
    stacked,
    labelRight,
    plotLeft,
    plotRight: Math.max(plotLeft + 1, width - opts.valueRoomRightPx),
    rowH: rowPx,
    barY: (i) => topPx + i * rowPx + (rowPx - barPx) / 2,
    labelY: (i) => topPx + i * rowPx + rowPx / 2 + 4,
    height: (rows, extra = 0) => topPx + rows * rowPx + extra,
  };
}

/** The label text's x and anchor in either layout. */
export function labelPos(l: RowLayout): { x: number; anchor: 'start' | 'end' } {
  return l.stacked ? { x: 0, anchor: 'start' } : { x: l.labelRight, anchor: 'end' };
}
