/**
 * Regenerates the app icon set from the SAME vector paths the in-app brand mark
 * uses (src/components/JGlyphSkia.tsx), so the icon and the logo can never drift.
 *
 *   node tools/brand/render-icons.js
 *
 * Writes icon.png, adaptive-icon.png, splash.png, favicon.png and icon-source.png
 * into ./assets. Re-run after changing brandGradientStart / brandGradientEnd /
 * brandGlyphShade in src/theme/colors.ts — the values below are the only place
 * this file duplicates the palette, and they are asserted against it at startup.
 *
 * Renders SVG through headless Chromium (@playwright/test is already a dev
 * dependency for the e2e suite), so there is no image toolchain to install.
 *
 * NOTE: icon/splash/favicon are bundled into the native binary. Regenerating them
 * requires a new build — they cannot ship over the air.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const THEME = path.join(__dirname, '..', '..', 'src', 'theme', 'colors.ts');

// --- brand tokens (kept in step with src/theme/colors.ts, verified below) ---
const GRAD_START = '#3B9DFF';
const GRAD_END = '#0047B3';
const GLYPH_SHADE = '#D9E4F2';
const PAGE_BG = '#F2F2F7';

// Fail loudly rather than silently shipping an icon that no longer matches the app.
function assertPaletteInSync() {
  const src = fs.readFileSync(THEME, 'utf8');
  const expect = {
    brandGradientStart: GRAD_START,
    brandGradientEnd: GRAD_END,
    brandGlyphShade: GLYPH_SHADE,
    background: PAGE_BG,
  };
  const drift = Object.entries(expect).filter(
    ([token, hex]) => !new RegExp(`${token}:\\s*'${hex}'`, 'i').test(src),
  );
  if (drift.length) {
    console.error(
      'Palette drift — src/theme/colors.ts no longer matches this generator:\n' +
        drift.map(([t, h]) => `  ${t} is not ${h}`).join('\n') +
        '\nUpdate the constants at the top of this file, then re-run.',
    );
    process.exit(1);
  }
}

// --- geometry, from JGlyphSkia.tsx ---
// The stem starts at y=20 here rather than the app's y=17: a 12-wide round cap
// from y=17 tops out at y=11 while the 6-wide bar only spans y=14..20, so three
// units of cap sit proud of the barbell as a visible hump at 1024px. Starting at
// y=20 puts the cap's top edge exactly on the bar's, hidden beneath it.
const J_BODY = 'M36 20 L36 45 Q36 60 24 60 Q12 60 12 49';
const BAR = 'M9 17 L63 17';
// The app's "abs" easter-egg etch. Deliberately unused: its 2px cuts overhang the
// 12px stem by a round cap each side and read as grey smudges at icon scale, and
// the barbell already carries the gym signal. Kept so the option is discoverable.
// eslint-disable-next-line no-unused-vars
const ABS = 'M36 22 L36 43 M30 28 L42 28 M30 34 L42 34 M30 40 L42 40';
// Skia's skewX is radians, SVG's is degrees. -0.18 rad = the wordmark's italic lean.
const LEAN_DEG = (-0.18 * 180) / Math.PI;

function glyph({ id, withAbs = false }) {
  return `
  <defs>
    <linearGradient id="metal-${id}" gradientUnits="userSpaceOnUse" x1="36" y1="4" x2="36" y2="64">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.5" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="${GLYPH_SHADE}"/>
    </linearGradient>
    <filter id="shadow-${id}" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1.6" stdDeviation="1.7" flood-color="#001A3D" flood-opacity="0.30"/>
    </filter>
  </defs>
  <g transform="translate(36,36) skewX(${LEAN_DEG.toFixed(3)}) translate(-36,-36)" filter="url(#shadow-${id})">
    <path d="${J_BODY}" stroke="url(#metal-${id})" stroke-width="12"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="${BAR}" stroke="url(#metal-${id})" stroke-width="6" stroke-linecap="round" fill="none"/>
    <rect x="12" y="5" width="8" height="24" rx="2.5" fill="url(#metal-${id})"/>
    <rect x="52" y="5" width="8" height="24" rx="2.5" fill="url(#metal-${id})"/>
    ${withAbs ? `<path d="${ABS}" stroke="rgba(0,32,80,0.45)" stroke-width="2" stroke-linecap="round" fill="none"/>` : ''}
  </g>`;
}

function tile({ id, size, glyphFrac, round = 0 }) {
  const g = size * glyphFrac;
  const off = (size - g) / 2;
  const r = size * round;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="chip-${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${GRAD_START}"/><stop offset="1" stop-color="${GRAD_END}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#chip-${id})"/>
    <svg x="${off}" y="${off}" width="${g}" height="${g}" viewBox="0 0 72 72">${glyph({ id })}</svg>
  </svg>`;
}

/**
 * The splash field is PAGE_BG, the same value as splash.backgroundColor in
 * app.json. That equality is the point: resizeMode 'contain' letterboxes on any
 * device whose aspect ratio differs from this image, and matching the field to
 * the background makes those bars invisible instead of framing the artwork.
 */
