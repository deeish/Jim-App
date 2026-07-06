# Exercises Page — Round 3: Muscle Body-Map (the visual ceiling)

> **Supersedes the round-2 content of this file** (2026-07-02). Round 2 shipped
> in full on `feat/exercises-ux` (stale-response guard, equipment summary chip
> + all-selected normalization, capped chip searches, More-filters merge,
> inline refine row, dimmed-chips-while-searching, error Retry), followed by
> the visuals Layer 1: muscle-group color discs on rows + detail screen
> (`muscleGroupMeta.ts`, `MuscleGroupDisc.tsx`, commits `48660a5`…`bb4957f`).
> The old round-2 text lives in git history if ever needed.

## Status (2026-07-06)

Steps 1–5 IMPLEMENTED on `feat/exercises-ux` (commits `ce36f38`, `39e568d`,
`520d56e`): asset generated + iterated in the harness (checked in as
`frontend/tools/bodymap/gen.js` — edit points there, re-run, never hand-edit
`bodyMapPaths.ts`), sanity + mapping tests green (156 frontend tests),
detail-screen hero live. Step 6 (row swap) remains gated on Android scroll
profiling. On-device look of the hero still pending (fold into the round-2
walkthrough below).

## Carry-over items (still open, do not lose)

1. **Release-order rule:** deploy the backend BEFORE any frontend build / OTA
   update. The new frontend sends `limit` on search requests and the deployed
   old backend rejects unknown properties with 400 (`forbidNonWhitelisted` in
   `backend/src/main.ts`). New backend + old frontend is safe; the reverse is
   not. When testing on device, run the branch backend locally and point
   `EXPO_PUBLIC_API_BASE` at it.
2. **On-device acceptance walkthrough** (dark + light), not yet run:
   fresh all-gear user browse → narrow → refine; home-gym user's
   `My equipment · N` chip / × / Reset cycle; search-overrides-chips dimming;
   add-to-plan roundtrip incl. Android hardware back; airplane-mode error →
   Retry.
3. **PR 5 (filter bottom sheet):** still deferred; re-justify against the
   fresh-user journey after living with the merged More-filters row. Likely
   mooted.

---

## Why a body-map

The discs made the list scannable by hue, but every row in one muscle group is
visually identical — the glyph repeats, so it reads as decoration on a
single-group list. The best-in-class pattern (Fitbod) is a small human
silhouette per exercise with the target region glowing: incline press lights
the upper chest, pulldown lights the lats. That is *information*, not
decoration — it varies meaningfully per row, it teaches anatomy passively, and
it is unmistakably "exercise library".

We can build it because the catalog already carries the data on every row:
`primaryMuscleGroup`, `subMuscles`, `secondaryMuscleGroups` — the same
vocabulary as `MUSCLE_HIERARCHY` in `SearchScreen.tsx`. Two owned vector
silhouettes cover all 5000+ exercises forever. Zero licensing risk (this was
Layer 2 of the original visuals strategy; photos/GIF databases stay ruled
out — commercially restricted, and illegible at row size anyway).

**Design bar (Dylan):** this must look premium — clean minimal silhouette,
crisp region edges, brand-consistent. No clip-art anatomy, no gradients-happy
medical-poster look. Iterate on the asset until it is genuinely nice; the
component work is easy, the asset quality is the whole game.

## Architecture

### 1. The asset — `frontend/src/components/bodymap/bodyMapPaths.ts`

One front + one back silhouette, each with muscle regions as separate vector
paths. Stored as **typed SVG path strings in code** (no binary assets, fully
owned, diffable). Skia parses them via `Skia.Path.MakeFromSVGString`.

Region keys, mapped 1:1 from the existing sub-muscle vocabulary (must match
the catalog strings — same as `MUSCLE_HIERARCHY`):

| View  | Regions |
|-------|---------|
| Front | Upper Chest, Mid Chest, Lower Chest, Front Delts, Side Delts, Biceps, Forearms (front), Upper Abs, Lower Abs, Obliques, Quads, Inner Thighs, Calves (front/tibialis) |
| Back  | Traps, Upper Back, Mid Back, Lower Back, Lats, Rear Delts, Rotator Cuff, Triceps, Forearms (back), Glutes, Hamstrings, Outer Thighs, Calves |

Shared canvas coordinate space (e.g. 0 0 200 440 viewBox) for both views so
one transform scales everywhere. Silhouette outline is its own path drawn
under the regions.

**Production workflow for the paths (the risky part — time-box it):**

1. Draft the two silhouettes + regions as an HTML/SVG preview page first
   (browser iteration is 10× faster than reloading the app). Claude generates
   the initial path set; iterate visually until the outline is clean and the
   regions tile the body without gaps/overlaps at 48px AND at 200px.
2. Only when the SVG preview looks premium, port the strings into
   `bodyMapPaths.ts` with a `Record<RegionKey, string>` per view plus the two
   outline paths.
3. Sanity test (`bodyMapPaths.test.ts`, co-located per repo convention): every
   region key referenced by the mapping exists in the path set; every
   sub-muscle in `MUSCLE_HIERARCHY` resolves to ≥1 region; paths parse
   (non-empty, valid commands — parse with a tiny SVG-path tokenizer, no new
   dependency).

### 2. The component — `frontend/src/components/bodymap/MuscleBodyMap.tsx`

Skia only (`@shopify/react-native-skia` is already installed for JimLogo — do
NOT add `react-native-svg`).

```ts
type Highlight = { region: RegionKey; intensity: number }; // 1.0 primary, 0.4 secondary
type Props = {
  highlights: Highlight[];
  view: 'front' | 'back' | 'auto';   // auto picks the view containing the strongest highlight
  size: number;                       // rendered height; width derives from viewBox ratio
};
```

