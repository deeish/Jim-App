/**
 * Silhouette tracer for the body-map figure.
 *
 * Input: a raster with two flat dark figures on white (front left, back right),
 * e.g. tools/bodymap/source/minimal-flat-vector-illustration--a-solid-dark-cha.png
 * Output: tools/bodymap/traced.json  { front: {half:[...pts]}, back: {...}, meta }
 *         tools/bodymap/traced.html  preview (raster vs. trace vs. symmetric flat render)
 *
 * Pipeline per figure: binary mask -> largest blob -> Moore boundary trace ->
 * Ramer-Douglas-Peucker simplify -> resample -> split at the vertical axis ->
 * keep the LEFT half -> mirror (perfect symmetry by construction) -> fit into
 * the 200x440 viewBox used by bodyMapPaths.ts.
 *
 * Usage: node tools/bodymap/trace.js [pngPath]
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = process.argv[2] || path.join(__dirname, 'source', 'minimal-flat-vector-illustration--a-solid-dark-cha.png');
const VB_W = 200, VB_H = 440, FIG_H = 428;
const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = png;

// ---------- 1. binary mask ----------
const mask = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b);
  mask[i] = a > 128 && lum < 140 ? 1 : 0;
}
const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : mask[y * W + x];

// ---------- 2. connected components (largest two = the figures) ----------
const label = new Int32Array(W * H).fill(-1);
const comps = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (!mask[i] || label[i] !== -1) continue;
  const id = comps.length; const stack = [i]; label[i] = id;
  let n = 0, minX = W, maxX = 0, minY = H, maxY = 0;
  while (stack.length) {
    const j = stack.pop(); n++;
    const jx = j % W, jy = (j - jx) / W;
    if (jx < minX) minX = jx; if (jx > maxX) maxX = jx; if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = jx + dx, ny = jy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (mask[k] && label[k] === -1) { label[k] = id; stack.push(k); }
    }
  }
  comps.push({ id, n, minX, maxX, minY, maxY });
}
comps.sort((a, b) => b.n - a.n);
const figs = comps.slice(0, 2).sort((a, b) => a.minX - b.minX); // left = front, right = back
if (figs.length < 2) throw new Error('expected two figures, found ' + comps.length);

// ---------- 3. Moore-neighbour boundary trace of one component ----------
function traceBoundary(comp) {
  const inside = (x, y) => at(x, y) && label[y * W + x] === comp.id;
  // start: topmost, then leftmost pixel of the component
  let sx = -1, sy = -1;
  outer: for (let y = comp.minY; y <= comp.maxY; y++) for (let x = comp.minX; x <= comp.maxX; x++) if (inside(x, y)) { sx = x; sy = y; break outer; }
  const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // clockwise from N
  const pts = [[sx, sy]];
  let cx = sx, cy = sy, backtrack = 6; // we came from the west
  for (let guard = 0; guard < W * H; guard++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (backtrack + 1 + k) % 8;
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (inside(nx, ny)) {
        pts.push([nx, ny]);
        backtrack = (d + 4) % 8 - 1; if (backtrack < 0) backtrack += 8; // enter from the previous cell
        // standard Moore: next search starts from the neighbour before the one we entered from
        backtrack = (d + 5) % 8;
        cx = nx; cy = ny; found = true; break;
      }
    }
    if (!found) break;
    if (cx === sx && cy === sy && pts.length > 2) break;
  }
  pts.pop();
  return pts;
}

// ---------- 4. simplify + resample ----------
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  let idx = -1, dmax = 0;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  return [pts[0], pts[pts.length - 1]];
}
function resample(pts, step) {
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - acc;
    while (t < seg) { out.push([a[0] + (b[0] - a[0]) * t / seg, a[1] + (b[1] - a[1]) * t / seg]); t += step; }
    acc = (acc + seg) % step;
  }
  return out;
}

// ---------- 5. symmetrise: keep the left half between the two axis crossings ----------
function leftHalf(pts, cx) {
  // rotate so we start at the topmost axis crossing
  const n = pts.length;
  let top = 0;
  for (let i = 0; i < n; i++) if (Math.abs(pts[i][0] - cx) < 1.5 && pts[i][1] < pts[top][1]) top = i;
  const rot = pts.slice(top).concat(pts.slice(0, top));
  // walk both directions from top; the left chain is the one whose x stays <= cx (with slack)
  const walk = (dir) => {
    const chain = [rot[0]];
    for (let k = 1; k < n; k++) {
      const p = rot[(dir * k + n) % n];
      chain.push(p);
      if (k > 20 && p[0] >= cx - 0.5 && chain[chain.length - 2][0] < cx) break; // crossed back to the axis
    }
    return chain;
  };
  const a = walk(1), b = walk(-1);
  const meanX = (c) => c.reduce((s, p) => s + p[0], 0) / c.length;
  return meanX(a) < meanX(b) ? a : b;
}

// ---------- 6. fit + smooth (Catmull-Rom -> cubic Bezier, same as gen.js) ----------
const r1 = (n) => Math.round(n * 10) / 10;
function closedPath(pts, s = 1) {
  const n = pts.length; const get = (i) => pts[((i % n) + n) % n];
  let d = `M ${r1(get(0).x)} ${r1(get(0).y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * s, y: p1.y + ((p2.y - p0.y) / 6) * s };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * s, y: p2.y - ((p3.y - p1.y) / 6) * s };
    d += ` C ${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return d + ' Z';
}
function symmetricPath(half) {
  const mirrored = half.map((p) => ({ x: 2 * 100 - p.x, y: p.y })).reverse().slice(1, -1);
  return closedPath(half.concat(mirrored));
}

const out = { meta: { src: path.basename(SRC), W, H, viewBox: `0 0 ${VB_W} ${VB_H}` } };
const previews = [];
for (const [name, comp] of [['front', figs[0]], ['back', figs[1]]]) {
  const raw = traceBoundary(comp);
  const simp = rdp(raw, 0.8);
  const res = resample(simp, 4);
  const cx = (comp.minX + comp.maxX) / 2;
  const half = leftHalf(res, cx);
  // fit into viewBox: height -> FIG_H, axis -> x=100
  const k = FIG_H / (comp.maxY - comp.minY + 1);
  const topPad = (VB_H - FIG_H) / 2;
  const fit = (p) => ({ x: 100 + (p[0] - cx) * k, y: topPad + (p[1] - comp.minY) * k });
  const halfFit = half.map(fit);
  // snap the two axis endpoints exactly onto x=100
  halfFit[0].x = 100; halfFit[halfFit.length - 1].x = 100;
  // thin the half to ~2.4 units spacing so the Bezier stays smooth but faithful
  const thinned = [halfFit[0]];
  for (let i = 1; i < halfFit.length - 1; i++) { const q = thinned[thinned.length - 1]; if (Math.hypot(halfFit[i].x - q.x, halfFit[i].y - q.y) >= 2.4) thinned.push(halfFit[i]); }
  thinned.push(halfFit[halfFit.length - 1]);
  const pathD = symmetricPath(thinned.map((p) => ({ x: r1(p.x), y: r1(p.y) })));
  out[name] = { half: thinned.map((p) => [r1(p.x), r1(p.y)]), path: pathD, rawPoints: raw.length, halfPoints: thinned.length, bbox: [comp.minX, comp.minY, comp.maxX, comp.maxY], cx };
  previews.push({ name, comp, cx, k, topPad, pathD });
}
fs.writeFileSync(path.join(__dirname, 'traced.json'), JSON.stringify(out, null, 1));

// ---------- 7. preview page ----------
const b64 = fs.readFileSync(SRC).toString('base64');
const pane = (p) => {
  const { comp, cx, k, topPad, name, pathD } = p;
  // raster crop mapped into the same viewBox via <image> with a transform
  const imgX = 100 - cx * k, imgY = topPad - comp.minY * k;
  return `
  <div class="pane"><b>${name}: raster (grey) vs trace (red line)</b><br>
    <svg viewBox="0 0 ${VB_W} ${VB_H}" width="300" height="660" style="background:#fff">
      <image href="data:image/png;base64,${b64}" x="${imgX}" y="${imgY}" width="${W * k}" height="${H * k}" opacity="0.35"/>
      <path d="${pathD}" fill="none" stroke="#e11" stroke-width="0.8"/>
    </svg></div>
  <div class="pane"><b>${name}: symmetric flat, dark theme</b><br>
    <svg viewBox="0 0 ${VB_W} ${VB_H}" width="300" height="660" style="background:#0f1115"><path d="${pathD}" fill="#3a3f4a"/></svg></div>
  <div class="pane"><b>${name}: light theme</b><br>
    <svg viewBox="0 0 ${VB_W} ${VB_H}" width="300" height="660" style="background:#f6f6f8"><path d="${pathD}" fill="#d7d9de"/></svg></div>
  <div class="pane"><b>${name} @44px / @180px</b><br>
    <svg viewBox="0 0 ${VB_W} ${VB_H}" width="20" height="44" style="background:#0f1115"><path d="${pathD}" fill="#3a3f4a"/></svg>
    <svg viewBox="0 0 ${VB_W} ${VB_H}" width="82" height="180" style="background:#0f1115"><path d="${pathD}" fill="#3a3f4a"/></svg></div>`;
};
fs.writeFileSync(path.join(__dirname, 'traced.html'), `<!doctype html><meta charset=utf-8><style>body{font:12px system-ui;margin:12px;background:#ddd}.pane{display:inline-block;vertical-align:top;margin:0 10px 12px 0}</style>${previews.map(pane).join('')}`);
console.log(JSON.stringify({ front: { raw: out.front.rawPoints, half: out.front.halfPoints, bbox: out.front.bbox }, back: { raw: out.back.rawPoints, half: out.back.halfPoints, bbox: out.back.bbox } }));
