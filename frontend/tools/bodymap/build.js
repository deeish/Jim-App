/**
 * Body-map v2 builder.
 *
 *   node tools/bodymap/build.js            -> writes src/components/bodymap/bodyMapPaths.ts + preview2.html
 *   node tools/bodymap/build.js --dry      -> preview only (no asset write)
 *
 * Inputs (all gitignored, under tools/bodymap/):
 *   traced.json                         our silhouette, traced from the Recraft figure (see trace.js)
 *   source/etsy/{front,back}/SVG files  purchased per-muscle SVGs (Create4decor bundle, 432x648 frame)
 *   source/etsy/full{front,back}        the bundle's body outline + full-frame copies of 3 cropped muscles
 *
 * Pipeline
 *   1. Tune the traced silhouette (feet, neck slope, leg length, hands) -> BODY_OUTLINE_PATH.
 *   2. Rasterize our outline and the bundle's body at 4x -> row-interval tables + landmarks.
 *   3. For every muscle file: rasterize red tones only -> blobs -> boundary -> warp each
 *      vertex through the landmark y-map and the per-row interval x-map -> simplify ->
 *      inset for the channel -> smooth -> mirror the left blob for a perfect pair.
 *   4. Pecs / delts are split into heads by cutting the source blob before tracing.
 *   5. Emit bodyMapPaths.ts (keys = anatomical names, `sub` = catalog sub-muscle) + preview.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DRY = process.argv.includes('--dry');
const DIR = __dirname;
const SRC = path.join(DIR, 'source', 'etsy');
const OUT_TS = path.join(DIR, '..', '..', 'src', 'components', 'bodymap', 'bodyMapPaths.ts');
const VB_W = 200, VB_H = 440, FIG_H = 428, SCALE = 4; // raster scale for our viewbox
const ETSY_W = 432, ETSY_H = 648, ETSY_DENSITY = 72 * SCALE;
const r1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------
function closedPath(pts, s = 1, corners = null) {
  const n = pts.length; const get = (i) => pts[((i % n) + n) % n];
  const isCorner = (i) => corners ? corners.has(((i % n) + n) % n) : false;
  let d = `M ${r1(get(0).x)} ${r1(get(0).y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1 = isCorner(i) ? p1 : { x: p1.x + ((p2.x - p0.x) / 6) * s, y: p1.y + ((p2.y - p0.y) / 6) * s };
    const c2 = isCorner(i + 1) ? p2 : { x: p2.x - ((p3.x - p1.x) / 6) * s, y: p2.y - ((p3.y - p1.y) / 6) * s };
    d += ` C ${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return d + ' Z';
}
function symmetricPath(half) {
  const mirrored = half.map((p) => ({ x: 200 - p.x, y: p.y })).reverse().slice(1, -1);
  // the two axis points (head top, crotch) are where the half meets its mirror: hard corners there,
  // otherwise the spline hairpins through the join and leaves a pinhole at the crotch
  return closedPath(half.concat(mirrored), 1, new Set([half.length - 1]));
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let idx = -1, dmax = 0;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  return [a, b];
}
function resampleClosed(pts, step) {
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - acc;
    while (t < seg) { out.push({ x: a.x + (b.x - a.x) * t / seg, y: a.y + (b.y - a.y) * t / seg }); t += step; }
    acc = (acc + seg) % step;
  }
  return out;
}
function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
/** Uniform inward offset (approximate, via averaged vertex normals). */
function inset(pts, d) {
  const n = pts.length; const sign = polyArea(pts) > 0 ? 1 : -1; const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    let nx = (q.y - p.y), ny = -(q.x - p.x); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    out.push({ x: c.x - sign * nx * d, y: c.y - sign * ny * d });
  }
  return out;
}
function bbox(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { x0, y0, x1, y1 }; }
function smoothClosed(pts, passes = 1) {
  let cur = pts;
  for (let k = 0; k < passes; k++) cur = cur.map((c, i) => { const p = cur[(i - 1 + cur.length) % cur.length], q = cur[(i + 1) % cur.length]; return { x: (p.x + 2 * c.x + q.x) / 4, y: (p.y + 2 * c.y + q.y) / 4 }; });
  return cur;
}

// ---------------------------------------------------------------------------
// raster helpers
// ---------------------------------------------------------------------------
async function rasterize(svgBuffer, density) {
  const { data, info } = await sharp(svgBuffer, { density }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}
function maskFrom(r, test) {
  const m = new Uint8Array(r.W * r.H);
  for (let i = 0; i < r.W * r.H; i++) { const o = i * 4; if (test(r.data[o], r.data[o + 1], r.data[o + 2], r.data[o + 3])) m[i] = 1; }
  return { m, W: r.W, H: r.H };
}
const isRed = (r, g, b, a) => a > 100 && r > 110 && g < 110 && b < 110;
const isInk = (r, g, b, a) => a > 100 && (r + g + b) < 720; // anything not white
function components(mask, minPixels = 40) {
  const { m, W, H } = mask; const label = new Int32Array(W * H).fill(-1); const comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!m[i] || label[i] !== -1) continue;
    const id = comps.length; const stack = [i]; label[i] = id; let n = 0, sx = 0, sy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    while (stack.length) {
      const j = stack.pop(); n++; const jx = j % W, jy = (j - jx) / W; sx += jx; sy += jy;
      if (jx < minX) minX = jx; if (jx > maxX) maxX = jx; if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
      if (jx > 0 && m[j - 1] && label[j - 1] === -1) { label[j - 1] = id; stack.push(j - 1); }
      if (jx < W - 1 && m[j + 1] && label[j + 1] === -1) { label[j + 1] = id; stack.push(j + 1); }
      if (jy > 0 && m[j - W] && label[j - W] === -1) { label[j - W] = id; stack.push(j - W); }
      if (jy < H - 1 && m[j + W] && label[j + W] === -1) { label[j + W] = id; stack.push(j + W); }
    }
    comps.push({ id, n, cx: sx / n, cy: sy / n, minX, maxX, minY, maxY });
  }
  return { comps: comps.filter((c) => c.n >= minPixels), label };
}
function traceBoundary(mask, label, comp) {
  const { W, H } = mask;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === comp.id;
  let sx = -1, sy = -1;
  outer: for (let y = comp.minY; y <= comp.maxY; y++) for (let x = comp.minX; x <= comp.maxX; x++) if (inside(x, y)) { sx = x; sy = y; break outer; }
  const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const pts = [{ x: sx, y: sy }]; let cx = sx, cy = sy, back = 6;
  for (let guard = 0; guard < W * H; guard++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (back + 1 + k) % 8; const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (inside(nx, ny)) { pts.push({ x: nx, y: ny }); back = (d + 5) % 8; cx = nx; cy = ny; found = true; break; }
    }
    if (!found || (cx === sx && cy === sy && pts.length > 2)) break;
  }
  pts.pop();
  return pts;
}
/** Solid silhouette: everything not reachable from the border through non-ink (closes internal lines). */
function solidify(mask, grow = 3) {
  const { m, W, H } = mask;
  // dilate to seal hairline gaps in the outline
  let cur = m;
  for (let k = 0; k < grow; k++) { const nx = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (cur[i] || (x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) || (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W])) nx[i] = 1; } cur = nx; }
  const bg = new Uint8Array(W * H); const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) { const i = stack.pop(); if (bg[i] || cur[i]) continue; bg[i] = 1; const x = i % W; if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (i >= W) stack.push(i - W); if (i < W * (H - 1)) stack.push(i + W); }
  let solid = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) solid[i] = bg[i] ? 0 : 1;
  // erode back
  for (let k = 0; k < grow; k++) { const nx = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (solid[i] && (x > 0 && solid[i - 1]) && (x < W - 1 && solid[i + 1]) && (y > 0 && solid[i - W]) && (y < H - 1 && solid[i + W])) nx[i] = 1; } solid = nx; }
  return { m: solid, W, H };
}
/** Morphological close (dilate then erode): seals the seller's white highlight lines drawn INSIDE a muscle. */
function closeMask(mask, k) {
  const { W, H } = mask; let cur = mask.m;
  const pass = (src, keepIf) => { const nx = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; const l = x > 0 ? src[i - 1] : 0, r = x < W - 1 ? src[i + 1] : 0, u = y > 0 ? src[i - W] : 0, d = y < H - 1 ? src[i + W] : 0; if (keepIf(src[i], l, r, u, d)) nx[i] = 1; } return nx; };
  for (let i = 0; i < k; i++) cur = pass(cur, (c, l, r, u, d) => c || l || r || u || d);
  for (let i = 0; i < k; i++) cur = pass(cur, (c, l, r, u, d) => c && l && r && u && d);
  return { m: cur, W, H };
}
/** Per-row list of [x0,x1] ink intervals (pixel units). */
function rowIntervals(mask) {
  const { m, W, H } = mask; const rows = new Array(H);
  for (let y = 0; y < H; y++) {
    const iv = []; let start = -1;
    for (let x = 0; x <= W; x++) { const on = x < W && m[y * W + x]; if (on && start < 0) start = x; if (!on && start >= 0) { if (x - start >= 2) iv.push([start, x - 1]); start = -1; } }
    rows[y] = iv;
  }
  return rows;
}
/** Anatomical landmark rows from the interval table (symmetric figure, axis at cx). */
function landmarks(rows, cx) {
  const H = rows.length; const has = (y) => rows[y] && rows[y].length > 0;
  let top = 0; while (top < H && !has(top)) top++;
  let bottom = H - 1; while (bottom > 0 && !has(bottom)) bottom--;
  const extent = (y) => has(y) ? rows[y][rows[y].length - 1][1] - rows[y][0][0] : 0;
  const count = (y) => has(y) ? rows[y].length : 0;
  const centerGap = (y) => has(y) && !rows[y].some(([a, b]) => a <= cx && cx <= b);
  const fh = bottom - top;
  // head: widest row in the top 12%; neck: narrowest row after it within the top 20%
  let headMax = top; for (let y = top; y < top + fh * 0.12; y++) if (extent(y) > extent(headMax)) headMax = y;
  let neck = headMax; for (let y = headMax; y < top + fh * 0.2; y++) if (extent(y) <= extent(neck)) neck = y;
  // shoulder: where the extent has grown to 85% of its max within the next quarter of the body
  let maxExt = 0; for (let y = neck; y < neck + fh * 0.25; y++) maxExt = Math.max(maxExt, extent(y));
  let shoulder = neck; while (shoulder < bottom && extent(shoulder) < 0.85 * maxExt) shoulder++;
  // armpit: first row at/below the shoulder where an outer (arm) interval is clearly separated from the torso
  let armpit = shoulder;
  while (armpit < bottom) { const iv = rows[armpit]; if (iv.length >= 3 && iv[1][0] - iv[0][1] > 0.02 * extent(armpit)) break; armpit++; }
  // crotch: first row below the armpit with a gap on the axis
  let crotch = armpit; while (crotch < bottom && !centerGap(crotch)) crotch++;
  // fingertip: hands hang beside the legs as extra intervals; where they end the count drops
  let fingertip = crotch; while (fingertip < bottom && count(fingertip) >= 4) fingertip++;
  if (fingertip === crotch) { fingertip = armpit; while (fingertip < crotch && count(fingertip) >= 3) fingertip++; }
  const knee = crotch + Math.round((bottom - crotch) * 0.5);
  const ankle = crotch + Math.round((bottom - crotch) * 0.88);
  // arm width where it first separates: used to synthesize arm slots above the armpit
  const armW = rows[armpit] && rows[armpit].length >= 3 ? rows[armpit][0][1] - rows[armpit][0][0] : Math.round(0.08 * fh);
  return { top, neck, shoulder, armpit, crotch, fingertip, knee, ankle, bottom, armW };
}
/** Piecewise-linear y-map source->target from matched landmarks (kept monotone). */
function makeYMap(ls, lt) {
  const order = ['top', 'neck', 'shoulder', 'armpit', 'crotch', 'fingertip', 'knee', 'ankle', 'bottom'];
  const pairs = [];
  for (const k of order) { const s = ls[k], t = lt[k]; if (pairs.length && (s <= pairs[pairs.length - 1][0] || t <= pairs[pairs.length - 1][1])) continue; pairs.push([s, t]); }
  return (y) => {
    if (y <= pairs[0][0]) return pairs[0][1] + (y - pairs[0][0]);
    for (let i = 1; i < pairs.length; i++) if (y <= pairs[i][0]) { const [s0, t0] = pairs[i - 1], [s1, t1] = pairs[i]; return t0 + (y - s0) * (t1 - t0) / (s1 - s0); }
    const [s0, t0] = pairs[pairs.length - 1]; return t0 + (y - s0);
  };
}
/**
 * Canonical limb slots per row: 1 above the armpit (head/neck/shoulders), 3 between armpit and
 * crotch (arm, torso, arm), 4 while the hands hang beside the legs, 2 below the fingertips.
 * Extra intervals (finger gaps, toe gaps, drawn separations) are merged into their nearest
 * neighbour so both figures' rows line up slot-for-slot.
 */
