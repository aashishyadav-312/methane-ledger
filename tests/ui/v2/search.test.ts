import { describe, expect, it } from 'vitest';
import minesMap from '../../../src/generated/mines_map.json';
import { detailText, runoutText } from '../../../src/v2/search';
import {
  coalfieldName,
  damerauLevenshtein,
  fold,
  matchRange,
  normalise,
  rank,
  scoreField,
  type SearchableMine,
} from '../../../src/v2/search/rank';

const mines = minesMap.mines as SearchableMine[];

function mine(partial: Partial<SearchableMine> & Pick<SearchableMine, 'id' | 'name'>): SearchableMine {
  return {
    company: 'BCCL',
    state: 'Jharkhand',
    type: 'UG',
    field: 'jharia',
    band: 'after2050',
    runoutYear: 2100,
    runoutLabel: '2100',
    ...partial,
  };
}

describe('normalise', () => {
  it('lower-cases, strips accents and punctuation, and collapses spaces', () => {
    expect(fold("  Hurra'C'  ")).toBe('hurrac');
    expect(fold('Kumardihi-A   Colliery')).toBe('kumardihi a colliery');
    expect(fold('Sétif / Ñandú')).toBe('setif nandu');
    expect(fold('Bhowra(S)')).toBe('bhowra s');
  });

  it('drops "colliery" and the other mine-type words', () => {
    expect(normalise('Kumardihi-A Colliery')).toBe('kumardihi a');
    expect(normalise('Mohanpur (Expn)')).toBe('mohanpur');
    expect(normalise('Mohan (Mohan UG)')).toBe('mohan mohan');
    expect(normalise('Madhusudanpur 7 Pit & Incline')).toBe('madhusudanpur 7');
    expect(normalise('Bokaro OC (Bermo)')).toBe('bokaro bermo');
  });

  it('keeps a dropped word when the query contains it', () => {
    expect(normalise('Bokaro OC (Bermo)', new Set(['oc']))).toBe('bokaro oc bermo');
  });
});

