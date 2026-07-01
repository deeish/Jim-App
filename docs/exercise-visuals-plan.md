# Exercise Visuals Without Licensed Assets

**Problem:** the exercises library has no imagery, and every "free" exercise
photo/GIF database is either commercially restricted (NC / SA / API-tier
terms) or outdated. The catalog itself (5000+ exercises) is Claude-generated
text we fully own, with `primaryMuscleGroup`, `subMuscles`,
`secondaryMuscleGroups`, and `equipment` on every row.

**Strategy:** don't acquire 5000 assets — generate the visual layer from the
metadata we already own. Photos are also the *least* scannable option at
row size (~40px); data-driven color and muscle diagrams (the Fitbod pattern)
scan better and carry zero licensing risk. Two owned layers plus optional
garnish:

---

## Layer 1 — muscle-group color + icon discs (ship first; ~half a day)

Each result row gets a leading disc: background tinted by primary muscle
group, glyph from icon fonts already bundled with the app. Detail screen
title section reuses the same color as an accent.

**Licensing:** `@expo/vector-icons` (Ionicons, MaterialCommunityIcons) is
already a dependency and used in `ProfileAvatarDisc.tsx`; the fonts are
MIT/Apache/OFL — free for commercial use, no attribution required in-app.

**Spec — `frontend/src/constants/muscleGroupMeta.ts` (new):**

```ts
/** Hue + glyph per primary muscle group. Tint backgrounds with + '20'/'30'
 *  alpha like the existing chip styles so it works in dark and light. */
export const MUSCLE_GROUP_META: Record<string, { color: string; icon: string }> = {
  Chest:     { color: '#E05B5B', icon: 'weight-lifter' },
  Back:      { color: '#4A7BD0', icon: 'rowing' },
  Shoulders: { color: '#E0913F', icon: 'dumbbell' },
  Arms:      { color: '#8B5CF6', icon: 'arm-flex' },
  Legs:      { color: '#3FA968', icon: 'run-fast' },
  Core:      { color: '#D9B13B', icon: 'yoga' },
  Cardio:    { color: '#3BB8C4', icon: 'run' },
};
export const MUSCLE_GROUP_FALLBACK = { color: '#8A8A8E', icon: 'dumbbell' };
```

- Glyph names are MaterialCommunityIcons candidates — **verify each against
  `MaterialCommunityIcons.glyphMap` at implementation time** and swap any
  missing one; `dumbbell` is the safe fallback.
- Keys must match the API's `primaryMuscleGroup` values (same seven as
  `MUSCLE_HIERARCHY` in `SearchScreen.tsx`).
- Colors are suggestions; sanity-check contrast on both themes and against
  `colors.primary` (tan) so the discs don't fight the brand color.

**Integration:**
- `ExerciseGroupCard.tsx`: 36px disc left of the title column — background
  `meta.color + '25'`, icon `meta.color`, borderRadius 18. Rows stay compact
  (disc height < current 2-line row height).
- `ExerciseDetailScreen.tsx`: reuse the color as the title-section accent
  (e.g. left border or difficulty-badge tint), same disc at larger size.
- Optional: tint each muscle chip's selected state with its group color
  instead of uniform primary — try it, revert if it looks noisy.

**Verify:** browse list shows distinct colors per group at a glance; Chest vs
Back vs Legs distinguishable without reading; dark + light themes; add-to-plan
rows unaffected (disc + checkmark coexist).

## Layer 2 — body-highlight diagram, one owned asset (the differentiator; 1–2 days)

One front + one back human silhouette with ~20 muscle regions as separate
vector paths. Highlight regions from exercise data: primary muscle at full
intensity, secondaries dimmed. Two assets cover the entire catalog forever.

**Rendering:** Skia (`@shopify/react-native-skia` 2.2.12 already installed
for JimLogo — do NOT add react-native-svg). Regions are Skia `Path` objects
filled per-highlight; silhouette outline drawn once.

**Tasks:**
1. **Asset:** draft the two silhouettes + region path data (Claude can
   generate the initial SVG path set; iterate visually until clean). Regions
   needed, mapped from the existing sub-muscle vocabulary: upper/mid/lower
   chest; lats, traps, upper/mid/lower back; front/side/rear delts; biceps,
   triceps, forearms; quads, hamstrings, glutes, calves, inner/outer thighs;
   upper/lower abs, obliques. Store as
   `frontend/src/components/bodymap/bodyMapPaths.ts` (typed path strings —
   it's code we own, no binary assets).
2. **Component:** `MuscleBodyMap` — props `{ highlights: Array<{ region:
   string; intensity: number }>, view: 'front' | 'back' | 'auto', size }`.
   `auto` picks the view containing the primary region (back view for lats,
   traps, rear delts, hamstrings, glutes, calves; front otherwise).
3. **Mapping util:** `exerciseToHighlights(exercise)` — primary muscle group
   + subMuscles → regions at 1.0; `secondaryMuscleGroups` → their default
   regions at 0.4. Muscle-name → region-key map lives beside the paths; names
   must match the catalog vocabulary (same strings as `MUSCLE_HIERARCHY`).
4. **Integrate on the DETAIL screen first** (hero: front/back pair side by
   side above Target Muscles). Do NOT put per-row body maps in the 300-row
   list until profiled — rows keep the Layer-1 disc, which is cheap.
5. **Reuse later:** workout summary "muscles worked", plan preview weekly
   muscle balance. This is why the asset is worth building properly.

**Verify:** for "Incline Barbell Bench Press": front view, upper chest full
intensity, front delts + triceps dimmed. For "Barbell Bent-Over Row": back
view, lats/mid-back full, biceps dimmed. Renders correctly in both themes at
detail-hero size and at 64px.

## Layer 3 — optional garnish (only after 1–2)

- **YouTube thumbnail on the detail screen** where `youtubeId` exists (the
  plumbing already flows backend `exercise-videos.json` → `Exercise.youtubeId`).
  Render `https://img.youtube.com/vi/<id>/mqdefault.jpg` as the tap target
  that opens THAT video — thumbnail-as-link is the ToS-aligned use. Keep the
  current search-based "Watch demo" as fallback when there's no id. Never use
  YT thumbnails as list imagery detached from the link.
- **AI-generated line art for the top ~100–200 exercises only**, ranked by
  the existing `getCommonExerciseRank`
  (`backend/src/data/common-exercise-ids.ts`). One consistent minimal
  monoline style, every image human-reviewed before shipping. Commercially
  safe with a commercially-licensed image model; the real risk is accuracy —
  a wrong-form illustration is worse than none, which is exactly why
  generating all 5000 unreviewed is off the table. Line art hides anatomy
  errors far better than photorealism. Treat as a progressive enhancement on
  top of Layer 1 discs (image if present, disc otherwise).

## What NOT to do

- Scrape images from web/YouTube search results (infringement).
- Ship CC-BY-SA databases (wger, everkinetic) without accepting attribution +
  share-alike on modified images — legally workable but aesthetically dated,
  and their ~800 images still leave 4000+ exercises blank, so Layers 1–2 are
  needed anyway.
- Pay for "exercise GIF APIs" with murky redistribution terms.
- Generate 5000 photorealistic exercise images unreviewed (form-accuracy /
  safety / brand damage).

---

**Order:** Layer 1 (half day, immediate visible win) → Layer 2 asset +
detail-screen hero (1–2 days) → Layer 3 only if it still feels needed.
Everything here is frontend-only except reading the existing
`common-exercise-ids` ranking.
