/**
 * Body-map asset generator.
 *
 * Single source of truth for the muscle body-map artwork: the silhouette and
 * every muscle region are defined here as mirrored point sets, smoothed into
 * cubic-Bezier SVG paths (Catmull-Rom), and emitted as:
 *
 *   - src/components/bodymap/bodyMapPaths.ts  (the checked-in asset)
 *   - preview.html / detail.html               (browser QA pages, gitignored)
 *
 * To iterate on the artwork: edit the point sets below, run
 * `node tools/bodymap/gen.js`, open preview.html in a browser, repeat.
 * Never hand-edit bodyMapPaths.ts.
 *
 * ViewBox: 0 0 200 440. Figure is symmetric about x=100. Region keys are the
 * catalog's sub-muscle display names (SUB_MUSCLE_MAP / MUSCLE_HIERARCHY).
 * Regions are deliberate "islands" separated by ~2-unit channels of base
 * silhouette, like an anatomy chart — they must never overlap (preview.html's
 * detail page has an all-regions@0.5 stress figure to check).
 */
const fs = require('fs');
const path = require('path');

// ---------- geometry helpers ----------
const P = (x, y, corner) => ({ x, y, corner: !!corner });
const mirrorPt = (p) => ({ x: 200 - p.x, y: p.y, corner: p.corner });
const mirrorPts = (pts) => pts.map(mirrorPt).reverse();

const r1 = (n) => Math.round(n * 10) / 10;