- `auto` view rule: back view when the top-intensity region ∈ {Lats, Traps,
  Upper/Mid/Lower Back, Rear Delts, Rotator Cuff, Hamstrings, Glutes, Outer
  Thighs, Calves}; front otherwise.
- Rendering: silhouette fill in a theme-aware base (a step above `surface`;
  pick per theme, not hardcoded), regions filled with the muscle-group hue
  from `muscleGroupMeta` at `intensity` alpha, outline stroked hairline in
  `border`. Highlighted regions get the full hue; everything else stays quiet.
- Parse each path string once at module load (or memoized), never per frame.

### 3. The mapping — `frontend/src/lib/exerciseToHighlights.ts`

Pure function, co-located tests (this is the repo's tested-logic layer):

```ts
exerciseToHighlights(exercise): { highlights: Highlight[]; view: 'front' | 'back' }
```

- `subMuscles` present → those regions at 1.0.
- No usable subMuscles → ALL regions of `primaryMuscleGroup` at 1.0 (whole
  group glows softly — still informative).
- `secondaryMuscleGroups` → their default region sets at 0.4.
- Muscle-name → region-key map lives beside the paths; unknown names are
  skipped silently (catalog typos must never crash a row).
- **Cardio and no-match rows return null** → caller keeps rendering the
  existing `MuscleGroupDisc` (heart-pulse disc). The disc is the permanent
  fallback, not deleted.

Test cases to pin: Incline Barbell Bench Press → front, Upper Chest 1.0,
Front Delts + Triceps 0.4; Barbell Bent-Over Row → back, Lats/Mid Back 1.0,
Biceps 0.4; Plank → front, abs regions; Treadmill Run (Cardio) → null.

### 4. Integration order (detail screen FIRST, rows gated on profiling)

1. **Detail screen hero:** front + back pair side by side (~180px tall) above
   Target Muscles, replacing nothing — the tags stay. Big canvas, easiest
   place to judge asset quality, ships value even if rows never get maps.
2. **Rows:** swap `MuscleGroupDisc` for a 44px `MuscleBodyMap` in
   `ExerciseGroupCard` **only after profiling**. The FlatList mounts ~10 rows
   (windowSize 7), so ~10 concurrent small canvases — expected fine, but
   verify scroll smoothness on a real Android device with a broad filter. If
   it janks: rasterize via `makeImageSnapshot` into a memoized image cache
   keyed by `(view, highlight set, theme)` — the distinct combination count is
   small (dozens, not thousands) — or keep discs on rows permanently. Either
   outcome is acceptable; the hero + reuse below justify the asset alone.
3. **Reuse (later, separate work):** workout summary "muscles worked" heat
   view; plan preview weekly muscle balance. This reuse is why the asset is
   worth building properly.

### 5. Files touched

- NEW `frontend/src/components/bodymap/bodyMapPaths.ts` (+ test)
- NEW `frontend/src/components/bodymap/MuscleBodyMap.tsx`
- NEW `frontend/src/lib/exerciseToHighlights.ts` (+ test)
- `frontend/src/screens/ExerciseDetailScreen.tsx` (hero)
- `frontend/src/components/ExerciseGroupCard.tsx` (row swap, step 2 only)
- `frontend/src/constants/muscleGroupMeta.ts` (export the hue for a given
  group without the icon, if not already clean)

Frontend-only; no API or schema changes. OTA-shippable.

## Verification

- **Asset:** silhouettes look premium at 44px and 200px, both themes; no
  region gaps/overlaps; front/back proportions match.
- **Mapping tests green** (cases above) + sanity test that vocabulary and
  paths stay in sync.
- **Detail hero:** Incline Bench → front view upper-chest glow; Bent-Over
  Row → back view lat glow; Squat → front quads + 0.4 glutes visible on back
  thumbnail; Cardio exercise → no map, disc layout unchanged.
- **Rows (if enabled):** broad filter (Legs, 300 rows) scrolls at 60fps on a
  real Android device; add-to-plan selection UI unaffected; Saved tab
  renders the same rows.
- **Fallbacks:** exercise with unknown/missing subMuscles shows whole-group
  glow; malformed catalog strings never blank a row (disc fallback).

## Sequencing & estimates

| Step | What | Est. |
|------|------|------|
| 1 | SVG preview harness → iterate silhouette + regions to premium | 0.5–1 day (time-box; the gate for everything else) |
| 2 | Port to `bodyMapPaths.ts` + sanity tests | 1–2 h |
| 3 | `MuscleBodyMap` component (Skia, themes, sizes) | 2–3 h |
| 4 | `exerciseToHighlights` + tests | 1–2 h |
| 5 | Detail-screen hero + on-device look | 1–2 h |
| 6 | Android profiling → row swap OR rasterize OR keep discs | 2–4 h |

If Step 1 can't reach the quality bar inside its time-box, stop: keep the
disc system (already good), and revisit with a commissioned one-off SVG from
a designer — the rest of this plan is unchanged by where the paths come from.

## What NOT to do

- No `react-native-svg` (Skia is already in the bundle; two renderers = bloat).
- No per-row canvases before the Android profile says yes.
- No photos/GIFs/scraped imagery, no CC-BY-SA image packs (licensing traps,
  dated look, and still-incomplete coverage — unchanged from the original
  visuals plan).
- No deleting `MuscleGroupDisc` — it is the permanent fallback (Cardio,
  unknown groups, perf fallback) and stays on any surface the map doesn't
  reach.
- Don't ship rows and hero in one commit; hero first, rows behind the
  profiling gate, per the commit-hygiene convention.