function canonicalRows(rows, lm, cx) {
  return rows.map((iv, y) => {
    if (!iv.length) return iv;
    const expected = y < lm.shoulder ? 1 : y < lm.crotch ? 3 : y <= lm.fingertip ? 4 : 2;
    let cur = iv.map((p) => p.slice());
    if (expected === 3 && cur.length === 1 && y >= lm.shoulder && y < lm.armpit) {
      // arm still fused to the torso in this figure: carve arm slots of the arm's width off both ends
      const [a, b] = cur[0]; const w = Math.min(lm.armW, Math.floor((b - a) / 3));
      cur = [[a, a + w], [a + w + 1, b - w - 1], [b - w, b]];
    }
    while (cur.length > expected) {
      let bi = -1, bg = 1e9;
      for (let i = 0; i + 1 < cur.length; i++) {
        if (cx !== undefined && cur[i][1] < cx && cur[i + 1][0] > cx) continue; // the two legs are never one slot
        const g = cur[i + 1][0] - cur[i][1]; if (g < bg) { bg = g; bi = i; }
      }
      if (bi < 0) break;
      cur.splice(bi, 2, [cur[bi][0], cur[bi + 1][1]]);
    }
    return cur;
  });
}
/** x-map at a given source row -> target row via canonical slots (index-matched). */
function mapX(x, srcIv, dstIv, srcCx, dstCx) {
  if (!srcIv.length || !dstIv.length) return dstCx + (x - srcCx);
  let si = -1, best = 1e9;
  for (let i = 0; i < srcIv.length; i++) { const [a, b] = srcIv[i]; const d = x < a ? a - x : x > b ? x - b : 0; if (d < best) { best = d; si = i; } }
  const [sa, sb] = srcIv[si];
  let di;
  if (srcIv.length === dstIv.length) di = si;
  else {
    // fall back to the slot whose centre is closest in normalised body coordinates
    const sExt = srcIv[srcIv.length - 1][1] - srcIv[0][0] || 1, dExt = dstIv[dstIv.length - 1][1] - dstIv[0][0] || 1;
    const rel = ((sa + sb) / 2 - srcCx) / sExt; let bd = 1e9; di = 0;
    for (let i = 0; i < dstIv.length; i++) { const c = ((dstIv[i][0] + dstIv[i][1]) / 2 - dstCx) / dExt; const d = Math.abs(c - rel); if (d < bd) { bd = d; di = i; } }
  }
  const [da, db] = dstIv[di];
  const t = sb > sa ? Math.min(1, Math.max(0, (x - sa) / (sb - sa))) : 0.5;
  return da + t * (db - da);
}

