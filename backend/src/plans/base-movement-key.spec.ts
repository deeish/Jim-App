import { baseMovementKey, findNearDuplicateIds } from './base-movement-key';

describe('baseMovementKey', () => {
  it('collapses equipment variants of the same movement', () => {
    expect(baseMovementKey('barbell_upright_row')).toBe('upright_row');
    expect(baseMovementKey('ez_bar_upright_row')).toBe('upright_row');
    expect(baseMovementKey('dumbbell_upright_row')).toBe('upright_row');
    expect(baseMovementKey('rope_cable_pushdown')).toBe('pushdown');
    expect(baseMovementKey('straight_bar_cable_pushdown')).toBe('pushdown');
    expect(baseMovementKey('machine_assisted_pull_up')).toBe('pull_up');
    expect(baseMovementKey('weighted_pull_up')).toBe('pull_up');
  });

  it('keeps position and angle qualifiers distinct', () => {
    expect(baseMovementKey('flat_barbell_bench_press')).toBe(
      'flat_bench_press',
    );
    expect(baseMovementKey('incline_barbell_bench_press')).toBe(
      'incline_bench_press',
    );
    expect(baseMovementKey('flat_barbell_bench_press')).not.toBe(
      baseMovementKey('incline_barbell_bench_press'),
    );
    expect(baseMovementKey('seated_barbell_overhead_press')).toBe(
      'seated_overhead_press',
    );
    expect(baseMovementKey('barbell_overhead_press')).toBe('overhead_press');
  });

  it('falls back to the id when stripping would leave nothing meaningful', () => {
    expect(baseMovementKey('barbell')).toBe('barbell');
    expect(baseMovementKey('')).toBe('');
  });
});

describe('findNearDuplicateIds', () => {
  it('flags later equipment variants but not the first occurrence', () => {
    expect(
      findNearDuplicateIds([
        'barbell_upright_row',
        'lat_pulldown_wide',
        'ez_bar_upright_row',
      ]),
    ).toEqual(['ez_bar_upright_row']);
  });

  it('does not flag exact-id repeats (those are the duplicate passes` job)', () => {
    expect(
      findNearDuplicateIds(['barbell_upright_row', 'barbell_upright_row']),
    ).toEqual([]);
  });

  it('returns empty for distinct base movements', () => {
    expect(
      findNearDuplicateIds([
        'flat_barbell_bench_press',
        'incline_barbell_bench_press',
        'barbell_bent_over_row',
      ]),
    ).toEqual([]);
  });
});
