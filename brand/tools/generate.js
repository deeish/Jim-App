/*
 * Regenerates every Jim logo asset from the geometry constants below.
 *
 * Needs `sharp`, which is NOT a project dependency. Run from the repo root and
 * point it at any directory that has sharp in its node_modules:
 *   node brand/tools/generate.js path/to/dir-with-sharp
 *
 * Writes brand/*.svg + *.png and the frontend/assets icon set. The SVGs are the
 * source of truth; this script exists so the numbers only live in one place.
 */
const path = require('path');
const fs = require('fs');

const modDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
// eslint-disable-next-line import/no-dynamic-require, global-require
const sharp = require(require.resolve('sharp', { paths: [modDir] }));

const ROOT = path.resolve(__dirname, '..', '..');
const BRAND = path.join(ROOT, 'brand');
const ASSETS = path.join(ROOT, 'frontend', 'assets');

// ---- geometry (100 x 100 design space) -------------------------------------
const STEM_TOP = 20;
const STEM_X = 66;
const CX = 44;
const CY = 52;
const R = 22;
const HOOK_DEG = 235;
const STROKE = 14;
const GAP = 6.5;
const SEGMENTS = 5;

const rad = (HOOK_DEG * Math.PI) / 180;
const endX = +(CX + R * Math.cos(rad)).toFixed(2);
const endY = +(CY + R * Math.sin(rad)).toFixed(2);
const PATH = `M${STEM_X} ${STEM_TOP} L${STEM_X} ${CY} A${R} ${R} 0 1 1 ${endX} ${endY}`;
const LEN = +(CY - STEM_TOP + R * rad).toFixed(2);
const SEG = +((LEN - (SEGMENTS - 1) * GAP) / SEGMENTS).toFixed(2);
// Centre the stroke's bounding box (x 15..73, y 20..81) in the tile at ~63% width.
const TRANSFORM = 'translate(50,50) scale(1.08) translate(-44,-50.5)';

const base = `${SEG} ${GAP}`;
const filled = (k) => {
  if (k >= SEGMENTS) return base;
  if (k <= 0) return null;
  return [...Array(k - 1).fill(base), `${SEG} 400`].join(' ');
};

// ---- colours -----------------------------------------------------------------
const C = {
  light: { bg: '#FFFFFF', fill: '#2563EB', unfilled: '#C5D8FB' },
  dark: { bg: '#0B0B0B', fill: '#4D9BFF', unfilled: '#1E3663' },
  mono: { bg: '#0B0B0B', fill: '#FFFFFF', unfilled: '#3A3A3C' },
  tinted: { bg: '', fill: '#FFFFFF', unfilled: '#FFFFFF' },
  progress: { fill: '#2563EB', unfilled: '#D9DDE5' },
};

const pathEl = (stroke, dash, indent) =>
  `\n${indent}<path d="${PATH}" fill="none" stroke="${stroke}" stroke-width="${STROKE}" stroke-dasharray="${dash}"/>`;

const paths = (k, fill, unfilled, indent) => {
  const f = filled(k);
  const under = k >= SEGMENTS ? '' : pathEl(unfilled, base, indent);
  const over = f ? pathEl(fill, f, indent) : '';
  return under + over;
};