// ---------------------------------------------------------------------------
// 1. silhouette tuning
// ---------------------------------------------------------------------------
function tuneSilhouette(halfIn) {
  let half = halfIn.map((p) => ({ x: p[0], y: p[1] }));
  const maxY = Math.max(...half.map((p) => p.y)), minY = Math.min(...half.map((p) => p.y));
  const fh = maxY - minY;
  // landmarks along the chain (top -> outer side -> hand -> inner arm -> torso -> leg -> foot -> inner leg -> crotch)
  const fingertipIdx = half.reduce((bi, p, i) => (p.y > half[bi].y && i < half.length * 0.6 ? i : bi), 0);
  const fingertipY = half[fingertipIdx].y;
  const crotchY = half[half.length - 1].y;
  // (a) hands: slim by 12% around the hand's centreline (points within 34 units above the fingertip, both sides)
  const handIdx = half.map((p, i) => i).filter((i) => Math.abs(i - fingertipIdx) < 60 && half[i].y > fingertipY - 34);
  const handCx = handIdx.reduce((s, i) => s + half[i].x, 0) / handIdx.length;
  for (const i of handIdx) { const w = Math.min(1, (half[i].y - (fingertipY - 34)) / 12); half[i].x = handCx + (half[i].x - handCx) * (1 - 0.12 * w); }
  // (b) neck-to-shoulder slope: pull the trap hump 25% toward the straight line neck-base -> shoulder tip
  const upper = half.slice(0, Math.floor(half.length * 0.25));
  // narrowest point of the neck: the point closest to the axis within the 9-20% band (never the crown itself)
  let neckI = -1; for (let i = 1; i < upper.length; i++) if (upper[i].y > minY + fh * 0.09 && upper[i].y < minY + fh * 0.2 && (neckI < 0 || upper[i].x > upper[neckI].x)) neckI = i;
  if (neckI < 0) neckI = 1;
  let shI = neckI; for (let i = neckI; i < upper.length; i++) if (upper[i].y < minY + fh * 0.3 && upper[i].x < upper[shI].x) shI = i;
  for (let i = neckI + 1; i < shI; i++) {
    const t = (half[i].x - half[neckI].x) / ((half[shI].x - half[neckI].x) || 1);
    const lin = half[neckI].y + t * (half[shI].y - half[neckI].y);
    half[i].y += 0.1 * (lin - half[i].y);
  }
  // (b2) head + neck, by three landmarks on the chain: ear (widest head point), neck (narrowest point
  // below it), trap start (where the slope turns outward). The traced figure is ~10 heads tall with a
  // long neck and a nub at the neck base; target ~8 heads, a neck of half a head, rounded jaw, flat crown.
  {
    let earI = 1; for (let i = 1; i < neckI; i++) if (half[i].x < half[earI].x) earI = i;
    let trapI = neckI + 1; while (trapI < shI - 1 && half[trapI].x > half[neckI].x - 3) trapI++;
    // head: scale everything above the neck point about (100, neckY): grows up and out, junction stays put
    const neckY = half[neckI].y, headH = neckY - half[0].y;
    const kHead = Math.min(1.35, Math.max(1, (fh / 8.2) / headH));
    for (let i = 0; i < neckI; i++) half[i] = { x: 100 + (half[i].x - 100) * kHead, y: neckY + (half[i].y - neckY) * kHead };
    // jaw: rounded cubic from the ear to the neck point
    { const P0 = half[earI], P3 = half[neckI]; const P1 = { x: P0.x + 0.1 * (P3.x - P0.x), y: P0.y + 0.6 * (P3.y - P0.y) }, P2 = { x: P3.x - 0.02 * (P3.x - P0.x), y: P3.y - 0.25 * (P3.y - P0.y) }; const n = neckI - earI;
      for (let i = earI + 1; i < neckI; i++) { const t = (i - earI) / n, u = 1 - t; half[i] = { x: u*u*u*P0.x + 3*u*u*t*P1.x + 3*u*t*t*P2.x + t*t*t*P3.x, y: u*u*u*P0.y + 3*u*u*t*P1.y + 3*u*t*t*P2.y + t*t*t*P3.y }; } }
    // neck: straight taper from the neck point to the trap start (removes the nub)
    for (let i = neckI + 1; i < trapI; i++) { const t = (i - neckI) / (trapI - neckI); half[i] = { x: half[neckI].x + (half[trapI].x - half[neckI].x) * t, y: half[neckI].y + (half[trapI].y - half[neckI].y) * t }; }
    // gentle smoothing of the upper head outline (never the axis point)
    for (let pass = 0; pass < 2; pass++) { const src = half.map((p) => ({ ...p })); for (let i = 1; i < earI; i++) { let sx = 0, sy = 0, n = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j <= earI) { sx += src[j].x; sy += src[j].y; n++; } } half[i] = { x: sx / n, y: sy / n }; } }
    // neck length: compress neck point -> shoulder line (60% of the way out to the shoulder tip) to half a head
    let lineI = trapI; while (lineI < shI && half[lineI].x > 100 - 0.6 * (100 - half[shI].x)) lineI++;
    const jawY = half[neckI].y, lineY = half[lineI].y, targetNeck = headH * kHead * 0.5;
    const factor = Math.min(1, targetNeck / Math.max(1, lineY - jawY)); const cut = (lineY - jawY) * (1 - factor);
    for (let i = neckI + 1; i < lineI; i++) half[i].y = jawY + (half[i].y - jawY) * factor;
    for (let i = lineI; i < half.length; i++) half[i].y -= cut;
    // round the kinks (ear, jaw start, trap start): 3-point average over crown+1 .. shoulder tip, 4 passes
    for (let pass = 0; pass < 4; pass++) { const src = half.map((p) => ({ ...p })); for (let i = 1; i < shI; i++) half[i] = { x: (src[i - 1].x + 2 * src[i].x + src[i + 1].x) / 4, y: (src[i - 1].y + 2 * src[i].y + src[i + 1].y) / 4 }; }
    // crown: put the first points on the circle (centre on the axis) through points 3 and 5, so the
    // apex is a clean arc rather than whatever the trace left there
    { const p3 = half[3], p5 = half[5]; const d3 = 100 - p3.x, d5 = 100 - p5.x;
      const cy = (d5 * d5 + p5.y * p5.y - d3 * d3 - p3.y * p3.y) / (2 * (p5.y - p3.y)); const R = Math.hypot(d3, p3.y - cy);
      for (let i = 0; i < 3; i++) { const dx = 100 - half[i].x; if (R * R - dx * dx > 0) half[i].y = cy - Math.sqrt(R * R - dx * dx); } }
  }
  // (c) feet: straighten by compressing the lateral toe 30% toward the ankle centreline
  const ankleY = minY + fh * 0.905;
  const ankleIdx = half.map((p, i) => i).filter((i) => half[i].y > ankleY - 8 && half[i].y < ankleY + 4 && i > half.length * 0.55);
  const ankleCx = ankleIdx.reduce((s, i) => s + half[i].x, 0) / (ankleIdx.length || 1);
  for (let i = 0; i < half.length; i++) if (i > half.length * 0.55 && half[i].y > ankleY) { const w = Math.min(1, (half[i].y - ankleY) / 10); half[i].x = ankleCx + (half[i].x - ankleCx) * (1 - 0.3 * w); }
  // (d) legs +3% below the crotch, then refit to FIG_H
  for (const p of half) if (p.y > crotchY) p.y = crotchY + (p.y - crotchY) * 1.03;
  const y0 = Math.min(...half.map((p) => p.y)), y1 = Math.max(...half.map((p) => p.y));
  const k = FIG_H / (y1 - y0), pad = (VB_H - FIG_H) / 2;
  half = half.map((p) => ({ x: 100 + (p.x - 100) * k, y: pad + (p.y - y0) * k }));
  half[0].x = 100; half[half.length - 1].x = 100;
  half = half.map((p) => ({ x: r1(p.x), y: r1(p.y) }));
  return half;
}

