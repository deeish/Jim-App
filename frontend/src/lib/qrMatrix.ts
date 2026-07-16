import qrcode from 'qrcode-generator';

/**
 * Encode text as a QR module matrix (true = dark). Type number 0 lets the
 * encoder pick the smallest version that fits; error correction M matches the
 * short jimapp://share/CODE payloads (version 2-3, 25-29 modules) and keeps
 * modules large enough for a phone camera to scan off another phone's screen.
 */
export function createQrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(qr.isDark(r, c));
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Collapse a matrix row into [color, runLength] pairs so the renderer can draw
 * a handful of run Views per row instead of one View per module.
 */
export function runLengthRow(row: boolean[]): Array<[boolean, number]> {
  const runs: Array<[boolean, number]> = [];
  for (const cell of row) {
    const last = runs[runs.length - 1];
    if (last && last[0] === cell) {
      last[1] += 1;
    } else {
      runs.push([cell, 1]);
    }
  }
  return runs;
}