const icon = (comment, k, c, { bg = true, scale = 1 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- ${comment} -->${bg ? `\n  <rect width="1024" height="1024" fill="${c.bg}"/>` : ''}
  <g transform="scale(10.24)">
    <g transform="translate(50,50) scale(${(1.08 * scale).toFixed(3)}) translate(-44,-50.5)">${paths(k, c.fill, c.unfilled, '      ')}
    </g>
  </g>
</svg>
`;

const small = (comment, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none">
  <!-- ${comment} -->
  <g transform="${TRANSFORM}">${body}
  </g>
</svg>
`;

const files = {
  'jim-icon-light-1024.svg': icon(
    'Jim app icon, light. Full bleed, no alpha, no baked corner radius (iOS masks it). All five segments filled: the icon never shows progress state.',
    5,
    C.light,
  ),
  'jim-icon-dark-1024.svg': icon('Jim app icon, dark (iOS 18 dark icon variant).', 5, C.dark),
  'jim-icon-mono-dark-1024.svg': icon('Jim app icon, monochrome dark. Press, merch, coloured grounds.', 5, C.mono),
  'jim-icon-tinted-1024.svg': icon(
    'iOS 18 tinted icon source: white mark on transparent; the system applies the user tint by luminance.',
    5,
    C.tinted,
    { bg: false },
  ),
  'jim-android-adaptive-1024.svg': icon(
    'Android adaptive-icon foreground: transparent, mark scaled to sit inside the 66dp safe zone. Background colour comes from app.json.',
    5,
    C.light,
    { bg: false, scale: 0.66 },
  ),
  'jim-mark.svg': small(
    'Bare Jim mark, transparent, all five segments in currentColor. Nav bars, lockups, favicons, anything that is not the app icon.',
    pathEl('currentColor', base, '    '),
  ),
  'jim-progress-3of5.svg': small(
    "In-app progress element, 3 of 5 filled. Only the top path's stroke-dasharray changes between states; see README.",
    paths(3, C.progress.fill, C.progress.unfilled, '    '),
  ),
  'jim-tonal-3of5.svg': small(
    'Brand tonal mark (pale blue, 3 of 5). Marketing and the website hero only. Never the app icon, never live data.',
    paths(3, C.light.fill, C.light.unfilled, '    '),
  ),
};

(async () => {
  for (const [name, svg] of Object.entries(files)) fs.writeFileSync(path.join(BRAND, name), svg);

  const png = (svgName, out, size = 1024, opaque = false) => {
    let s = sharp(Buffer.from(files[svgName])).resize(size, size);
    if (opaque) s = s.flatten().removeAlpha();
    return s.png().toFile(out);
  };
  for (const n of ['jim-icon-light-1024', 'jim-icon-dark-1024', 'jim-icon-mono-dark-1024']) {
    await png(`${n}.svg`, path.join(BRAND, `${n}.png`), 1024, true); // App Store rejects alpha
  }
  for (const n of ['jim-icon-tinted-1024', 'jim-android-adaptive-1024']) {
    await png(`${n}.svg`, path.join(BRAND, `${n}.png`));
  }

  // ---- app asset set ----------------------------------------------------------
  fs.copyFileSync(path.join(BRAND, 'jim-icon-light-1024.png'), path.join(ASSETS, 'icon.png'));
  fs.copyFileSync(path.join(BRAND, 'jim-icon-dark-1024.png'), path.join(ASSETS, 'icon-dark.png'));
  fs.copyFileSync(path.join(BRAND, 'jim-icon-tinted-1024.png'), path.join(ASSETS, 'icon-tinted.png'));
  fs.copyFileSync(path.join(BRAND, 'jim-android-adaptive-1024.png'), path.join(ASSETS, 'adaptive-icon.png'));

  // favicon: bare blue mark on transparent, 64 px
  const fav = files['jim-mark.svg'].replace('stroke="currentColor"', `stroke="${C.light.fill}"`);
  await sharp(Buffer.from(fav)).resize(64, 64).png().toFile(path.join(ASSETS, 'favicon.png'));

  // splash: 1284 x 2778 (iPhone @3x), mark centred at SPLASH_MARK_PT * 3 on the app
  // background. Keep SPLASH_MARK_PT equal to the size LoadingScreen renders the mark
  // at, so the native-splash -> loader handoff does not jump.
  const SPLASH_MARK_PT = 96;
  const SPLASH_BG = '#F2F2F7';
  const markPx = SPLASH_MARK_PT * 3;
  const markPng = await sharp(Buffer.from(fav)).resize(markPx, markPx).png().toBuffer();
  await sharp({ create: { width: 1284, height: 2778, channels: 3, background: SPLASH_BG } })
    .composite([
      { input: markPng, left: Math.round((1284 - markPx) / 2), top: Math.round((2778 - markPx) / 2) },
    ])
    .png()
    .toFile(path.join(ASSETS, 'splash.png'));

  console.log(
    JSON.stringify(
      {
        PATH,
        LEN,
        SEG,
        GAP,
        end: [endX, endY],
        dash: { base, 1: filled(1), 2: filled(2), 3: filled(3), 4: filled(4), 5: filled(5) },
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
