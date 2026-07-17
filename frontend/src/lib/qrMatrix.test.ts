import { createQrMatrix, runLengthRow } from './qrMatrix';

describe('createQrMatrix', () => {
  const payload = 'jimapp://share/7XKFQ2ND';

  it('produces a square boolean matrix', () => {
    const matrix = createQrMatrix(payload);
    expect(matrix.length).toBeGreaterThanOrEqual(21); // version 1 minimum
    for (const row of matrix) {
      expect(row).toHaveLength(matrix.length);
      for (const cell of row) {
        expect(typeof cell).toBe('boolean');
      }
    }
  });

  it('is deterministic for the same input', () => {
    expect(createQrMatrix(payload)).toEqual(createQrMatrix(payload));
  });

  it('places finder patterns in three corners', () => {
    const matrix = createQrMatrix(payload);
    const n = matrix.length;
    // Finder pattern centers (3,3), (3,n-4), (n-4,3) are always dark.
    expect(matrix[3][3]).toBe(true);
    expect(matrix[3][n - 4]).toBe(true);
    expect(matrix[n - 4][3]).toBe(true);
    // Finder pattern outer ring corners are dark; the module just outside
    // (separator) is light.
    expect(matrix[0][0]).toBe(true);
    expect(matrix[7][7]).toBe(false);
  });

  it('encodes different codes differently', () => {
    expect(createQrMatrix('jimapp://share/7XKFQ2ND')).not.toEqual(
      createQrMatrix('jimapp://share/AAAABBBB'),
    );
  });
});

describe('runLengthRow', () => {
  it('collapses consecutive same-color modules', () => {
    expect(runLengthRow([true, true, false, true, true, true])).toEqual([
      [true, 2],
      [false, 1],
      [true, 3],
    ]);
  });

  it('handles empty and single-cell rows', () => {
    expect(runLengthRow([])).toEqual([]);
    expect(runLengthRow([false])).toEqual([[false, 1]]);
  });

  it('preserves total length', () => {
    const row = createQrMatrix('jimapp://share/7XKFQ2ND')[10];
    const total = runLengthRow(row).reduce((sum, [, len]) => sum + len, 0);
    expect(total).toBe(row.length);
  });
});