describe('scoreField', () => {
  it('scores exact, prefix, word-prefix and substring matches 100, 80, 60 and 40', () => {
    expect(scoreField('moonidih', 'moonidih')).toBe(100);
    expect(scoreField('moon', 'moonidih')).toBe(80);
    expect(scoreField('dih', 'new moonidih')).toBe(40);
    expect(scoreField('moon', 'new moonidih')).toBe(60);
    expect(scoreField('zzz', 'moonidih')).toBe(0);
  });

  it('allows one typo only for queries of 5 or more characters', () => {
    expect(scoreField('moonidhi', 'moonidih')).toBe(25); // swapped letters
    expect(scoreField('moonedih', 'moonidih')).toBe(25); // wrong letter
    expect(scoreField('moonidh', 'moonidih')).toBe(25); // missing letter
    expect(scoreField('moonnidih', 'moonidih')).toBe(25); // extra letter
    expect(scoreField('mxon', 'moon')).toBe(0); // 4 characters: no typo allowance
    expect(scoreField('moxnidxh', 'moonidih')).toBe(0); // two typos
  });

  it('counts a swap of neighbours as one edit', () => {
    expect(damerauLevenshtein('ab', 'ba')).toBe(1);
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('rank', () => {
  it('puts Moonidih first for "mo"', () => {
    const { results, total } = rank('mo', mines);
    expect(results[0].mine.id).toBe('bccl-moonidih');
    expect(total).toBeGreaterThanOrEqual(4);
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it('ties go to the closing-soonest band, then the shorter name, then alphabetical', () => {
    const rows = [
      mine({ id: 'a', name: 'Alpha Long Name', band: 'nodate' }),
      mine({ id: 'b', name: 'Alpha Two', band: 'nodate' }),
      mine({ id: 'c', name: 'Alpha Three', band: 'by2036' }),
      mine({ id: 'd', name: 'Alpha Six', band: 'nodate' }),
    ];
    // Every name starts with "alpha" and none is exactly "alpha", so the field score ties.
    expect(rank('alpha', rows).results.map((r) => r.mine.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('weights name above company above state and coalfield', () => {
    const rows = [
      mine({ id: 'by-state', name: 'Zed', state: 'Alpha Pradesh', company: 'XCL', field: 'raniganj' }),
      mine({ id: 'by-company', name: 'Yan', company: 'Alpha', state: 'Odisha', field: 'raniganj' }),
      mine({ id: 'by-name', name: 'Alpha', company: 'XCL', state: 'Odisha', field: 'raniganj' }),
    ];
    const { results } = rank('alpha', rows);
    expect(results.map((r) => [r.mine.id, r.matchedField])).toEqual([
      ['by-name', 'name'],
      ['by-company', 'company'],
      ['by-state', 'state'],
    ]);
    expect(results.map((r) => r.score)).toEqual([100, 60, 40]);
  });

  it('finds mines by company, state and coalfield name', () => {
    expect(rank('bccl', mines).results.every((r) => r.mine.company === 'BCCL')).toBe(true);
    expect(rank('jharkhand', mines).results[0].mine.state).toBe('Jharkhand');
    const south = rank('south karanpura', mines).results[0];
    expect(south.mine.field).toBe('s_karanpura');
    expect(south.matchedField).toBe('field');
  });

  it('ignores accents, case and punctuation in the query', () => {
    const plain = rank('moonidih', mines).results.map((r) => r.mine.id);
    expect(rank('  MÖÖNIDIH!! ', mines).results.map((r) => r.mine.id)).toEqual(plain);
    expect(rank("hurra'c", mines).results[0].mine.name).toBe("Hurra'C'"); // an apostrophe disappears
    expect(rank('kumardihi-a', mines).results[0].mine.name).toBe('Kumardihi-A Colliery'); // a hyphen is a space
  });

  it('strips "colliery" from names, so the plain name is an exact match', () => {
    const rows = [
      mine({ id: 'colliery', name: 'Kumardihi-A Colliery' }),
      mine({ id: 'other', name: 'Kumardihi Block' }),
    ];
    const { results } = rank('kumardihi a', rows);
    expect(results[0]).toMatchObject({ score: 100 });
    expect(results[0].mine.id).toBe('colliery');
    // ...unless the query itself says "colliery".
    expect(rank('kumardihi a colliery', rows).results.map((r) => r.mine.id)).toEqual(['colliery']);
    expect(rank('colliery', rows).results.map((r) => r.mine.id)).toEqual(['colliery']);
  });

  it('finds a mine through a one-letter typo in a name of 5 or more characters', () => {
    for (const typo of ['moonidhi', 'moonedih', 'moonidh', 'mooniddih']) {
      expect(rank(typo, mines).results[0]?.mine.id, typo).toBe('bccl-moonidih');
    }
    expect(rank('moonxdxh', mines).total).toBe(0);
  });

  it('returns nothing for an empty or punctuation-only query, and counts every match in total', () => {
    expect(rank('', mines)).toEqual({ results: [], total: 0 });
    expect(rank(' -- ', mines)).toEqual({ results: [], total: 0 });
    expect(rank('xyzzy', mines)).toEqual({ results: [], total: 0 });
    const all = rank('a', mines, 3);
    expect(all.results).toHaveLength(3);
    expect(all.total).toBeGreaterThan(3);
  });
});

describe('matchRange', () => {
  it('locates the typed text in the original name, ignoring case and accents', () => {
    expect(matchRange('Moonidih', 'MOO')).toEqual([0, 3]);
    expect(matchRange('Mohanpur (Expn)', 'hanp')).toEqual([2, 6]);
    expect(matchRange('Mohan (Mohan UG)', 'mohan ug')).toEqual([7, 15]);
    expect(matchRange('Moonidih', 'zzz')).toBeNull();
    expect(matchRange('Moonidih', '')).toBeNull();
  });
});

describe('coalfieldName', () => {
  it('spells out direction prefixes', () => {
    expect(coalfieldName('s_karanpura')).toBe('south karanpura');
    expect(coalfieldName('n_karanpura')).toBe('north karanpura');
    expect(coalfieldName('e_bokaro')).toBe('east bokaro');
    expect(coalfieldName('w_bokaro')).toBe('west bokaro');
    expect(coalfieldName('ib_valley')).toBe('ib valley');
    expect(coalfieldName('jharia')).toBe('jharia');
  });
});

describe('result row text', () => {
  it('says when a mine runs out, including years beyond the horizon and no date', () => {
    expect(runoutText({ runoutYear: 2034, runoutLabel: '2034', band: 'by2036' })).toBe('runs out 2034');
    expect(runoutText({ runoutYear: null, runoutLabel: 'After 2225', band: 'after2050' })).toBe('runs out after 2225');
    expect(runoutText({ runoutYear: null, runoutLabel: 'No date', band: 'nodate' })).toBe('no date');
  });

  it('spells out the mine type', () => {
    const base = mine({ id: 'x', name: 'X' });
    expect(detailText({ ...base, type: 'UG' })).toBe('BCCL, Jharkhand, underground');
    expect(detailText({ ...base, type: 'OC' })).toBe('BCCL, Jharkhand, opencast');
    expect(detailText({ ...base, type: 'Mixed' })).toBe('BCCL, Jharkhand, mixed');
  });
});