// ---------------------------------------------------------------------------
// 3. muscle catalogue: file -> region id(s), group, catalog sub-muscle
// ---------------------------------------------------------------------------
const RED_TONES = new Set(['#E92A2A', '#D52626', '#9A1A1C', '#8D1819', '#e92a2a', '#d52626', '#9a1a1c', '#8d1819']);
/** Keep only red fills: everything else becomes fill:none (silhouette, greys, whites). */
function redOnly(svgText) {
  return svgText.replace(/\.(st\d+)\{([^}]*)\}/g, (m, cls, body) => {
    if (/display:none/.test(body)) return m;
    const fill = (body.match(/fill:(#[0-9A-Fa-f]{6})/) || [])[1];
    return RED_TONES.has(fill) ? m : `.${cls}{fill:none;}`;
  });
}
/** Keep only the white body silhouette (as black); everything else none. */
function whiteOnly(svgText) {
  return svgText.replace(/\.(st\d+)\{([^}]*)\}/g, (m, cls, body) => {
    if (/display:none/.test(body)) return m;
    const fill = (body.match(/fill:(#[0-9A-Fa-f]{6})/) || [])[1];
    return fill && fill.toUpperCase() === '#FFFFFF' ? `.${cls}{fill:#000000;}` : `.${cls}{fill:none;}`;
  });
}
const F = (file, regions, override, opts) => ({ file, regions, override, ...(opts || {}) });
// regions: [{ id, group, sub, split? }]; split cuts the blob (in source bbox units) into named parts.
const FRONT = [
  F('Trapezius.svg', [{ id: 'Upper Traps', group: 'back', sub: 'Traps' }]),
  F('Deltoids.svg', [{ id: 'Front Delts', group: 'shoulders', sub: 'Front Delts', split: { kind: 'medial', frac: 0.55 } }, { id: 'Side Delts', group: 'shoulders', sub: 'Side Delts', split: { kind: 'lateral', frac: 0.45 } }], 'front'),
  F('Pectoralis Major.svg', [
    { id: 'Upper Chest', group: 'chest', sub: 'Upper Chest', split: { kind: 'fan', from: 0, to: 0.35 } },
    { id: 'Mid Chest', group: 'chest', sub: 'Mid Chest', split: { kind: 'fan', from: 0.35, to: 0.68 } },
    { id: 'Lower Chest', group: 'chest', sub: 'Lower Chest', split: { kind: 'fan', from: 0.68, to: 1.01 } },
  ]),
  F('Soleus.svg', [{ id: 'Soleus', group: 'legs', sub: 'Calves' }]),
  // the seller reddens only rows 1-2 in one file and the lower pair in another; row 3 is in neither.
  // Full_body_muscles has the whole rectus red, so take it from there, clipped to the two files' extent.
  { file: 'Full_body_muscles.svg', clipTo: ['Rectus Abdominus.svg', 'Rectus Abdominus_lower.svg'], midline: true, closeK: 3, axisCut: 1, regions: [
    { id: 'Upper Abs', group: 'core', sub: 'Upper Abs', split: { kind: 'band', from: 0, to: 0.45, tilt: 0 } },
    { id: 'Lower Abs', group: 'core', sub: 'Lower Abs', split: { kind: 'band', from: 0.45, to: 1.01, tilt: 0 } },
  ] },
  F('Biceps brachii.svg', [
    { id: 'Biceps (long head)', group: 'arms', sub: 'Biceps', split: { kind: 'axis', side: 'lateral', frac: 0.55 } },
    { id: 'Biceps (short head)', group: 'arms', sub: 'Biceps', split: { kind: 'axis', side: 'medial', frac: 0.45 } },
  ]),
  F('Brachialis.svg', [{ id: 'Brachialis', group: 'arms', sub: 'Biceps', inset: 0, minArea: 2 }]),
  F('Triceps brachii, long head.svg', [{ id: 'Triceps (long head)', group: 'arms', sub: 'Triceps', inset: 0.3, minArea: 2 }]),
  F('Triceps brachii, medial head.svg', [{ id: 'Triceps (medial head)', group: 'arms', sub: 'Triceps', inset: 0.25, minArea: 2 }]),
  F('Brachioradialis.svg', [{ id: 'Brachioradialis', group: 'arms', sub: 'Forearms' }]),
  F('Extensor  carpi radialis.svg', [{ id: 'Wrist Extensors', group: 'arms', sub: 'Forearms' }]),
  // the bundle's serratus fingers, closed, form the flank strip from the ribs to the crest: that IS the oblique on this figure
  F('Serratus Anterior.svg', [{ id: 'Obliques', group: 'core', sub: 'Obliques' }], undefined, { closeK: 6 }),
  F('Tensor fasciae latae.svg', [{ id: 'TFL', group: 'legs', sub: 'Outer Thighs' }]),
  F('Sartorius.svg', [{ id: 'Sartorius', group: 'legs', sub: null, inset: 1.8 }]),
  F('Adductor Longus and Pectineus.svg', [{ id: 'Adductors', group: 'legs', sub: 'Inner Thighs' }], 'fullfront'),
  F('Rectus femoris.svg', [{ id: 'Rectus Femoris', group: 'legs', sub: 'Quads' }]),
  F('Vastus Lateralis.svg', [{ id: 'Vastus Lateralis', group: 'legs', sub: 'Quads' }]),
  F('Vastus Medialis.svg', [{ id: 'Vastus Medialis', group: 'legs', sub: 'Quads' }]),
  F('Gastrocnemius (calf).svg', [{ id: 'Gastrocnemius', group: 'legs', sub: 'Calves' }]),
];
const BACK = [
  F('Trapezius.svg', [{ id: 'Upper Traps', group: 'back', sub: 'Traps' }]),
  F('Lower Trapezius.svg', [
    { id: 'Upper Back', group: 'back', sub: 'Upper Back', split: { kind: 'band', from: 0, to: 0.5, tilt: 0 } },
    { id: 'Lower Traps', group: 'back', sub: 'Mid Back', split: { kind: 'band', from: 0.5, to: 1.01, tilt: 0 } },
  ]),
  F('Deltoids.svg', [{ id: 'Rear Delts', group: 'shoulders', sub: 'Rear Delts', split: { kind: 'medial', frac: 0.5 } }, { id: 'Side Delts', group: 'shoulders', sub: 'Side Delts', split: { kind: 'lateral', frac: 0.5 } }]),
  F('Infraspinatus.svg', [{ id: 'Infraspinatus', group: 'shoulders', sub: 'Rotator Cuff' }]),
  F('Teres major.svg', [{ id: 'Teres Major', group: 'back', sub: 'Lats', inset: 0.3 }]),
  F('Gluteus maximus.svg', [{ id: 'Glute Max', group: 'legs', sub: 'Glutes' }]),
  F('Gluteus medius.svg', [{ id: 'Glute Med', group: 'legs', sub: 'Outer Thighs' }]),
  F('Tensor fascie latae.svg', [{ id: 'TFL', group: 'legs', sub: 'Outer Thighs' }]),
  F('Adductor magnus.svg', [{ id: 'Adductor Magnus', group: 'legs', sub: 'Inner Thighs' }]),
  F('Gastrocnemius, medial head.svg', [{ id: 'Gastrocnemius (medial)', group: 'legs', sub: 'Calves' }]),
  F('Gastrocnemius, lateral head.svg', [{ id: 'Gastrocnemius (lateral)', group: 'legs', sub: 'Calves' }]),
  F('Triceps Brachii ( long head, lateral head ).svg', [
    { id: 'Triceps (long head)', group: 'arms', sub: 'Triceps', split: { kind: 'lens', side: 'medial' } },
    { id: 'Triceps (lateral head)', group: 'arms', sub: 'Triceps', split: { kind: 'lens', side: 'lateral' } },
  ], undefined, { noFill: true }),
  F('Brachioradialis.svg', [{ id: 'Brachioradialis', group: 'arms', sub: 'Forearms' }]),
  F('Extensor carpi radialis.svg', [{ id: 'Wrist Extensors', group: 'arms', sub: 'Forearms' }]),
  F('Flexor carpi radialis.svg', [{ id: 'Wrist Flexors', group: 'arms', sub: 'Forearms' }]),
  F('Flexor carpi ulnaris.svg', [{ id: 'Flexor Carpi Ulnaris', group: 'arms', sub: 'Forearms' }], 'fullback'),
  F('Biceps fermoris.svg', [{ id: 'Biceps Femoris', group: 'legs', sub: 'Hamstrings' }]),
  F('Semitendinosus.svg', [{ id: 'Semitendinosus', group: 'legs', sub: 'Hamstrings' }]),
  F('Gracilis.svg', [{ id: 'Gracilis', group: 'legs', sub: 'Inner Thighs', inset: 0.4 }]),
];

/** Cut a blob mask (pixel coords) for one region spec; returns a filtered mask sharing W/H. */
function cutBlob(mask, comp, split, sideSign) {
  // sideSign: -1 when the blob is on the viewer's left of the axis (its MEDIAL edge is maxX), +1 on the right.
  if (!split) return mask;
  const { m, W, H } = mask; const out = new Uint8Array(W * H);
  const fan = split.kind === 'fan' ? fanRange(mask, comp, sideSign) : null;
  const lens = split.kind === 'lens' ? lensLine(mask, comp) : null;
  const axis = split.kind === 'axis' ? axisCut(mask, comp, split.side === 'lateral' ? split.frac : 1 - split.frac) : null; if (lens && process.env.DEBUG) console.log('DBG lens', JSON.stringify({ ...lens, side: split.side, comp: [comp.minX, comp.minY, comp.maxX, comp.maxY, comp.n] }));
  const bw = comp.maxX - comp.minX, bh = comp.maxY - comp.minY;
  for (let y = comp.minY; y <= comp.maxY; y++) for (let x = comp.minX; x <= comp.maxX; x++) {
    const i = y * W + x; if (!m[i]) continue;
    // medial distance 0..1 (0 = medial edge)
    const med = sideSign < 0 ? (comp.maxX - x) / bw : (x - comp.minX) / bw;
    let keep = false;
    if (split.kind === 'medial') keep = med <= split.frac;
    else if (split.kind === 'lateral') keep = med > 1 - split.frac;
    else if (split.kind === 'band') { const v = (y - comp.minY) / bh - split.tilt * med; keep = v >= split.from - 0.0001 && v < split.to; }
    else if (split.kind === 'fan') { const t = (fanAngle(x, y) - fan.min) / (fan.max - fan.min || 1); keep = t >= split.from - 0.0001 && t < split.to; }
    else if (split.kind === 'axis') { const sv = (x - axis.cx) * axis.nx + (y - axis.cy) * axis.ny; keep = split.side === 'lateral' ? sv <= axis.thr : sv > axis.thr; }
    else if (split.kind === 'lens') { const sgn = (x - lens.hx) * lens.nx + (y - lens.hy) * lens.ny; keep = split.side === 'medial' ? sgn * lens.medialSign > 0 : sgn * lens.medialSign <= 0; }
    if (keep) out[i] = 1;
  }
  return { m: out, W, H };
  // pec heads fan out from the arm insertion: angle about a pivot just outside the blob's lateral-top corner
  function fanAngle(x, y) { const px = sideSign < 0 ? comp.minX - 0.08 * bw : comp.maxX + 0.08 * bw, py = comp.minY - 0.05 * bh; return Math.atan2(y - py, sideSign < 0 ? x - px : px - x); }
}
/** Cut a blob along its own long axis: the normal points medially (increasing x for the viewer's-left blob), and
 *  `thr` is the signed offset below which `lateralFrac` of the pixels lie. */
function axisCut(mask, comp, lateralFrac) {
  const { m, W } = mask; const pts = [];
  for (let y = comp.minY; y <= comp.maxY; y++) for (let x = comp.minX; x <= comp.maxX; x++) if (m[y * W + x]) pts.push([x, y]);
  let sx = 0, sy = 0; for (const [x, y] of pts) { sx += x; sy += y; } const cx = sx / pts.length, cy = sy / pts.length;
  let cxx = 0, cyy = 0, cxy = 0; for (const [x, y] of pts) { cxx += (x - cx) ** 2; cyy += (y - cy) ** 2; cxy += (x - cx) * (y - cy); }
  const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy); let nx = -Math.sin(ang), ny = Math.cos(ang);
  if (nx < 0) { nx = -nx; ny = -ny; } // medial = +x
  const sv = pts.map(([x, y]) => (x - cx) * nx + (y - cy) * ny).sort((a, b) => a - b);
  const thr = sv[Math.min(sv.length - 1, Math.floor(sv.length * lateralFrac))];
  return { cx, cy, nx, ny, thr };
}
/** The tendon gap between two heads drawn as one blob: whatever a large close fills in. Returns a cut line (centroid + normal). */
function lensLine(mask, comp) {
  const { m, W } = mask; const pad = 30; const x0 = Math.max(0, comp.minX - pad), y0 = Math.max(0, comp.minY - pad);
  const bw = Math.min(W - 1, comp.maxX + pad) - x0 + 1, bh = Math.min(mask.H - 1, comp.maxY + pad) - y0 + 1;
  const sub = new Uint8Array(bw * bh); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) sub[y * bw + x] = m[(y0 + y) * W + (x0 + x)];
  const sealed = closeMask({ m: sub, W: bw, H: bh }, 26).m;
  const gap = new Uint8Array(bw * bh); for (let i = 0; i < bw * bh; i++) gap[i] = sealed[i] && !sub[i] ? 1 : 0;
  const cc = components({ m: gap, W: bw, H: bh }, 30); const g = cc.comps.sort((p, q) => q.n - p.n)[0];
  if (!g) return { hx: (comp.minX + comp.maxX) / 2, hy: (comp.minY + comp.maxY) / 2, nx: 1, ny: 0, medialSign: 1, holePx: 0 };
  let sx = 0, sy = 0, n = 0; const pts = [];
  for (let y = g.minY; y <= g.maxY; y++) for (let x = g.minX; x <= g.maxX; x++) if (cc.label[y * bw + x] === g.id) { pts.push([x, y]); sx += x; sy += y; n++; }
  const cx = sx / n, cy = sy / n; let cxx = 0, cyy = 0, cxy = 0; for (const [x, y] of pts) { cxx += (x - cx) ** 2; cyy += (y - cy) ** 2; cxy += (x - cx) * (y - cy); }
  const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy); const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  return { hx: x0 + cx, hy: y0 + cy, nx, ny, medialSign: nx >= 0 ? 1 : -1, holePx: n };
}
function fanRange(mask, comp, sideSign) {
  const { m, W } = mask; const bw = comp.maxX - comp.minX, bh = comp.maxY - comp.minY; let min = 1e9, max = -1e9;
  const px = sideSign < 0 ? comp.minX - 0.08 * bw : comp.maxX + 0.08 * bw, py = comp.minY - 0.05 * bh;
  for (let y = comp.minY; y <= comp.maxY; y++) for (let x = comp.minX; x <= comp.maxX; x++) { if (!m[y * W + x]) continue; const a = Math.atan2(y - py, sideSign < 0 ? x - px : px - x); if (a < min) min = a; if (a > max) max = a; }
  return { min, max };
}

async function main() {
  // ---- 1. silhouette ----
  const traced = JSON.parse(fs.readFileSync(path.join(DIR, 'traced.json'), 'utf8'));
  const half = tuneSilhouette(traced.front.half);
  const outlinePath = symmetricPath(half);

  // ---- 2. rasters ----
  const ourSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}"><path d="${outlinePath}" fill="#000"/></svg>`);
  const ourR = maskFrom(await rasterize(ourSvg, 72 * SCALE), isInk);
  const ourRaw = rowIntervals(ourR); const ourCx = 100 * SCALE; const ourL = landmarks(ourRaw, ourCx);
  const ourRows = canonicalRows(ourRaw, ourL, ourCx);
  console.log('landmarks ours', ourL);

  // ---- 3. muscles ----
  const asset = { front: {}, back: {} };
  const report = [];
  const bodyCache = new Map();
  for (const view of ['front', 'back']) {
    const list = view === 'front' ? FRONT : BACK;
    for (const entry of list) {
      const file = path.join(SRC, entry.override || ('full' + view), 'SVG files', entry.file);
      if (!fs.existsSync(file)) { report.push(`MISSING ${view}/${entry.file}`); continue; }
      const text = fs.readFileSync(file, 'utf8');
      // the file's own white body silhouette is the warp source: same frame as its muscle, always aligned
      let body = bodyCache.get(file);
      if (!body) {
        const br = solidify(maskFrom(await rasterize(Buffer.from(whiteOnly(text)), ETSY_DENSITY), isInk));
        const rows = rowIntervals(br);
        let minX = br.W, maxX = 0; for (const iv of rows) if (iv.length) { minX = Math.min(minX, iv[0][0]); maxX = Math.max(maxX, iv[iv.length - 1][1]); }
        const cx = (minX + maxX) / 2; const lm = landmarks(rows, cx);
        body = { rows: canonicalRows(rows, lm, cx), cx, lm, minX, top: lm.top };
        bodyCache.set(file, body);
        if (process.env.DEBUG) console.log('DBG body', view, entry.file, JSON.stringify(lm));
      }
      const ymap = makeYMap(body.lm, ourL);
      const r = maskFrom(await rasterize(Buffer.from(redOnly(text)), ETSY_DENSITY), isRed);
      entry._first = { m: r.m.slice(), W: r.W, H: r.H };
      // union of sibling files (each exported with its own artboard offset): align by their body extents
      for (const sibling of (entry.files || []).slice(1)) {
        const sf = path.join(SRC, entry.override || ('full' + view), 'SVG files', sibling);
        const st = fs.readFileSync(sf, 'utf8');
        const sb = solidify(maskFrom(await rasterize(Buffer.from(whiteOnly(st)), ETSY_DENSITY), isInk));
        const srows = rowIntervals(sb); let sMinX = sb.W; for (const iv of srows) if (iv.length) sMinX = Math.min(sMinX, iv[0][0]);
        let sTop = 0; while (sTop < srows.length && !srows[sTop].length) sTop++;
        const dx = body.minX - sMinX, dy = body.top - sTop;
        const sr = maskFrom(await rasterize(Buffer.from(redOnly(st)), ETSY_DENSITY), isRed);
        const shifted = { m: new Uint8Array(r.W * r.H), W: r.W, H: r.H };
        for (let y = 0; y < sr.H; y++) for (let x = 0; x < sr.W; x++) { if (!sr.m[y * sr.W + x]) continue; const tx = x + dx, ty = y + dy; if (tx >= 0 && ty >= 0 && tx < r.W && ty < r.H) { r.m[ty * r.W + tx] = 1; shifted.m[ty * r.W + tx] = 1; } }
        entry._second = shifted;
      }
      // everything red in one file is ONE muscle: close the drawn highlight seams inside it (glutes, lats, ...)
      if (entry.clipTo) {
        // clip this file's red to the union extent of other files' red (aligned by body extents), and put the
        // Upper/Lower split where the first clip file ends (rows 1-2 vs row 3 + lower pair)
        let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9, firstMax = 0;
        for (const [ci, cf] of entry.clipTo.entries()) {
          const ct = fs.readFileSync(path.join(SRC, entry.override || ('full' + view), 'SVG files', cf), 'utf8');
          const cb = solidify(maskFrom(await rasterize(Buffer.from(whiteOnly(ct)), ETSY_DENSITY), isInk));
          const crows = rowIntervals(cb); let cMinX = cb.W; for (const iv of crows) if (iv.length) cMinX = Math.min(cMinX, iv[0][0]);
          let cTop = 0; while (cTop < crows.length && !crows[cTop].length) cTop++;
          const dx = body.minX - cMinX, dy = body.top - cTop;
          const cr = maskFrom(await rasterize(Buffer.from(redOnly(ct)), ETSY_DENSITY), isRed);
          for (let y = 0; y < cr.H; y++) for (let x = 0; x < cr.W; x++) { if (!cr.m[y * cr.W + x]) continue; const tx = x + dx, ty = y + dy; bx0 = Math.min(bx0, tx); bx1 = Math.max(bx1, tx); by0 = Math.min(by0, ty); by1 = Math.max(by1, ty); if (ci === 0) firstMax = Math.max(firstMax, ty); }
        }
        const pad = 10; for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) if (x < bx0 - pad || x > bx1 + pad || y < by0 - pad || y > by1 + pad) r.m[y * r.W + x] = 0;
        let rMin = 1e9, rMax = -1e9; for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) if (r.m[y * r.W + x]) { rMin = Math.min(rMin, y); rMax = Math.max(rMax, y); }
        const frac = (firstMax + 8 - rMin) / (rMax - rMin);
        entry.regions[0].split.to = frac; entry.regions[1].split.from = frac;
        if (process.env.DEBUG) console.log('DBG clip', entry.file, 'bbox', bx0, by0, bx1, by1, 'firstMax', firstMax, 'frac', frac.toFixed(3));
      }
      { const closed = closeMask(r, entry.closeK || 4); r.m = closed.m; }
      if (!entry.noFill) { const filled = solidify(r, 0); r.m = filled.m; } // a muscle never has a hole in it: fill enclosed gaps
      if (entry.seamClose) {
        // two files that meet mid-muscle: close hard only across the band where they overlap so the half-cells fuse
        const yMinOf = (mm) => { for (let y = 0; y < mm.H; y++) for (let x = 0; x < mm.W; x++) if (mm.m[y * mm.W + x]) return y; return 0; };
        const yMaxOf = (mm) => { for (let y = mm.H - 1; y >= 0; y--) for (let x = 0; x < mm.W; x++) if (mm.m[y * mm.W + x]) return y; return 0; };
        const top = yMaxOf(entry._first), bot = yMinOf(entry._second); const yA = Math.min(top, bot) - 34, yB = Math.max(top, bot) + 34;
        // close the WHOLE mask (so band edges see their real neighbours), then keep the result only inside the seam band
        const closedAll = closeMask(r, entry.seamClose).m; for (let y = Math.max(0, yA); y <= Math.min(r.H - 1, yB); y++) for (let x = 0; x < r.W; x++) r.m[y * r.W + x] = closedAll[y * r.W + x];
        if (process.env.DEBUG) console.log('DBG seam', entry.file, 'first maxY', top, 'second minY', bot);
      }
      // every muscle is a mirrored pair: keep the two sides apart at the axis so closing never bridges them
      { const c0 = Math.round(body.cx), hw = entry.axisCut ?? 3; for (let y = 0; y < r.H; y++) for (let x = c0 - hw; x <= c0 + hw; x++) r.m[y * r.W + x] = 0; }
      const { comps } = components(r, 60);
      // left-of-axis blobs only (we mirror); keep the largest 1 (2 for split delts/pecs is still one blob per side)
      const left = comps.filter((c) => c.cx < body.cx).sort((a, b) => b.n - a.n);
      if (!left.length) { report.push(`NO LEFT BLOB ${view}/${entry.file}`); continue; }
      for (const spec of entry.regions) {
        const subpaths = []; let boundsAll = null;
        // a muscle can be several blobs on one side (e.g. serratus fingers) -> union as subpaths
        // split specs cut ONE merged extent (a muscle drawn as several cells, e.g. the rectus, still splits as a whole)
        const sizable = entry.single ? [left[0]] : left.filter((c) => c.n >= left[0].n * 0.08).slice(0, 6);
        const merged = sizable.reduce((m, c) => ({ id: -1, n: m.n + c.n, cx: 0, minX: Math.min(m.minX, c.minX), maxX: Math.max(m.maxX, c.maxX), minY: Math.min(m.minY, c.minY), maxY: Math.max(m.maxY, c.maxY) }), { id: -1, n: 0, minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 });
        // a spec can claim one blob of a multi-blob muscle by position: 'medial' (closest to the axis) or 'lateral'
        const byPos = spec.blob ? [...sizable].sort((a, b) => spec.blob === 'medial' ? b.cx - a.cx : a.cx - b.cx).slice(0, 1) : null;
        const blobs = spec.split ? [merged] : byPos || sizable;
        for (const blob of blobs) {
          const cutMask = cutBlob(r, blob, spec.split, -1);
          const cc = components(cutMask, 60);
          const cand = cc.comps.filter((c) => c.cx < body.cx).sort((a, b) => b.n - a.n);
          const parts = spec.split ? cand.filter((c) => c.n >= cand[0].n * 0.15).slice(0, 4) : cand.slice(0, 1);
          for (const part of parts) {
            const raw = traceBoundary(cutMask, cc.label, part);
            if (process.env.DEBUG) console.log("DBG", view, spec.id, "blob n", blob.n, "parts", cc.comps.length, "part n", part.n, "raw", raw.length);
            const simp = rdp(raw, 1.2 * SCALE / 4 * 2);
            const res = resampleClosed(simp, 3 * SCALE);
            // warp: source px -> our viewbox units
            const legLike = spec.group === 'legs';
            const splitTorso = (iv, cx) => {
              // above the crotch the torso is one slot; for leg muscles treat it as two half-slots (left/right)
              const out = []; for (const [a, b] of iv) { if (a < cx && b > cx) out.push([a, Math.floor(cx)], [Math.ceil(cx), b]); else out.push([a, b]); } return out;
            };
            const warped = res.map((p) => {
              const sy = Math.max(0, Math.min(body.rows.length - 1, Math.round(p.y)));
              const ty = ymap(p.y); const tyi = Math.max(0, Math.min(ourRows.length - 1, Math.round(ty)));
              const srcIv = legLike ? splitTorso(body.rows[sy], body.cx) : body.rows[sy];
              const dstIv = legLike ? splitTorso(ourRows[tyi], ourCx) : ourRows[tyi];
              const tx = mapX(p.x, srcIv, dstIv, body.cx, ourCx);
              return { x: tx / SCALE, y: ty / SCALE };
            });
            let poly = rdp(warped, 0.35);
            poly = smoothClosed(poly, 1);
            const area0 = Math.abs(polyArea(poly));
            if (process.env.DEBUG) console.log("DBG", view, spec.id, "area0", area0.toFixed(1), "pts", poly.length);
            if (area0 < (spec.minArea ?? 8) || poly.length < 5) continue; // sliver
            poly = inset(poly, spec.inset ?? (area0 < 40 ? 0.35 : Math.min(1.0, 0.16 * Math.sqrt(area0))));
            if (Math.abs(polyArea(poly)) < 2 || poly.length < 5) continue;
            const clamp = (p) => ({ x: r1(Math.max(0, Math.min(VB_W, p.x))), y: r1(Math.max(0, Math.min(VB_H, p.y))) });
            const L = poly.map(clamp); const R = L.map((p) => ({ x: r1(200 - p.x), y: p.y })).reverse();
            subpaths.push(closedPath(L), closedPath(R));
            const b = bbox(L.concat(R)); boundsAll = boundsAll ? { x0: Math.min(boundsAll.x0, b.x0), y0: Math.min(boundsAll.y0, b.y0), x1: Math.max(boundsAll.x1, b.x1), y1: Math.max(boundsAll.y1, b.y1) } : b;
          }
        }
        if (!subpaths.length) { report.push(`EMPTY ${view}/${spec.id}`); continue; }
        asset[view][spec.id] = { group: spec.group, sub: spec.sub, bounds: { x0: Math.floor(boundsAll.x0), y0: Math.floor(boundsAll.y0), x1: Math.ceil(boundsAll.x1), y1: Math.ceil(boundsAll.y1) }, path: subpaths.join(' ') };
      }
    }
  }
  // ---- 4. regions the bundle lacks, drawn from our own silhouette rows ----
  const SYNTH = [
  ];
  for (const sp of SYNTH) {
    const left = [], right = [];
    const n = 14;
    for (let k = 0; k <= n; k++) {
      const t = k / n; const y = Math.round(sp.y0 + (sp.y1 - sp.y0) * t); const iv = ourRows[Math.max(0, Math.min(ourRows.length - 1, y))];
      if (!iv || !iv.length) continue;
      const seg = sp.slot === 'leg' ? iv[iv.length === 4 ? 1 : 0] : iv[0];
      const [a, b] = seg; const w = b - a;
      left.push({ x: (a + w * (sp.lat[0] + (sp.lat[1] - sp.lat[0]) * t)) / SCALE, y: y / SCALE });
      right.push({ x: (a + w * (sp.med[0] + (sp.med[1] - sp.med[0]) * t)) / SCALE, y: y / SCALE });
    }
    let poly = left.concat(right.reverse());
    poly = smoothClosed(poly, 2);
    poly = inset(poly, 0.7);
    const L = poly.map((p) => ({ x: r1(p.x), y: r1(p.y) })); const R = L.map((p) => ({ x: r1(200 - p.x), y: p.y })).reverse();
    const b = bbox(L.concat(R));
    asset[sp.view][sp.id] = { group: sp.group, sub: sp.sub, bounds: { x0: Math.floor(b.x0), y0: Math.floor(b.y0), x1: Math.ceil(b.x1), y1: Math.ceil(b.y1) }, path: closedPath(L) + ' ' + closedPath(R) };
  }
  // ---- 4b. regions drawn in OUR frame with raster booleans ----
  // Shapes are laid out from our landmarks and row slots; the neighbours listed for each view are
  // subtracted so nothing overlaps, earlier-drawn shapes win over later ones, then each shape is
  // eroded for the channel and traced. Back: lat fan + erector pair. Front: rectus cells + obliques.
  // Back thigh: two diverging hamstring strips.
  const torsoEdge = (y) => { const iv = ourRows[Math.max(0, Math.min(ourRows.length - 1, Math.round(y)))]; if (!iv || !iv.length) return 60 * SCALE; const seg = iv.length >= 3 ? iv[1] : iv[0]; return seg[0]; }; // left torso edge, px
  const legSlot = (y) => { const iv = ourRows[Math.max(0, Math.min(ourRows.length - 1, Math.round(y)))]; if (!iv || iv.length < 2) return [60 * SCALE, 98 * SCALE]; return iv.length === 4 ? iv[1] : iv[0]; }; // left leg, px
  const U = (px) => px / SCALE;
  const A = ourL.armpit, C = ourL.crotch, span = C - A;
  const erectorHalf = (t) => 9 + 3 * t; // units, top -> bottom
  const chan = 1.2; // units of geometry gap (erosion adds ~0.5 per side)
  const bnd = (view, key) => (asset[view][key] ? asset[view][key].bounds : null);

  // -- back --
  const latPoly = () => {
    const teres = bnd('back', 'Teres Major'); const trap = bnd('back', 'Lower Traps');
    const pts = [];
    // apex tucked right under the teres major at the arm; upper edge runs medially to the spine just
    // below the lower-trap tip; medial edge down beside the erectors; lower edge out to the iliac crest
    const yApex = (teres ? teres.y1 + 1.2 : U(A) + 2) * SCALE;
    const yMedTop = (trap ? Math.max(trap.y1 - 6, U(A)) : U(A) + 4) * SCALE;
    const yMedBot = C - 0.45 * span, yIliac = C - 0.55 * span;
    pts.push({ x: U(torsoEdge(yApex)) + 1.5, y: U(yApex) });
    pts.push({ x: U(torsoEdge(yApex)) + 9, y: U(yApex) + 0.5 });
    for (let k = 0; k <= 12; k++) { const t = k / 12; const y = yMedTop + (yMedBot - yMedTop) * t; pts.push({ x: 100 - erectorHalf(Math.max(0, (y - (A + 0.2 * span)) / (C - 0.05 * span - (A + 0.2 * span)))) - chan, y: U(y) }); }
    { // lower edge: flat beside the erectors, rising into a rounded lateral corner
      const med = pts[pts.length - 1]; const xLat = U(torsoEdge(yIliac)) + 1.5, yLat = U(yIliac);
      for (let k = 7; k >= 0; k--) { const u = k / 8; pts.push({ x: xLat + (med.x - xLat) * u, y: yLat + (med.y - yLat) * Math.sin(Math.PI / 2 * u) }); }
    }
    for (let k = 10; k >= 1; k--) { const t = k / 10; const y = yApex + (yIliac - yApex) * t; pts.push({ x: U(torsoEdge(y)) + 1.5, y: U(y) }); }
    return pts;
  };
  const erectorPoly = () => {
    const pts = []; const y0 = A + 0.2 * span, y1 = C - 0.05 * span;
    for (let k = 0; k <= 10; k++) { const t = k / 10; const y = y0 + (y1 - y0) * t; pts.push({ x: 100 - erectorHalf(t), y: U(y) }); }
    for (let k = 10; k >= 0; k--) { const t = k / 10; const y = y0 + (y1 - y0) * t; pts.push({ x: 100 - 1.4, y: U(y) }); }
    return pts;
  };
  // hamstrings: from just under the glute to just above the knee crease; the lateral strip stays
  // lateral, the medial strip drifts medial (a downward V), they never cross
  const hamPoly = (lat0, lat1, med0, med1) => {
    const g = bnd('back', 'Glute Max'); const y0 = (g ? g.y1 + chan : U(C) + 2) * SCALE, y1 = ourL.knee - 0.04 * (ourL.bottom - ourL.crotch);
    const pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; const y = y0 + (y1 - y0) * t; const [a, bb] = legSlot(y); const w = bb - a; pts.push({ x: U(a + w * (lat0 + (lat1 - lat0) * t)), y: U(y) }); }
    for (let k = 12; k >= 0; k--) { const t = k / 12; const y = y0 + (y1 - y0) * t; const [a, bb] = legSlot(y); const w = bb - a; pts.push({ x: U(a + w * (med0 + (med1 - med0) * t)), y: U(y) }); }
    return pts;
  };

  // -- front --
  const roundedRect = (x0, y0, x1, y1, r) => {
    const pts = []; const arc = (cx, cy, a0, a1) => { for (let k = 0; k <= 4; k++) { const a = a0 + (a1 - a0) * k / 4; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } };
    arc(x0 + r, y0 + r, Math.PI, 1.5 * Math.PI); arc(x1 - r, y0 + r, 1.5 * Math.PI, 2 * Math.PI); arc(x1 - r, y1 - r, 0, 0.5 * Math.PI); arc(x0 + r, y1 - r, 0.5 * Math.PI, Math.PI);
    return pts;
  };
  const absLayout = () => {
    const lc = bnd('front', 'Lower Chest'); const top = (lc ? lc.y1 : 124) + 2.2;
    const bottom = U(C) - 0.62 * U(span); // iliac level, where the lower pair ends
    const rowH = 8.4, gap = chan; const colW = 18, mid = 100 - 1.2;
    const cells = [];
    for (let rI = 0; rI < 3; rI++) { const y0 = top + rI * (rowH + gap); cells.push({ id: rI === 0 ? 'Upper Abs' : rI === 1 ? 'Upper Abs (2)' : 'Upper Abs (3)', y0, y1: y0 + rowH, x0: mid - colW, x1: mid }); }
    const lowerTop = top + 3 * (rowH + gap);
    cells.push({ id: 'Lower Abs', y0: lowerTop, y1: bottom, x0: mid - colW, x1: mid, taper: 3 });
    return cells;
  };
  const cellPoly = (c) => {
    const pts = roundedRect(c.x0, c.y0, c.x1, c.y1, 2.2);
    if (!c.taper) return pts;
    // lower pair: narrows toward the pelvis on the lateral side
    return pts.map((p) => { const t = (p.y - c.y0) / (c.y1 - c.y0); return p.x < (c.x0 + c.x1) / 2 ? { x: p.x + c.taper * t, y: p.y } : p; });
  };
  const obliquePolyFront = (cells) => {
    const y0 = cells[0].y0 + 1.5, y1 = cells[cells.length - 1].y1; const medial = cells[0].x0 - chan; const pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; const y = y0 + (y1 - y0) * t; pts.push({ x: U(torsoEdge(y * SCALE)) + 1.5, y }); }
    for (let k = 12; k >= 0; k--) { const t = k / 12; const y = y0 + (y1 - y0) * t; pts.push({ x: medial, y }); }
    return pts;
  };

  const polyD = (pts) => 'M ' + pts.map((p) => r1(p.x) + ' ' + r1(p.y)).join(' L ') + ' Z';
  async function rasterD(d) { return maskFrom(await rasterize(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}"><path d="${d}" fill="#000"/></svg>`), 72 * SCALE), isInk); }
  function erode(mask, k) { const { W, H } = mask; let cur = mask.m; for (let i = 0; i < k; i++) { const nx = new Uint8Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const j = y * W + x; if (cur[j] && cur[j - 1] && cur[j + 1] && cur[j - W] && cur[j + W]) nx[j] = 1; } cur = nx; } return { m: cur, W, H }; }
  function dilate(mask, k) { const { W, H } = mask; let cur = mask.m; for (let i = 0; i < k; i++) { const nx = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = y * W + x; if (cur[j] || (x > 0 && cur[j - 1]) || (x < W - 1 && cur[j + 1]) || (y > 0 && cur[j - W]) || (y < H - 1 && cur[j + W])) nx[j] = 1; } cur = nx; } return { m: cur, W, H }; }
  async function drawRegions(view, specs, neighbourKeys) {
    const keys = neighbourKeys.filter((k) => asset[view][k]);
    // neighbours are grown by 3px (0.75 units) before subtraction so the smoothed trace never creeps back over them
    const subtractMask = keys.length ? dilate(await rasterD(keys.map((k) => asset[view][k].path).join(' ')), 3) : null;
    const drawnMasks = [];
    for (const sp of specs) {
      let m = await rasterD(polyD(sp.poly));
      if (subtractMask) for (let i = 0; i < m.W * m.H; i++) if (subtractMask.m[i]) m.m[i] = 0;
      for (const prev of drawnMasks) for (let i = 0; i < m.W * m.H; i++) if (prev.m[i]) m.m[i] = 0; // earlier drawn shapes win (already dilated)
      for (let y = 0; y < m.H; y++) for (let x = 100 * SCALE - 1; x < m.W; x++) m.m[y * m.W + x] = 0; // left side only (we mirror)
      if (sp.open) m = dilate(erode(m, sp.open), sp.open); // opening: drops hair-thin horns left by neighbour subtraction
      const er = erode(m, 2);
      const cc = components(er, 60); const part = cc.comps.sort((a, b) => b.n - a.n)[0];
      if (!part) { report.push(`EMPTY ${view}/${sp.id} (drawn)`); continue; }
      const raw = traceBoundary(er, cc.label, part);
      let poly = rdp(raw, 2.0).map((p) => ({ x: p.x / SCALE, y: p.y / SCALE }));
      poly = smoothClosed(poly, 1);
      const L = poly.map((p) => ({ x: r1(p.x), y: r1(p.y) })); const R = L.map((p) => ({ x: r1(200 - p.x), y: p.y })).reverse();
      const b = bbox(L.concat(R));
      asset[view][sp.id] = { group: sp.group, sub: sp.sub, bounds: { x0: Math.floor(b.x0), y0: Math.floor(b.y0), x1: Math.ceil(b.x1), y1: Math.ceil(b.y1) }, path: closedPath(L) + ' ' + closedPath(R) };
      drawnMasks.push(dilate(await rasterD(asset[view][sp.id].path), 3));
    }
  }
  await drawRegions('back', [
    { id: 'Erector Spinae', group: 'back', sub: 'Lower Back', poly: erectorPoly(), open: 6 }, // opening blunts the tip between the glute lobes so the trace cannot creep onto the glute max
    { id: 'Lats', group: 'back', sub: 'Lats', poly: latPoly() },
  ], ['Lower Traps', 'Rhomboids', 'Teres Major', 'Infraspinatus', 'Glute Max', 'Glute Med', 'Triceps', 'TFL', 'Adductor Magnus', 'Gracilis', 'Gastrocnemius (medial)', 'Gastrocnemius (lateral)']);
  // ---- 4c. core + limbs drawn as exact geometry (no raster): crisp edges, explicit gaps ----
  const GAP = 1.4, EDGE = 1.6; // units: between regions / from the silhouette edge
  const F_ = ourL.fingertip, K_ = ourL.knee, ANK_ = ourL.ankle;
  const armSlot = (y) => { const iv = ourRows[Math.max(0, Math.min(ourRows.length - 1, Math.round(y)))]; if (!iv || iv.length < 3) return [30 * SCALE, 45 * SCALE]; return iv[0]; }; // left arm, px
  const legW0 = (() => { const [a, b] = legSlot(C + 3 * SCALE); return b - a; })();
  const legAny = (y) => (y >= C ? legSlot(y) : [torsoEdge(y), torsoEdge(y) + legW0]); // hip rows: the leg's width from the hip edge
  /** Round every corner of a polygon with radius r (quadratic arcs), keeping it closed. */
  const roundCorners = (poly, r) => {
    const n = poly.length; const out = [];
    for (let i = 0; i < n; i++) {
      const p = poly[(i - 1 + n) % n], v = poly[i], q = poly[(i + 1) % n];
      const d1 = { x: p.x - v.x, y: p.y - v.y }, d2 = { x: q.x - v.x, y: q.y - v.y }; const l1 = Math.hypot(d1.x, d1.y) || 1, l2 = Math.hypot(d2.x, d2.y) || 1;
      const l = Math.min(r, l1 / 2, l2 / 2); const A1 = { x: v.x + d1.x / l1 * l, y: v.y + d1.y / l1 * l }, B1 = { x: v.x + d2.x / l2 * l, y: v.y + d2.y / l2 * l };
      for (let k = 0; k <= 3; k++) { const t = k / 3, u = 1 - t; out.push({ x: u * u * A1.x + 2 * u * t * v.x + t * t * B1.x, y: u * u * A1.y + 2 * u * t * v.y + t * t * B1.y }); }
    }
    return out;
  };
  const emitDirect = (view, id, group, sub, polyUnits) => {
    const L = roundCorners(polyUnits, 1.8).map((p) => ({ x: r1(Math.max(0, Math.min(VB_W, p.x))), y: r1(Math.max(0, Math.min(VB_H, p.y))) }));
    const R = L.map((p) => ({ x: r1(200 - p.x), y: p.y })).reverse();
    const bb = bbox(L.concat(R));
    asset[view][id] = { group, sub, bounds: { x0: Math.floor(bb.x0), y0: Math.floor(bb.y0), x1: Math.ceil(bb.x1), y1: Math.ceil(bb.y1) }, path: closedPath(L, 0) + ' ' + closedPath(R, 0) };
  };
  /** A strip between two edges sampled down a slot: edges(t, a, b) -> [xLeft, xRight] in units. y in px. */
  const strip = (slotFn, y0, y1, edges, n = 16) => {
    const left = [], right = [];
    for (let k = 0; k <= n; k++) { const t = k / n; const y = y0 + (y1 - y0) * t; const [a, bb] = slotFn(y); const [xl, xr] = edges(t, U(a), U(bb)); left.push({ x: xl, y: U(y) }); right.push({ x: xr, y: U(y) }); }
    return left.concat(right.reverse());
  };

  // -- front thigh: TFL cap, vastus lateralis, rectus femoris, vastus medialis, adductors --
  {
    const lower = bnd('front', 'Lower Abs'); const hipTop = ((lower ? lower.y1 : 170) + 5) * SCALE;
    const kneeTop = K_ - 0.03 * (ourL.bottom - C);
    const thighH = kneeTop - hipTop; const at = (f) => hipTop + f * thighH;
    const w3 = (t, a, b) => { const w = b - a; return { a, b, w }; };
    // tibialis anterior: lateral-front of the shin, constant width, stops well above the ankle
    emitDirect('front', 'Tibialis Anterior', 'legs', null, strip(legSlot, K_ + 0.1 * (ANK_ - K_), ANK_ - 0.14 * (ANK_ - K_), (t, a, b) => { const w = b - a; const g = t < 0.4 ? 0.05 + 1.125 * t : 0.5 + 0.7833 * (t - 0.4); const belly = Math.pow(Math.sin(Math.PI * g), 0.7); const c = 0.32 + 0.02 * t, hw = 0.045 + 0.12 * belly; return [a + w * (c - hw), a + w * (c + hw)]; }, 14));
  }

  // ---- 4d. back soleus (the seller only drew it on the front): below and beside the gastroc heads ----
  {
    const y0 = K_ + 0.26 * (ANK_ - K_), y1 = ANK_ - 0.08 * (ANK_ - K_);
    const poly = strip(legSlot, y0, y1, (t, a, b) => { const w = b - a; const k = t > 0.72 ? (t - 0.72) / 0.28 : 0; return [a + EDGE + 0.28 * w * k, b - EDGE - 0.28 * w * k]; }, 16);
    await drawRegions('back', [{ id: 'Soleus', group: 'legs', sub: 'Calves', poly, open: 4 }], ['Gastrocnemius (medial)', 'Gastrocnemius (lateral)', 'Biceps Femoris', 'Semitendinosus']);
  }
  // ---- 4e. lower rectus: the seller's lower pair stops short of the pubis on our figure; stretch it down 8 units ----
  {
    const lower = asset.front['Lower Abs'];
    if (lower) {
      const subs = lower.path.split(/(?=M )/).filter(Boolean);
      const mapped = subs.map((sp) => {
        const nums = (sp.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); let y0 = 1e9, y1 = -1e9; for (let i = 1; i < nums.length; i += 2) { y0 = Math.min(y0, nums[i]); y1 = Math.max(y1, nums[i]); }
        if (y0 < lower.bounds.y0 + 8) return sp; // row 3 stays; only the lower pair stretches
        const k = (y1 - y0 + 8) / (y1 - y0); let idx = 0;
        return sp.replace(/-?\d+(?:\.\d+)?/g, (m) => { const v = Number(m); const out = (idx++ % 2 === 1) ? r1(y0 + (v - y0) * k) : v; return String(out); });
      });
      lower.path = mapped.join(' ');
      const nums = (lower.path.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); let y1 = -1e9; for (let i = 1; i < nums.length; i += 2) y1 = Math.max(y1, nums[i]); lower.bounds.y1 = Math.ceil(y1);
    }
  }
  if (report.length) console.log('REPORT\n' + report.join('\n'));
  console.log('regions front', Object.keys(asset.front).length, 'back', Object.keys(asset.back).length);
  for (const v of ['front', 'back']) for (const [k, r] of Object.entries(asset[v])) console.log(`${v.padEnd(5)} ${k.padEnd(24)} x ${String(r.bounds.x0).padStart(3)}-${String(r.bounds.x1).padEnd(3)} y ${String(r.bounds.y0).padStart(3)}-${r.bounds.y1}`);

  // ---- 5. emit ----
  const ts = `/**
 * AUTO-GENERATED by tools/bodymap/build.js — do not hand-edit.
 * Silhouette: traced from the Recraft figure (tools/bodymap/trace.js), tuned in build.js.
 * Regions: the purchased Create4decor muscle bundle, warped onto our figure (see build.js).
 *
 * Shared 200x440 coordinate space. Region keys are anatomical names; \`sub\` is the
 * catalog sub-muscle display name the region lights up for (null = detail-only,
 * never highlighted until the catalog tags it); \`group\` is the lowercase
 * primary-muscle-group key understood by getMuscleGroupVisual.
 */

export type BodyMapView = 'front' | 'back';

export type BodyMapRegionBounds = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type BodyMapRegion = {
  /** Lowercase muscle-group key for hue lookup (chest, back, legs, ...). */
  group: string;
  /** Catalog sub-muscle this region belongs to (highlight vocabulary), or null. */
  sub: string | null;
  /** Bounding box in viewbox units (drives the focus-frame camera). */
  bounds: BodyMapRegionBounds;
  /** SVG path data; contains two subpaths (left + right), more for multi-part muscles. */
  path: string;
};

export const BODY_MAP_VIEWBOX = { width: ${VB_W}, height: ${VB_H} } as const;

/** Whole-body silhouette outline (identical for both views by construction). */
export const BODY_OUTLINE_PATH =
  ${JSON.stringify(outlinePath)};

export const BODY_MAP_REGIONS: Record<BodyMapView, Record<string, BodyMapRegion>> = {
${['front', 'back'].map((v) => `  ${v}: {\n${Object.entries(asset[v]).map(([k, r]) => `    ${JSON.stringify(k)}: {\n      group: ${JSON.stringify(r.group)},\n      sub: ${JSON.stringify(r.sub)},\n      bounds: { x0: ${r.bounds.x0}, y0: ${r.bounds.y0}, x1: ${r.bounds.x1}, y1: ${r.bounds.y1} },\n      path: ${JSON.stringify(r.path)},\n    },`).join('\n')}\n  },`).join('\n')}
};
`;
  if (!DRY) { fs.writeFileSync(OUT_TS, ts); console.log('wrote', path.relative(process.cwd(), OUT_TS)); }
  fs.writeFileSync(path.join(DIR, 'built.json'), JSON.stringify({ outlinePath, asset, landmarks: { ours: ourL } }, null, 1));
  writePreview(outlinePath, asset);
}

