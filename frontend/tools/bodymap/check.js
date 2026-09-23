// Run after build.js: node tools/bodymap/check.js
// Mechanical quality gate for the built body map:
//  - overlap: pixels covered by two or more regions (should be 0 per view)
//  - spill: region pixels outside the silhouette (should be 0)
//  - symmetry: silhouette + regions mirror exactly
//  - holes: background components inside the silhouette (should be 0)
//  - slivers: regions with any subpath thinner than 3 units or smaller than 12 units^2
const fs = require('fs');
const sharp = require('sharp');
const b = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'built.json'), 'utf8'));
const W = 800, H = 1760; // 4x
async function mask(d) { const { data, info } = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 440" width="${W}" height="${H}"><path d="${d}" fill="#fff" fill-rule="nonzero"/></svg>`)).raw().toBuffer({ resolveWithObject: true }); const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m[i] = data[i * info.channels + 3] > 128 ? 1 : 0; return m; }
(async () => {
  const body = await mask(b.outlinePath);
  let bodyAsym = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) if (body[y * W + x] !== body[y * W + (W - 1 - x)]) bodyAsym++;
  // holes: flood background from the border
  const bg = new Uint8Array(W * H); const st = []; for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const i = st.pop(); if (bg[i] || body[i]) continue; bg[i] = 1; const x = i % W; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < W * (H - 1)) st.push(i + W); }
  let holes = 0; for (let i = 0; i < W * H; i++) if (!body[i] && !bg[i]) holes++;
  console.log(`silhouette: asymmetric px ${bodyAsym}, hole px ${holes}`);
  for (const view of ['front', 'back']) {
    const cover = new Uint8Array(W * H); let spill = 0; const overlaps = {}; const owner = new Int16Array(W * H).fill(-1); const keys = Object.keys(b.asset[view]);
    let regAsym = 0;
    for (let k = 0; k < keys.length; k++) {
      const m = await mask(b.asset[view][keys[k]].path);
      for (let i = 0; i < W * H; i++) if (m[i]) { if (!body[i]) spill++; if (cover[i]) { const o = keys[owner[i]] + ' x ' + keys[k]; overlaps[o] = (overlaps[o] || 0) + 1; } cover[i]++; owner[i] = k; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) if (m[y * W + x] !== m[y * W + (W - 1 - x)]) regAsym++;
    }
    let over = 0; for (let i = 0; i < W * H; i++) if (cover[i] > 1) over++;
    console.log(`${view}: regions ${keys.length}, overlap px ${over}, spill px ${spill}, region asymmetric px ${regAsym}`);
    for (const [k, v] of Object.entries(overlaps)) if (v > 20) console.log(`   overlap ${k}: ${v} px`);
    // slivers
    for (const key of keys) {
      for (const sp of b.asset[view][key].path.split(/(?=M )/).filter(Boolean)) {
        const nums = (sp.match(/-?\d+(\.\d+)?/g) || []).map(Number); const pts = []; for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
        let a = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
        a = Math.abs(a / 2); const thin = Math.min(x1 - x0, y1 - y0);
        if (a < 12 || thin < 3 || a / Math.max(1, (x1 - x0) * (y1 - y0)) < 0.12) console.log(`   sliver? ${view}/${key}: area ${a.toFixed(0)}, bbox ${(x1 - x0).toFixed(0)}x${(y1 - y0).toFixed(0)}`);
      }
    }
  }
})();
