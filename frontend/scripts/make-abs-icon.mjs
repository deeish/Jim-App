// One-off asset generator: sculpts a "six-pack" onto the cream J of the app icon.
//
// On a near-white surface, muscle form reads from SHADOW (the grooves between
// blocks), not highlights — so this defines the abs with carved grooves:
//   - a dominant linea alba down the centre,
//   - 3 curved, tapered creases that dip toward the centre (faded ends),
//   - each groove gets a thin highlight sliver on its lit (lower-right) edge so
//     it reads as carved-in, not drawn-on.
// All multiply/lighten blended so they become the cream's own shadow/light, and
// the whole grid is skewed to follow the italic stem. The 6 cream blocks between
// the grooves read as the muscles.
//
// Reads pristine *-base.png, writes the real icon.png / adaptive-icon.png
// (idempotent — re-run after tweaking knobs).  needs: npm i @napi-rs/canvas --no-save
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const GROOVE = '150,128,100'; // warm-gray; multiplies cream into its own shadow

async function sculptAbs(srcName, outName, { cx, cy, s, scale = 1 }) {
  const img = await loadImage(join(assets, srcName));
  const S = img.width;
  const k = S / 1024;
  const U = scale;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, S, S);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // local (lx,ly) -> device px, with stem skew + scale
  const map = (lx, ly) => [(cx + lx * U + s * (ly * U)) * k, (cy + ly * U) * k];

  // Groove paths in local space (origin = cluster centre). Bigger so the
  // six-pack owns the belly of the stem; pronounced downward curve.
  const grooves = [
    // dominant linea alba, fading toward the tapering bottom
    { kind: 'line', a: [0, -78], b: [4, 82], w: 16, stops: [[0, 0.16], [0.45, 0.74], [1, 0.1]] },
    // 3 curved creases (dip toward centre), faded ends
    { kind: 'curve', a: [-40, -74], c: [0, -64], b: [40, -74], w: 14, stops: [[0, 0], [0.5, 0.6], [1, 0]] },
    { kind: 'curve', a: [-47, -24], c: [0, -12], b: [47, -24], w: 16, stops: [[0, 0], [0.5, 0.68], [1, 0]] },
    { kind: 'curve', a: [-41, 28], c: [0, 40], b: [41, 28], w: 14, stops: [[0, 0], [0.5, 0.64], [1, 0]] },
  ];

  const trace = (g) => {
    ctx.beginPath();
    ctx.moveTo(...map(...g.a));
    if (g.kind === 'line') ctx.lineTo(...map(...g.b));
    else { const c = map(...g.c), b = map(...g.b); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); }
  };

  // The grooves — multiply darkens the cream into its own shadow (no highlight;
  // on a near-white surface pure shadow reads crisper than emboss).
  ctx.globalCompositeOperation = 'multiply';
  for (const g of grooves) {
    const a = map(...g.a), b = map(...g.b);
    const grad = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    for (const [stop, al] of g.stops) grad.addColorStop(stop, `rgba(${GROOVE},${al})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = g.w * U * k;
    trace(g);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  writeFileSync(join(assets, outName), canvas.toBuffer('image/png'));
  console.log(`wrote ${outName} (${S}x${S})`);
}

await sculptAbs('icon-base.png', 'icon.png', { cx: 628, cy: 486, s: -0.313, scale: 1 });
await sculptAbs('adaptive-icon-base.png', 'adaptive-icon.png', { cx: 586, cy: 496, s: -0.313, scale: 0.64 });
