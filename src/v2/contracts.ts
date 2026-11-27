import type { Result, MineInput } from '../model/types';

export type MineId = string;
export type PositionQuality = 'gem' | 'coalfield';
export interface MineV2 {
  id: MineId; name: string; company: string; state: string; type: 'UG' | 'OC' | 'Mixed'; field: string;
  band: 'by2031' | 'by2036' | 'by2050' | 'after2050' | 'nodate'; runoutYear: number | null; runoutLabel: string;
  x: number; y: number; lat: number | null; lon: number | null; positionQuality: PositionQuality;
  gemMethaneMm3: number | null; searchKey: string;
}
export interface MapTransform { k: number; x: number; y: number }
export interface MapApi {
  flyTo(id: MineId, opts?: { offsetRight?: number; offsetBottom?: number }): Promise<void>;
  reset(): Promise<void>;
  zoomBy(factor: number): void;
  getScreenPoint(id: MineId): { x: number; y: number } | null;
  getTransform(): MapTransform;
  onTransform(cb: (t: MapTransform) => void): () => void;
}
export type SmogMode = { kind: 'overview' } | { kind: 'focus'; id: MineId } | { kind: 'docked'; id: MineId };
export interface SmogApi {
  setMode(mode: SmogMode): void;
  setClock(now: () => number): void;
  renderStill(tSeconds: number): void;
  destroy(): void;
}
export interface ResultsProps {
  mine: MineV2; input: MineInput; result: Result; source: 'record' | 'estimate';
  priceUsdPerT: number; onEditInputs(): void;
}
export interface SelectionState { id: MineId | null; ran: boolean }
