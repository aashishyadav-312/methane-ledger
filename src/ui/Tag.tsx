export type TagKind = 'measured' | 'estimated' | 'literature' | 'dummy' | 'illustrative';

const LABELS: Record<TagKind, string> = {
  measured: 'Measured',
  estimated: 'Estimated',
  literature: 'Literature',
  dummy: 'Dummy',
  illustrative: 'Illustrative inputs',
};

export interface TagProps {
  /** A data quality value, or `illustrative` for the page-level "Illustrative inputs" tag. */
  kind: TagKind;
}

export function Tag({ kind }: TagProps) {
  const size = kind === 'illustrative' ? ' tag-large' : '';
  return <span className={`tag tag-${kind}${size}`}>{LABELS[kind]}</span>;
}