// ---------------------------------------------------------------------------
// preview
// ---------------------------------------------------------------------------
const GROUP_HUES = { chest: '#e05252', back: '#4f8cff', legs: '#3cb46e', shoulders: '#f5a623', arms: '#b06cf0', core: '#ffd25a' };
function writePreview(outlinePath, asset) {
  const fig = (view, colorFor, size, bg, body, quiet) => {
    const w = Math.round(size * VB_W / VB_H);
    return `<svg viewBox="0 0 ${VB_W} ${VB_H}" width="${w}" height="${size}" style="background:${bg};border-radius:8px">
      <path d="${outlinePath}" fill="${body}"/>
      ${Object.entries(asset[view]).map(([k, r]) => `<path d="${r.path}" fill="${colorFor(k, r) || quiet}"><title>${k} · ${r.sub || '—'}</title></path>`).join('')}
    </svg>`;
  };
  const dark = { bg: '#0f1115', body: '#2a2e36', quiet: '#3a3f4a' }, light = { bg: '#f6f6f8', body: '#dcdfe5', quiet: '#c9cdd5' };
  const byGroup = (k, r) => GROUP_HUES[r.group];
  const scenario = (subs) => (k, r) => subs[r.sub] ? (subs[r.sub] >= 1 ? GROUP_HUES[r.group] : GROUP_HUES[r.group] + '55') : null;
  const scen = [
    ['Incline Bench Press', { 'Upper Chest': 1, 'Front Delts': 0.4, 'Triceps': 0.4 }],
    ['Bent-Over Row', { 'Lats': 1, 'Upper Back': 1, 'Biceps': 0.4, 'Rear Delts': 0.4 }],
    ['Back Squat', { 'Quads': 1, 'Glutes': 1, 'Lower Back': 0.4 }],
    ['Romanian Deadlift', { 'Hamstrings': 1, 'Glutes': 1, 'Lower Back': 0.4 }],
    ['Lateral Raise', { 'Side Delts': 1 }],
    ['Calf Raise', { 'Calves': 1 }],
  ];
  const html = `<!doctype html><meta charset=utf-8><title>bodymap v2 preview</title>
<style>body{font:12px system-ui;margin:16px;background:#1a1c21;color:#ddd}.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:20px}.p{text-align:center}.p b{display:block;margin-bottom:6px;font-weight:500}svg path:hover{stroke:#fff;stroke-width:.6}</style>
<h3>All regions coloured by group (hover a region for its name)</h3>
<div class=row>${['front', 'back'].map((v) => `<div class=p><b>${v} · dark</b>${fig(v, byGroup, 560, dark.bg, dark.body, dark.quiet)}</div><div class=p><b>${v} · light</b>${fig(v, byGroup, 560, light.bg, light.body, light.quiet)}</div>`).join('')}</div>
<h3>Quiet figure (nothing highlighted) — this is what most screens show</h3>
<div class=row>${['front', 'back'].map((v) => `<div class=p><b>${v}</b>${fig(v, () => null, 420, dark.bg, dark.body, dark.quiet)}</div><div class=p><b>${v}</b>${fig(v, () => null, 420, light.bg, light.body, light.quiet)}</div>`).join('')}</div>
<h3>Scenarios @200px (front + back)</h3>
<div class=row>${scen.map(([name, subs]) => `<div class=p><b>${name}</b>${fig('front', scenario(subs), 200, dark.bg, dark.body, dark.quiet)} ${fig('back', scenario(subs), 200, dark.bg, dark.body, dark.quiet)}</div>`).join('')}</div>
<h3>Tile size @44px and @90px</h3>
<div class=row>${scen.map(([name, subs]) => `<div class=p><b>${name}</b>${fig('front', scenario(subs), 44, dark.bg, dark.body, dark.quiet)} ${fig('back', scenario(subs), 44, dark.bg, dark.body, dark.quiet)} ${fig('front', scenario(subs), 90, dark.bg, dark.body, dark.quiet)} ${fig('back', scenario(subs), 90, dark.bg, dark.body, dark.quiet)}</div>`).join('')}</div>`;
  fs.writeFileSync(path.join(DIR, 'preview2.html'), html);
}

main().catch((e) => { console.error(e); process.exit(1); });