function splash({ w, h, chipFrac = 0.347 }) {
  const chip = Math.round(w * chipFrac);
  const x = (w - chip) / 2;
  const y = (h - chip) / 2;
  const g = chip * 0.62;
  const goff = (chip - g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="chip-splash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${GRAD_START}"/><stop offset="1" stop-color="${GRAD_END}"/>
      </linearGradient>
      <filter id="lift" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="${chip * 0.035}" stdDeviation="${chip * 0.05}" flood-color="#0A2E66" flood-opacity="0.22"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="${PAGE_BG}"/>
    <g filter="url(#lift)">
      <rect x="${x}" y="${y}" width="${chip}" height="${chip}" rx="${chip * 0.225}" ry="${chip * 0.225}" fill="url(#chip-splash)"/>
    </g>
    <svg x="${x + goff}" y="${y + goff}" width="${g}" height="${g}" viewBox="0 0 72 72">${glyph({ id: 'splash' })}</svg>
  </svg>`;
}

const TARGETS = [
  // iOS: full-bleed square, no rounded corners (iOS applies its own squircle mask)
  // and no alpha, both of which App Store review requires.
  { name: 'icon.png', w: 1024, h: 1024, svg: () => tile({ id: 'icon', size: 1024, glyphFrac: 0.56 }) },
  // Android adaptive FOREGROUND. Full-bleed so the launcher mask always cuts
  // gradient, with the glyph inside the guaranteed-visible centre 66% (~683px)
  // so no mask shape can clip it.
  { name: 'adaptive-icon.png', w: 1024, h: 1024, svg: () => tile({ id: 'adaptive', size: 1024, glyphFrac: 0.44 }) },
  { name: 'splash.png', w: 1284, h: 2778, svg: () => splash({ w: 1284, h: 2778 }) },
  { name: 'favicon.png', w: 48, h: 48, svg: () => tile({ id: 'fav', size: 48, glyphFrac: 0.66, round: 0.22 }) },
  // Unreferenced hi-res master. Regenerated too, so a later re-export from it
  // cannot reintroduce the retired warm palette.
  { name: 'icon-source.png', w: 1254, h: 1254, svg: () => tile({ id: 'src', size: 1254, glyphFrac: 0.56 }) },
];

(async () => {
  assertPaletteInSync();
  const browser = await chromium.launch({ headless: true });
  for (const t of TARGETS) {
    const page = await browser.newPage({
      viewport: { width: Math.max(t.w, 200), height: Math.max(t.h, 200) },
      deviceScaleFactor: 1,
    });
    await page.setContent(`<!doctype html><html><body style="margin:0">${t.svg()}</body></html>`, {
      waitUntil: 'load',
    });
    await page.screenshot({
      path: path.join(ASSETS, t.name),
      clip: { x: 0, y: 0, width: t.w, height: t.h },
    });
    await page.close();
    console.log(`${t.name.padEnd(20)} ${t.w}x${t.h}`);
  }
  await browser.close();
  console.log('\nWrote to', ASSETS, '— icon/splash changes need a new native build.');
})();