/** Closed Catmull-Rom -> cubic Bezier path. corner:true makes a sharp joint. */
function closedPath(pts, s = 1) {
  const n = pts.length;
  const get = (i) => pts[((i % n) + n) % n];
  let d = `M ${r1(get(0).x)} ${r1(get(0).y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1 = p1.corner
      ? p1
      : { x: p1.x + ((p2.x - p0.x) / 6) * s, y: p1.y + ((p2.y - p0.y) / 6) * s };
    const c2 = p2.corner
      ? p2
      : { x: p2.x - ((p3.x - p1.x) / 6) * s, y: p2.y - ((p3.y - p1.y) / 6) * s };
    d += ` C ${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return d + ' Z';
}

/** Symmetric whole shape from a half that starts and ends on the x=100 axis. */
function symmetricPath(halfPts, s = 1) {
  const mirrored = mirrorPts(halfPts).slice(1, -1);
  return closedPath(halfPts.concat(mirrored), s);
}

/** Left shape + mirrored right shape as two subpaths in one path string. */
function pairPath(leftPts, s = 1) {
  return closedPath(leftPts, s) + ' ' + closedPath(mirrorPts(leftPts), s);
}

// ---------- silhouette (shared by front and back) ----------
// Half outline, viewer-left side, from top-of-head center to crotch center.
const OUTLINE_HALF = [
  P(100, 12),          // top of head
  P(88, 16),
  P(81, 30),           // temple
  P(82, 44),
  P(87, 55),           // jaw
  P(91, 62),
  P(89, 68),           // neck side
  P(87, 74, true),     // neck/trap junction
  P(64, 86),           // trap slope end -> delt
  P(51, 89),
  P(43, 98),
  P(42, 112),          // delt outer (widest)
  P(42, 128),
  P(39, 162),          // elbow outer
  P(36, 180),          // forearm bulge outer
  P(34, 202),
  P(33, 218),          // wrist outer
  P(31, 234),
  P(31, 248),
  P(36, 257),          // fingertip
  P(43, 254),
  P(47, 240),
  P(48, 222),          // wrist inner
  P(52, 190),
  P(55, 166),          // elbow inner
  P(60, 138),
  P(65, 118, true),    // armpit
  P(66, 124),
  P(73, 176),          // waist
  P(64, 212),
  P(63, 232),          // hip widest
  P(66, 272),
  P(71, 316),          // knee outer
  P(68, 346),          // calf outer bulge
  P(78, 398),          // ankle outer
  P(74, 408),
  P(69, 418),
  P(72, 425),
  P(83, 427),          // toe
  P(88, 420),
  P(89, 404),          // ankle inner
  P(86, 378),
  P(84, 352),          // calf inner bulge
  P(87, 326),
  P(88, 316),          // knee inner
  P(90, 290),
  P(93, 268),
  P(97, 252),
  P(100, 247, true),   // crotch
];

// ---------- regions ----------
// Each region: { group, shapes: [{ kind: 'pair'|'half'|'whole', pts, s? }] }
// 'pair'  = left shape + mirrored right subpath
// 'half'  = symmetric whole shape given as axis-to-axis half
// 'whole' = full shape as given

const FRONT = {
  'Front Delts': {
    group: 'shoulders',
    shapes: [{ kind: 'pair', pts: [P(59, 88), P(54, 96), P(56, 110), P(62, 118), P(67, 110), P(65, 95)] }],
  },
  'Side Delts': {
    group: 'shoulders',
    shapes: [{ kind: 'pair', pts: [P(52, 90), P(45, 99), P(43, 112), P(49, 122), P(55, 116), P(54, 98)] }],
  },
  'Upper Chest': {
    group: 'chest',
    shapes: [{ kind: 'pair', pts: [P(98, 94, true), P(80, 94), P(70, 99), P(66, 109), P(80, 112), P(98, 110, true)] }],
  },
  'Mid Chest': {
    group: 'chest',
    shapes: [{ kind: 'pair', pts: [P(98, 113, true), P(80, 115), P(65, 112), P(66, 125), P(80, 130), P(98, 128, true)] }],
  },
  'Lower Chest': {
    group: 'chest',
    shapes: [{ kind: 'pair', pts: [P(98, 131, true), P(80, 133), P(67, 128), P(69, 141), P(82, 148), P(98, 145, true)] }],
  },
  Biceps: {
    group: 'arms',
    shapes: [{ kind: 'pair', pts: [P(53, 104), P(47, 116), P(45, 142), P(49, 158), P(56, 154), P(59, 126), P(57, 108)] }],
  },
  Forearms: {
    group: 'arms',
    shapes: [{ kind: 'pair', pts: [P(45, 166), P(38, 178), P(35, 198), P(34, 215), P(42, 216), P(48, 196), P(51, 172)] }],
  },
  'Upper Abs': {
    group: 'core',
    shapes: [{ kind: 'pair', pts: [P(98, 150, true), P(87, 152), P(86, 170), P(87, 190), P(98, 192, true)] }],
  },
  'Lower Abs': {
    group: 'core',
    shapes: [{ kind: 'pair', pts: [P(98, 196, true), P(87, 198), P(88, 214), P(93, 228), P(98, 230, true)] }],
  },
  Obliques: {
    group: 'core',
    shapes: [{ kind: 'pair', pts: [P(81, 146), P(76, 158), P(74, 180), P(70, 204), P(76, 216), P(83, 204), P(84, 176), P(83, 152)] }],
  },
  Quads: {
    group: 'legs',
    shapes: [{ kind: 'pair', pts: [P(74, 236), P(67, 252), P(65, 282), P(69, 306), P(77, 320), P(84, 313), P(86, 296), P(85, 262), P(82, 242)] }],
  },
  'Inner Thighs': {
    group: 'legs',
    shapes: [{ kind: 'pair', pts: [P(89, 248), P(87, 264), P(88, 282), P(93, 290), P(96, 270), P(97, 252)] }],
  },
  Calves: {
    group: 'legs',
    shapes: [{ kind: 'pair', pts: [P(74, 332), P(70, 350), P(72, 376), P(77, 392), P(81, 378), P(80, 354), P(78, 336)] }],
  },
};

const BACK = {
  Traps: {
    group: 'back',
    shapes: [{ kind: 'half', pts: [P(100, 66), P(91, 70), P(66, 87), P(80, 98), P(90, 112), P(97, 134), P(100, 148)] }],
  },
  'Rear Delts': {
    group: 'shoulders',
    shapes: [{ kind: 'pair', pts: [P(53, 89), P(45, 99), P(44, 114), P(51, 123), P(59, 116), P(58, 98)] }],
  },
  'Rotator Cuff': {
    group: 'back',
    shapes: [{ kind: 'pair', pts: [P(67, 100), P(62, 110), P(65, 121), P(74, 120), P(77, 108), P(72, 99)] }],
  },
  'Upper Back': {
    group: 'back',
    shapes: [{ kind: 'pair', pts: [P(81, 114), P(78, 127), P(81, 138), P(90, 140), P(93, 126), P(90, 115)] }],
  },
  Lats: {
    group: 'back',
    shapes: [{ kind: 'pair', pts: [P(68, 120), P(67, 136), P(71, 158), P(77, 178), P(86, 194), P(92, 198), P(92, 184), P(86, 158), P(77, 136), P(72, 122)] }],
  },
  'Mid Back': {
    group: 'back',
    shapes: [{ kind: 'half', pts: [P(100, 152), P(93, 154), P(91, 170), P(94, 186), P(100, 188)] }],
  },
  'Lower Back': {
    group: 'back',
    shapes: [{ kind: 'half', pts: [P(100, 192), P(92, 194), P(90, 210), P(94, 226), P(100, 228)] }],
  },
  Triceps: {
    group: 'arms',
    shapes: [{ kind: 'pair', pts: [P(53, 104), P(46, 116), P(44, 142), P(49, 160), P(56, 154), P(58, 126), P(56, 108)] }],
  },
  Forearms: {
    group: 'arms',
    shapes: [{ kind: 'pair', pts: [P(45, 166), P(38, 178), P(35, 198), P(34, 215), P(42, 216), P(48, 196), P(51, 172)] }],
  },
  Glutes: {
    group: 'legs',
    shapes: [{ kind: 'pair', pts: [P(80, 220), P(69, 226), P(65, 242), P(70, 260), P(81, 268), P(93, 262), P(97, 244), P(92, 226)] }],
  },
  'Outer Thighs': {
    group: 'legs',
    shapes: [{ kind: 'pair', pts: [P(67, 262), P(64, 276), P(66, 296), P(71, 306), P(74, 290), P(72, 270)] }],
  },
  Hamstrings: {
    group: 'legs',
    shapes: [{ kind: 'pair', pts: [P(79, 274), P(75, 288), P(75, 306), P(80, 320), P(87, 313), P(90, 292), P(88, 277), P(84, 271)] }],
  },
  Calves: {
    group: 'legs',
    shapes: [{ kind: 'pair', pts: [P(76, 328), P(70, 342), P(70, 366), P(76, 388), P(82, 380), P(85, 356), P(83, 338)] }],
  },
};

// ---------- palette (mirrors muscleGroupMeta.ts + theme/colors.ts) ----------
const GROUP_HUES = {
  chest: { dark: '#E05B5B', light: '#BC4141' },
  back: { dark: '#5B87D6', light: '#3A64AE' },
  shoulders: { dark: '#E0913F', light: '#B26A24' },
  arms: { dark: '#9D77F0', light: '#6D45C9' },
  legs: { dark: '#4FAF74', light: '#2F7E4E' },
  core: { dark: '#D9B13B', light: '#96771C' },
  cardio: { dark: '#45B8C4', light: '#22808C' },
};
const THEMES = {
  dark: {
    pageBg: '#0F1110', card: '#1A1F1B', text: '#E8EAE6', subtext: '#9BA39C',
    body: '#242B27', quiet: 'rgba(255,255,255,0.075)', outline: '#323833',
  },
  light: {
    pageBg: '#EAE8E2', card: '#F8F6F3', text: '#23292B', subtext: '#6E7873',
    body: '#DCD8CE', quiet: 'rgba(0,0,0,0.07)', outline: '#C8C4B8',
  },
};

// ---------- path assembly ----------
function regionPath(region) {
  return region.shapes
    .map((sh) => {
      const s = sh.s == null ? 1 : sh.s;
      if (sh.kind === 'pair') return pairPath(sh.pts, s);
      if (sh.kind === 'half') return symmetricPath(sh.pts, s);
      return closedPath(sh.pts, s);
    })
    .join(' ');
}

const OUTLINE_PATH = symmetricPath(OUTLINE_HALF);
const VIEWS = { front: FRONT, back: BACK };

// ---------- bodyMapPaths.ts emitter ----------
function emitTs() {
  const regionsTs = (regions) =>
    Object.entries(regions)
      .map(
        ([key, region]) =>
          `    ${JSON.stringify(key)}: {\n      group: ${JSON.stringify(region.group)},\n      path: ${JSON.stringify(regionPath(region))},\n    },`
      )
      .join('\n');
  return `/**
 * AUTO-GENERATED by tools/bodymap/gen.js — do not hand-edit.
 * To change the artwork, edit the point sets in the generator and re-run
 * \`node tools/bodymap/gen.js\` (preview pages land next to the generator).
 *
 * Front + back body silhouettes with one SVG path per muscle region, in a
 * shared 200x440 coordinate space. Region keys are the catalog's sub-muscle
 * display names (same vocabulary as MUSCLE_HIERARCHY / SUB_MUSCLE_MAP);
 * \`group\` is the lowercase primary-muscle-group key understood by
 * getMuscleGroupVisual for hue lookup.
 */

export type BodyMapView = 'front' | 'back';

export type BodyMapRegion = {
  /** Lowercase muscle-group key for hue lookup (chest, back, legs, ...). */
  group: string;
  /** SVG path data; may contain multiple subpaths (left + right). */
  path: string;
};

export const BODY_MAP_VIEWBOX = { width: 200, height: 440 } as const;

/** Whole-body silhouette outline (identical for both views by construction). */
export const BODY_OUTLINE_PATH =
  ${JSON.stringify(OUTLINE_PATH)};

export const BODY_MAP_REGIONS: Record<BodyMapView, Record<string, BodyMapRegion>> = {
  front: {
${regionsTs(FRONT)}
  },
  back: {
${regionsTs(BACK)}
  },
};
`;
}

// ---------- SVG rendering (preview pages) ----------
function alphaHex(a) {
  return Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
}

/** highlights: Record<regionKey, intensity> */
function figureSvg(view, highlights, sizePx, themeName) {
  const t = THEMES[themeName];
  const regions = VIEWS[view];
  const w = Math.round((sizePx * 200) / 440);
  let parts = [];
  parts.push(`<path d="${OUTLINE_PATH}" fill="${t.body}" stroke="${t.outline}" stroke-width="1.5"/>`);
  for (const [key, region] of Object.entries(regions)) {
    const d = regionPath(region);
    const intensity = highlights[key];
    if (intensity) {
      const hue = GROUP_HUES[region.group][themeName];
      parts.push(`<path d="${d}" fill="${hue}${alphaHex(Math.min(1, intensity))}"/>`);
    } else {
      parts.push(`<path d="${d}" fill="${t.quiet}"/>`);
    }
  }
  return `<svg width="${w}" height="${sizePx}" viewBox="0 0 200 440">${parts.join('')}</svg>`;
}

// ---------- preview pages ----------
const SCENARIOS = [
  { name: 'Incline Bench Press', hl: { 'Upper Chest': 1, 'Front Delts': 0.4, Triceps: 0.4 } },
  { name: 'Bent-Over Row', hl: { Lats: 1, 'Mid Back': 1, Biceps: 0.4, 'Rear Delts': 0.4 } },
  { name: 'Back Squat', hl: { Quads: 1, Glutes: 0.4, 'Lower Back': 0.4 } },
  { name: 'Romanian Deadlift', hl: { Hamstrings: 1, Glutes: 1, 'Lower Back': 0.4 } },
  { name: 'Lateral Raise', hl: { 'Side Delts': 1, Traps: 0.4 } },
  { name: 'Crunch', hl: { 'Upper Abs': 1, Obliques: 0.4 } },
];

function scenarioCard(sc, themeName, size) {
  const t = THEMES[themeName];
  return `<div class="card" style="background:${t.card}">
    <div class="pair">${figureSvg('front', sc.hl, size, themeName)}${figureSvg('back', sc.hl, size, themeName)}</div>
    <div class="label" style="color:${t.text}">${sc.name}</div>
  </div>`;
}

function atlas(themeName, size) {
  const t = THEMES[themeName];
  let cells = '';
  for (const view of ['front', 'back']) {
    for (const key of Object.keys(VIEWS[view])) {
      cells += `<div class="cell" style="background:${t.card}">
        ${figureSvg(view, { [key]: 1 }, size, themeName)}
        <div class="small" style="color:${t.subtext}">${key}<br/>(${view})</div>
      </div>`;
    }
  }
  return cells;
}

function rowStrip(themeName) {
  const t = THEMES[themeName];
  return SCENARIOS.map(
    (sc) => `<div class="rowitem" style="background:${t.card}">
      ${figureSvg(Object.keys(sc.hl).some((k) => BACK[k] && !FRONT[k]) ? 'back' : 'front', sc.hl, 44, themeName)}
      <span style="color:${t.text}">${sc.name}</span>
    </div>`
  ).join('');
}

function themeSection(themeName) {
  const t = THEMES[themeName];
  return `
  <section style="background:${t.pageBg}">
    <h2 style="color:${t.text}">${themeName.toUpperCase()} — scenarios @200px (front + back)</h2>
    <div class="grid">${SCENARIOS.map((sc) => scenarioCard(sc, themeName, 200)).join('')}</div>
    <h2 style="color:${t.text}">Row size @44px</h2>
    <div class="rows">${rowStrip(themeName)}</div>
    <h2 style="color:${t.text}">Region atlas @150px</h2>
    <div class="grid">${atlas(themeName, 150)}</div>
  </section>`;
}

const html = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  section { padding: 20px 24px 36px; }
  h2 { font-size: 14px; font-weight: 600; margin: 18px 0 10px; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .card { border-radius: 14px; padding: 12px 16px 8px; }
  .pair { display: flex; gap: 6px; }
  .label { font-size: 12px; text-align: center; margin-top: 6px; }
  .cell { border-radius: 12px; padding: 8px 10px 4px; text-align: center; }
  .small { font-size: 10px; margin-top: 4px; }
  .rows { display: flex; flex-direction: column; gap: 6px; max-width: 420px; }
  .rowitem { display: flex; align-items: center; gap: 12px; border-radius: 12px; padding: 6px 12px; font-size: 13px; }
</style>
${themeSection('dark')}
${themeSection('light')}
`;

// Zoomed inspection page: big figures, quiet-state anatomy, overlap stress.
const detailHtml = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; font-family: system-ui, sans-serif; display: flex; }
  .half { padding: 20px 24px; }
  .pair { display: flex; gap: 16px; }
  h3 { font-size: 13px; margin: 12px 0 6px; }
</style>
${['dark', 'light']
  .map((tn) => {
    const t = THEMES[tn];
    return `<div class="half" style="background:${t.pageBg}">
      <h3 style="color:${t.text}">${tn} — quiet</h3>
      <div class="pair">${figureSvg('front', {}, 420, tn)}${figureSvg('back', {}, 420, tn)}</div>
      <h3 style="color:${t.text}">${tn} — Incline Bench / Bent-Over Row</h3>
      <div class="pair">
        ${figureSvg('front', SCENARIOS[0].hl, 420, tn)}
        ${figureSvg('back', SCENARIOS[1].hl, 420, tn)}
      </div>
      <h3 style="color:${t.text}">${tn} — overlap stress (all regions @0.5)</h3>
      <div class="pair">
        ${figureSvg('front', Object.fromEntries(Object.keys(FRONT).map((k) => [k, 0.5])), 420, tn)}
        ${figureSvg('back', Object.fromEntries(Object.keys(BACK).map((k) => [k, 0.5])), 420, tn)}
      </div>
    </div>`;
  })
  .join('')}
`;

fs.writeFileSync(path.join(__dirname, 'preview.html'), html);
fs.writeFileSync(path.join(__dirname, 'detail.html'), detailHtml);
fs.writeFileSync(
  path.join(__dirname, '..', '..', 'src', 'components', 'bodymap', 'bodyMapPaths.ts'),
  emitTs()
);
console.log('wrote preview.html, detail.html and src/components/bodymap/bodyMapPaths.ts');
