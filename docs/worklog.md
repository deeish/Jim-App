# Work log

Running record of what Claude Code worked on, per session. **Newest session at the top.**

Purpose: so Dylan can see what happened without reading a transcript, and so a later
session can summarise the work without re-deriving it.

**Status tokens** — `DONE` shipped and verified · `OPEN` real work not started ·
`NEEDS-DYLAN` blocked on a product call or a device check · `WONTFIX` decided against.

**Rules for whoever appends here**
- One row per task. Name the commit so the diff is one command away.
- Record what was **deliberately not done**, and why. That is the half that gets lost.
- Never mark `DONE` without saying how it was verified.

---

## 2026-09-23 — Muscles section on the Exercises tab (zoom + tap-to-name on the v2 figure)

Decided through four artifacts (explorer v2 + three placements); Dylan picked the third-segment placement with words only ("Muscles", no glyph), plain names first, readout-aware framing, a tighter peek sheet, and a dismissible first-visit hint. Built and verified on the web rig (frontend-only boot, seeded session) in dark and light.

| # | Task | Status | Where | Notes |
|---|------|--------|-------|-------|
| 1 | Plain-name table | `DONE` | `src/components/bodymap/bodyMapNames.ts` (+ test) | 43 distinct regions: plain name (header), anatomical (under), optional hint for the three with no everyday name (brachialis, sartorius, gracilis). `describeRegion` also yields the catalog sub-muscle + the filter-facing group label; `siblingRegionKeys` = the other heads of the same muscle. Test asserts every figure region has a name and no name is orphaned. |
| 2 | Camera math | `DONE` | `src/components/bodymap/muscleExplorerCamera.ts` (+ test) | Pure + worklet-safe: aspect-fit metrics, clamp (1x–4x, figure always covers the viewbox), pixel→viewbox→local, zoom-about-point, pan, `visibleWindow` (stage minus the sheet), `frameBounds` (fits both mirrored halves into the uncovered window), `composeCamera` (base + pan + pinch with per-gesture offsets so one gesture can commit while the other runs), bounds prefilter for hit-tests. |
| 3 | Explorer | `DONE` | `MuscleExplorer.tsx` (shell) + `MuscleExplorerFigure.tsx` (Skia) / `.web.tsx` (svg) + `muscleExplorerFigureProps.ts` | RNGH `Race(tap, Simultaneous(pan, pinch))`; camera = Reanimated shared values on the UI thread, React renders only on selection. Tap → hit-test with the real region path (Skia `path.contains`; web `isPointInFill` via a real SVGPoint — older Chromium rejects DOMPointInit) after undoing the camera → 340 ms ease-out frame into the area the sheet leaves uncovered. Tap the same muscle, or the body outside any muscle, or Reset → zoom out. Sheet: dot + plain name + "Quads · Legs" pill, anatomical in italics (+ hint), sibling chips, compact "Exercises for Quads" (the app Button was too tall for the peek row). Front/Back live on the figure. Bottom copy: "Tap a muscle to see what it's called and the exercises that train it". No double-tap gesture on purpose (would delay single taps ~300 ms). |
| 4 | Exercises tab wiring | `DONE` | `src/screens/SearchScreen.tsx` | Third segment "Muscles" (All · Saved · Muscles). Mounted only while shown, so every visit starts at the whole body. "Exercises for X" → `subMuscles: [X]` + its parent group (as the chips would), search text cleared, All tab, list to top — verified: badge 2, "Back ✕ / Lats ✕" tokens, "Back · narrowed to 1 of 5". Android back from Muscles/Saved → All. The 24 catalog sub-muscle names on the figure already match the filter vocabulary, so this needed no retag. |
| 5 | First-visit hint | `DONE` | `src/components/MusclesHintBanner.tsx`, `src/lib/musclesHintStore.ts` | One line under the search field via the library's `headerSlot`: "New: tap Muscles to browse the body" with a two-shape pictogram (a 9-pt anatomy figure in the segment was rejected: mud). Starts hidden, shows only when `jim_muscles_hint_seen_v1` is unset, gone for good on × or on the first Muscles open. |

Second pass (Dylan: "double check ... no edge cases were missed"): code review found two — the sheet went blank the instant a muscle was deselected (content vanished mid-slide) and, because the empty sheet is only the grab handle tall, the first framing under-estimated how much it covers; fixed by keeping the last description rendered while the sheet slides away and using the estimate until the sheet has been measured with content. `pointerEvents` moved from prop to style (RN deprecation). A 19-check rig drive then passed: hint × + persistence across reload, tap-same and tap-bare-body zoom out, Reset, detail-only sheet (Sartorius), Front/Back switch while zoomed resets, drag-pan keeps the selection, Saved round-trip remounts at the whole body, wide 800×500 stage frames correctly.

Deliberately NOT done: double-tap-to-reset (delays single taps); the exercise-detail body-map tile tapping through to the section (strongest entry point, next); What's New card at the next binary; catalog retag to finer heads (additive field, batch by batch — nothing blocks on it, everything works at sub-muscle level). Not verifiable on web: Skia rendering, native gesture feel, haptics — first phone check list: pinch smoothness, sheet height on a real safe area, the Reset pill over the floating tab bar.

## 2026-09-22 — Body map v2: a real anatomy figure (50 named regions) replaces the 26-blob silhouette

Dylan's next feature after the 1.5.0 push is the body map (issues #42/#43/#44:
zoomable figure, "what did I hit / what should be / what is sore"). Research
first (open-source libs, stock, AI, 3D — all weighed; 3D advised against), then
the art: the app already had a generated 26-region figure, so this session
replaced its artwork rather than the feature. Silhouette from a Nano Banana
generation inside Dylan's Recraft trial (picked by Dylan), muscle geometry
from a purchased Etsy bundle (Create4decor, 50 muscles, licence names fitness
apps), everything warped onto our figure by a new build pipeline. Neutral
athletic look kept on purpose; the seller's bodybuilder body was rejected.

Verified: `bodyMapPaths` / `bodyMapFigure` / `exerciseToHighlights` suites
40/40 green, frontend `tsc` clean, full jest run (see the last row). Preview
page `frontend/tools/bodymap/preview2.html` (gitignored) shows all regions,
the quiet figure in both themes, six exercise scenarios and the 44px tiles.
NOT on a phone yet. NOT committed (Dylan reviews the preview first).

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | Research + recommendation | `DONE` | chat only | Libraries (react-native-body-highlighter, MuscleMap MIT), stock (Etsy/Adobe/Vecteezy/iStock licences), AI vector (Recraft), 3D (Z-Anatomy CC BY-SA + Filament). Verdict: 2D, own pipeline, Etsy shapes for anatomy, AI-generated silhouette for the body; 360° rotation advised against (no data to show, native module + binary, fights the flat look). |
| 2 | Purchased bundle audited | `DONE` | `frontend/tools/bodymap/source/` (gitignored, licence forbids redistributing raw files) | 50 muscles, one closed shape per muscle, left/right separate, shared 432×648 frame. Catch: every separate file is exported with its OWN artboard offset, and the standalone "Body outline" file is offset from all of them, so the full-frame files (which carry their own white body silhouette) are the warp source, per file. |
| 3 | Silhouette traced | `DONE` | `tools/bodymap/trace.js` → `traced.json` (gitignored) | Moore boundary trace of the Recraft PNG, RDP simplify, keep the LEFT half, mirror: symmetric by construction, fitted to the 200×440 viewbox. |
| 4 | Silhouette tuned | `DONE` | `tools/bodymap/build.js` `tuneSilhouette` | Feet straightened (lateral toe −30 %), trap slope softened 25 %, legs +3 %, hands −12 %. One outline for both views (the AI's back figure differed slightly; a flip between two outlines would jump). |
| 5 | Muscle warp | `DONE` | `build.js` (landmarks, canonical limb slots, row-interval x-map) | Per file: rasterize the white body → solid mask → landmark rows (neck, shoulder by extent growth, armpit by arm/torso gap, crotch, fingertips, knee/ankle by fraction) → piecewise-linear y-map; per row the ink intervals are merged to canonical slots (1 / 3 / 4 / 2) and index-matched, with arm slots synthesized where the arm is still fused to the torso. Each blob: boundary → warp → simplify → size-relative inset (the channel) → smooth → mirror. |
| 6 | Splits the bundle lacks | `DONE` | `build.js` `cutBlob` | Pec cut into clavicular / sternal / costal (tilted bands); front delt cut medial/lateral, rear delt likewise. |
| 7 | Asset v2 | `DONE` | `src/components/bodymap/bodyMapPaths.ts` (generated, ~90 KB) | 27 front + 26 back regions. Pass three after Dylan's second look: head-top and crotch are hard corners in the mirrored outline (the spline hairpin left a pinhole at the crotch), sartorius dropped (criss-crossed the groin, detail-only anyway), leg muscles map with the torso split at the axis so shapes stay continuous across the hip (no more lighter X of overlaps on the thighs), SCM half as wide and lower, lower-abs cut at 92 %. Pass four: a morphological close (r=4 at 4x) inside each muscle file seals the seller's white highlight seams (the glute max read as two muscles), with a universal ±3px cut at the axis so pairs never bridge; tile window side forced even so it centres exactly. Pass five (after a fresh-agent review said NO): the neck landmark search had been starting at the crown (x=100 beats everything), so pass one's trap softening had actually dragged the HEAD toward the shoulder line — the reviewer's "helmet"; rewritten around ear / neck / trap-start landmarks: head scaled to ~8 heads about the neck point, rounded jaw cubic, nub removed, neck compressed to half a head, kinks smoothed; back redrawn in OUR frame with raster booleans — one lat fan per side (apex at the armpit, medial edge down the spine, lower edge on the iliac crest), a vertical erector pair (sub Lower Back), neighbours subtracted so nothing overlaps; bundle lat / thoracolumbar / back obliques / back serratus dropped; SCM dropped; abs union closed at r=12 (row-3 chips gone). Pass six (second fresh review: no blockers, "one short pass away"): `drawRegions(view, specs, neighbours)` generalises the in-frame drawing — lat fan now tucks under the teres major and meets the erectors; rectus drawn as 3 rows of rounded blocks + a tapering lower pair; front obliques one strip from ribs to iliac crest; hamstrings two diverging strips (never cross); crown no longer a hard corner (symmetry keeps the tangent flat); clavicular pec 35 %; slivers under 8 units² dropped; teres major inset 0.3. Bundle rectus / front obliques / biceps femoris / semitendinosus dropped. Held back on purpose (Dylan): neck length, hands, light-theme quiet contrast, thigh busyness. Pass seven (third fresh review: torso passes, limbs do not; Dylan: fix the limbs + redo the abs, no more agent reviews, self-check until satisfied): every limb and core region is now exact geometry from our landmarks (`emitDirect` / `strip` / `roundCorners` in build.js 4c) — fusiform rectus femoris with VL hugging it, VMO teardrop, adductor wedge ending at the VMO, TFL cap, fusiform biceps / triceps, one forearm mass per view, tibialis; abs = 3 rows of rounded blocks + tapering lower pair, obliques tapered rib-to-crest; lower-trap diamond split into Upper Back / Mid Back (rhomboid needle dropped); brachialis, front triceps heads, front serratus, both peroneals, front gastroc, gracilis dropped (all needles); crown = circular arc; FOUND + FIXED a slot-merge bug (finger gaps made the two legs merge into one slot below the crotch — every thigh strip spanned the body) and neighbour masks are dilated before subtraction. `tools/bodymap/check.js` = mechanical gate (overlap / spill / symmetry / holes / slivers): front 0 overlap, back 17px at 4x. Pass eight (Dylan: "we lost every bit of detail, simple geometric shapes" — one more chance): the bundle's ORGANIC shapes are back on every limb (quads incl. sartorius, adductors, TFL, hamstrings, gracilis, biceps, triceps, forearms, gastroc front) through the now-correct slot logic, and they no longer cross or fragment; kept from the drawn passes only the lat fan, erectors, abs blocks, tibialis (now fusiform) and the head. Local repairs instead of replacements: enclosed holes filled per muscle (the triceps tendon lens closed at r=26), the bundle serratus fingers closed into the flank strip and labelled Obliques (the bundle oblique was only a hip oval), five needle slivers dropped (brachialis, front triceps heads, front wrist flexors, both peroneals). Gate: front 0 overlap / 0 spill, back 11px. Artifact v8 shows A (organic) beside B (pass-seven geometric). Pass nine (Dylan: abs lazy + too much room below, biceps/triceps blobs, "2nd build looked better"): abs from the bundle again — FOUND the real cause of every abs problem: the seller's "Rectus Abdominus" file reddens only rows 1-2 and "_lower" only the bottom pair, row 3 is in NEITHER; so the rectus now comes from `Full_body_muscles.svg` (all four rows red) clipped to the two partial files' extent (`clipTo`), split Upper/Lower where the first file ends → three organic cell rows + lower pair to the pubis; back triceps split into long / lateral heads along the tendon gap (`lensLine` = whatever a r=26 close fills in, PCA cut); brachialis + both front triceps heads restored (minArea 2). Artifact v9 = A (new) beside B (pass eight). Pass ten (Dylan: yes to both): biceps split into long (lateral 55 %) / short heads along its own long axis (`axisCut`, PCA + quantile — the art has no seam, this line is ours), linea alba cut ±1px so the midline channel matches the row gaps. Pass-nine snapshot kept in the scratchpad (`built_pass9.json`, `build_pass9.js`). Artifact v10 = A (pass ten) beside B (pass nine). Legs/lower body: Dylan evaluates next. Pass eleven (legs, Dylan: all three): lower rectus pair stretched 8 units toward the pubis (path-level y scale of the lower-pair subpaths only), sartorius inset 1.8 (a ribbon, not a strap), back soleus drawn from the silhouette under the gastroc heads (raster-subtracted, starts at 26 % of the calf so no spikes beside the heads, narrows into the Achilles). Snapshots pass 9/10/11 in `tools/bodymap/snapshots/` (gitignored). Artifact v11 = A (pass eleven) beside B (pass ten). Pass twelve (morning deep inspection of the accepted figure, Dylan: gently fix the three cosmetic notes): tibialis anterior origin narrowed (half-width 0.045+0.12·belly instead of 0.08+0.09·belly) so the top domes instead of a flat plate, belly and lower end unchanged; back soleus gets a morphological opening (`open: 4` in `drawRegions`, erode+dilate 1 unit) so the notch under the gastroc heads loses its hair-thin horns; brachialis inset 0.3 → 0 (sliver flag gone, still no overlap). Diff against the pass-11 snapshot: exactly those three regions, outline byte-identical; gate front 0/0, back 11px (glute max × erectors, sub-pixel), 40/40 tests, tsc clean. Snapshot pass 12 saved. Artifact v12 = A (pass twelve) beside B (pass eleven). Pass thirteen (Dylan asked for a re-check of everything still drawn from geometry — lats, erectors, back soleus, tibialis — then: taper the tibialis, adjust the lat lower edge): tibialis belly moved to the upper third with the lower end tapering to the tendon (piecewise sine, same half-width at both ends); lat lower edge is now a visible sweep — lateral end raised to C − 0.55 span (above the glute med line that used to clip it flat), lower edge a quarter-sine from a rounded lateral corner down to the lowest point beside the erectors at C − 0.45 span. Only Tibialis Anterior + Lats differ from pass 12; gate unchanged (front 0/0, back 11px), 40/40, tsc clean. Snapshot pass 13 saved. Artifact v13 = A (pass thirteen) beside B (pass eleven, the accepted build). Pass fourteen (Dylan: the lower back slightly overlaps the glute max): the gate's 11px was exactly that — the erector tip rode along the glute max's top edge (0.8 units², measured at 16x). Root cause: the mask has its channel, but `closedPath` (Catmull-Rom, s=1) overshoots at a sharp wedge tip; an `open: 2` did nothing (tip wider than 1 unit at mask level), `open: 6` blunts the wedge so the curve cannot creep → back overlap 0px, both gates now 0/0. Only Erector Spinae changed (x 90..110 → 91..109). Snapshot 14. Artifact v14 = A (fourteen) beside B (eleven). (Pass two after Dylan asked for a brutally honest review: pec heads fan-cut from the arm insertion, rectus rebuilt as a six-pack column pair from BOTH rectus files aligned by their body extents, tibialis anterior + sternocleidomastoid drawn from our own silhouette rows, size-aware inset so slivers keep their body) keyed by anatomical name with `sub` = catalog sub-muscle (null for detail-only: serratus, sartorius) and `group` for the hue. Old `gen.js` deleted. |
| 8 | App wiring | `DONE` | `bodyMapRegions.ts` (new), `bodyMapFigure.ts`, `exerciseToHighlights.ts`, both tests | Highlights keep naming catalog sub-muscles; a region lights when the name equals its key OR its `sub`. Focus camera: feet snap moved to y=400 (new ankles) and a snap now GROWS the window instead of giving up when it would push anatomy out. |
| — | Deliberately NOT done | | | No zoom/tap UI, no heat-from-logs endpoint, no planned/sore layers, no catalog retag to the finer heads — those are the feature; this session is the figure. No female variant (20 Recraft credits left, enough for one round). No commit and no phone pass until Dylan has judged the preview. Serratus/sartorius carry `sub: null` on purpose (the catalog can't tag them yet). |

---

## 2026-09-15 — Build-32 bugs: the doubled day is fixed; the dark-mode header flash needs a device

Dylan's two reports from build 1.2.0 (32), one at a time (both fixed; both ride the next binary). The doubled day (a
day listing its five exercises, then the same five again in the same order)
was reproduced in the persistence simulation suite and fixed end to end. The
dark-mode header flash was native after all: Dylan's recording showed the
Liquid Glass back pill drawn light because UIKit was never told the app is
dark. Fixed by telling it.

Verified: backend `tsc` clean, lint clean, 64 suites / 872 tests (3 new);
frontend `tsc` clean, 49 suites / 716 tests (4 new). No phone pass.

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | Doubled day — root cause | `DONE` | `planCalendarPrototypeStore.persistence.test.ts` finding 9 | The calendar rebuilt an edited day as TWO requests: add the new slot, then remove the old. When the second was lost (signal drop, backgrounded app) the day held both slots. Worse, the retry then read the doubled day back as "the day" and wrote it into ONE slot for good (Bench, Row, Bench, Row, Fly, Fly). And even a single lost response re-applied the phone's "add Fly" overlay on top of a base that already had it. Both halves are simulated: `it.failing`-style first (the retry produced the six-row slot), then flipped. |
| 2 | Atomic day write | `DONE` | `POST /plans/:id/days/replace`, `plans.service.ts` `replaceDay`, `dto/replace-day.dto.ts`, spec | One transaction: unlink the day's Workout rows, delete the day's slots, create the new one (or none, `slot: null`). Idempotent — the same request lands the same day. The old `slots/add` + `slots/remove` endpoints stay for build 32. ⚠ Deploy BE first (done by the push). |
| 3 | The phone recognises its own landed write | `DONE` | `planCalendarPrototypeStore.ts` `attemptedWrites`, `reconcileLandedWrites` | Before each write the store records the day exactly as sent (exercise ids, in order), persisted. When a fetch arrives whose day matches, the write landed and its response was lost: overlays are cleared as a confirmed write would; an edit made after the attempt is re-expressed against the new base (old base in memory) or carried by identity (cold start, via `baseKeys`/`additionsCount`). Runs before `livePlan` swaps, in both fetch paths. |
| 4 | Already-doubled days on the server | `NEEDS-DYLAN` | `backend/logs/probe-doubled-days.ts` (gitignored) | Read-only probe: twin slots on one day, and single slots holding a doubled list, per account. A prod read is denied to a session in auto mode; run it yourself: `cd backend; DATABASE_URL=... npx ts-node --transpile-only logs/probe-doubled-days.ts`. Fixing found days = a plain "remove exercise" on the phone, or a one-off script after the numbers are known. Nothing self-heals on purpose (a list repeated twice is never intentional, but silently deleting rows is worse). |
| 5 | Dark-mode header flash ("Month/Week/Day" back labels show the light colour) | `DONE` (no phone pass) | `theme/ThemeContext.tsx`, `app.json` | Dylan's recording settled it: the label is fine, the Liquid Glass PILL behind the custom back control renders as light glass during every push/pop/press and then settles dark. UIKit draws that pill in the system interface style, and the app was pinned to Light (`userInterfaceStyle: "light"`), so it never knew about our dark theme. Now `Appearance.setColorScheme(mode)` on iOS whenever the theme changes, and `userInterfaceStyle: "automatic"` so the override takes effect. Also fixes alerts/keyboard/share sheets appearing light on the dark theme. Needs the next binary (Info.plist). ⚠ Verify on the phone: back pill during Week→Day→Week, and a press-and-hold on it. |
| 6 | Pre-build checks for 1.3.0 | `DONE` | `app.json`, `constants/changelog.ts`, `docs/changelog-archive.md`, `package.json` | Version 1.2.0 → 1.3.0: the OTA runtime policy is `appVersion`, and this binary carries native changes since 32 (icon/splash set, the HealthKit module + usage strings, `userInterfaceStyle`), so it must not share a runtime with build 32. One What's New card (id `2026-09-15`): icon + faster launch, Connect Apple Health, the two fixes above, day names without letters; the 2026-08-17 card pruned to the archive (cap of 4). `expo-font` added explicitly (a peer of vector-icons that was only present transitively). `expo-doctor`'s other complaints are old and harmless: the app.config warning is a false positive (it spreads app.json), the date-picker major mismatch dates from April and has built every time. |
| 7 | Live smoke of the day write | `DONE` | web rig (throwaway Postgres + local backend on 3005 + Expo web on 8090, fake session) | Over real HTTP through the Nest validation pipe: a doubled Monday consolidated to one slot, the same request twice left one slot, `slot: null` cleared the day, a bad weekday → 400, another user's plan → 404, the linked Workout rows followed. Then in the browser: Calendar → today → Add Exercise → Cable Crossover → the day showed 3 exercises, still 3 after a reload, and the server held ONE slot with 3 rows; the backend log shows `replaceDay … exercises=3`. Rig notes: the day pager's controls fail Playwright's visibility check (click by coordinates), and the picker's confirm bar sits under the floating tab bar on web (dispatch the click on the element). |
| 8 | Build 1.3.0 → TestFlight (internal) | `DONE` (34 queued) | EAS builds `361afc3d` (33, failed) and `b0fc6649` (34), submission auto | Build 33 died at signing: the AppStore provisioning profile "doesn't support the HealthKit capability" — the App ID had never been given HealthKit (ASC listed only IN_APP_PURCHASE and APPLE_ID_AUTH), and EAS does not add capabilities on its own. Fix: `POST /v1/bundleIdCapabilities {HEALTHKIT}` on bundle `84Z65BGAV5` with the admin ASC key (scratch `asc.js`, ES256 JWT), which invalidates the old profile; the next plain `eas build` (authenticated via the skew recipe) logged "Provisioning profile (RB78AH9UHD) is no longer valid" and minted `5R7F2A5Y56`. `--clear-provisioning-profile` no longer exists in eas-cli 24. Build 34 cut 22:15 with `--auto-submit`; Apple processed it by 22:21: `tf:status` → `1.3.0 (34) VALID, external: READY_FOR_BETA_SUBMISSION`. Internal testers only; Friends/Family not distributed (that is a separate `tf:distribute` step + Beta App Review). |
| 9 | Generation allowlist (only Dylan spends Gemini tokens) | `DONE`, `NEEDS-DYLAN` for the env | `common/request-actor.context.ts`, `llm/llm-allowlist.ts` (+spec), `llm-client.ts`, `auth.guard.ts`, `app.module.ts`, `workouts/generation-fallback.ts`, `docs/llm-model-swap.md` | Dylan wants to be the only one generating plans while he watches the paid model's spend, without lowering his own limits. `AI_GENERATION_ALLOWLIST` (emails/user ids); unlisted accounts get the rule-based builder, logged `reason=policy` at info, no Sentry. Gate sits in `LlmClient.completeJson` (before the key check; `checkModel` untouched), actor comes from a per-request AsyncLocalStorage context. ⚠ First version set the context with `enterWith` inside the guard and the rig showed it missing on the second request — replaced by a global middleware that opens the context + the guard mutating it (the nestjs-cls shape); rig then held for both users over repeated calls. 65 suites / 886 tests. Env var NOT set on Render (no Render credentials here): Dylan adds `AI_GENERATION_ALLOWLIST` with his email (or Supabase user id if he signed in with Hide My Email); until then behaviour is unchanged. |
| 10 | AI plan generation deep dive | `DONE` (report) | `docs/audits/2026-09-16-plan-generation-deep-dive.md` | Dylan asked for a full review of the generate-a-plan feature before opening it up. Three parallel investigations (frontend flow, backend pipeline with the real prompts, outside research on program design and competitor UX) plus a real Gemini generation on the web rig. Headline: the model only picks week-one exercises and writes copy; sets/reps/rest are re-stamped by bands and a time cap, later weeks are clones, no load/RIR/volume accounting, history and body weight unused, about a third of the form never sent. Ranked recommendations inside (P0 prescription layer + history, P1 one-screen form + richer preview, P2 adaptation after apply). |
| 11 | Tier 0 of the plan-generation plan BUILT | `DONE` | backend 88fc83c, 1a60744, a60c41d (deployed); client 11b0310 + the two after (next binary) | Backend: rest by role (main 3-4 min, second 2-3, isolation 60-90 s, core/holds 60 s); short sessions hold 3-5 lifts not 5-6 (`exerciseTargetsForSession`); session names rebuilt from the final lifts (`session-title.ts`); the home equipment checklist reaches the generator; hard days on the rule-based path use the user's level; `generate-single-session` takes experience + cardio modalities; the response carries `builtBy`. 66 suites / 894 tests incl. the eval gate. Client: weeks default 4; home tags sent; preview says who built the week; one plain generation error message; swap-type days get content before Apply (July 4.5); a **Build muscle** goal that reaches the hypertrophy table (profile Hypertrophy → muscle); the logo mark replaces the bench-press loader (`PlanBuildLoader`). 49 suites / 717 tests, tsc clean. |
| 12 | Tier 1: measure first | `DONE` | `backend/src/plans/coach-check.ts` (+spec), `eval/eval-scoring.ts`, `docs/plan-generation-baseline.md` | The coach check (weighted sets per muscle vs a goal/level band, exposures, hinge/press stacking, rest by role, beginner skill gate, load/RIR presence) as six eval dimensions (ceiling 140 → 168; fixture gates ≥152 / avg ≥156 from the measured 158.8 avg, 154 min) and as `coachCheck[]` on the generate-sessions response + a `coach_check` log event. Baseline on the 77 real captures from the OLD pipeline: mean 146.7/168; effortTarget 2%, patternStacking 45%, weeklyVolume 67%, muscleExposure 73%, restByRole 76%. Refinements from the first run: pressing stacks count compounds only (bench + press + pushdown is a normal day); a rep range alone is not an effort target since every row has one. 67 suites / 902 tests. |
| — | Deliberately NOT done | | | No self-healing dedupe of doubled days (row 4). No production OTA — the client half rides the next binary, so build-32 phones can still double a day until they update (the backend half alone does not stop that: the old binary keeps the two-step write). The `slots/add` and `slots/remove` endpoints are not deprecated. |

---

## 2026-09-14 — Plan generation moves to Gemini 3.5 Flash-Lite; the model is config, and a retirement now pages

Part 2 of `docs/llm-model-swap.md`, the session after Dylan created the paid-tier
key. The Groq model had been retired since 2026-08-16 with every plan served by
rules. Now one client (`backend/src/llm/llm-client.ts`) reads `LLM_PROVIDER` /
`LLM_MODEL`, the three prompts share it, both providers enforce a JSON schema, and a
watch asks the provider once a day whether the model id still exists. Verified:
backend `tsc` clean, lint clean, 63 suites / 869 tests; frontend `tsc` clean +
summary test; live probes (Gemini ok in 1.1 s, Groq gpt-oss-120b ok in 0.6 s, a fake
model id reads as `404 NOT_FOUND`); eight captured requests replayed through the real
pipeline on Gemini and scored against the 40 Llama-era captures.

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | Provider-agnostic client | `DONE` | `src/llm/llm-client.ts`, `llm.module.ts` (global) | `completeJson` = system + user prompt, temperature, output cap, JSON schema, abort signal. Gemini: `responseJsonSchema`, `thinkingLevel: MINIMAL`, cap = requested × 1.25 + 512 (thinking bills as output). Groq: `json_schema` response format, `reasoning_effort: low` for gpt-oss. 45 s timeout, one retry on 408/429/5xx/network, never after an abort. Finish reasons normalised (`length` is the one callers act on). |
| 2 | Generator rewired | `DONE` | `workout-generator.service.ts`, `generation-schemas.ts` | `new Groq(...)` ×3 and `GROQ_MODEL` gone; `generateWithGroq` → `generateWithLlm`; `apiKey` no longer threaded through signatures; fallback reports carry `provider:model`. Schemas mirror the hand parsers, with `days` pinned to the session count; parsers keep their guards (shape is enforced, meaning is not). |
| 3 | Boot + daily model check | `DONE` | `src/llm/llm-model-watch.service.ts`, `health.service.ts`, `health.controller.ts` | 5 s after boot, then every 24 h: `models.get`. Failure = error log + Sentry ERROR event (Sentry emails new issues by default). `/health/ready` `checks.groq` → `checks.llm`, from the same check, cached 30 s; `down` = degraded, never unready. Daily rather than the planned weekly: the point was "within a day, not eleven". |
| 4 | Config | `DONE` | `app.module.ts`, `.env.example`, `render.yaml`, README, CLAUDE.md, `docs/render-deploy.md` | `GROQ_API_KEY` no longer required at boot; `LLM_PROVIDER` validated, `LLM_MODEL` / `LLM_TIMEOUT_MS` / `GEMINI_API_KEY` optional. Render needs nothing new: `GEMINI_API_KEY` was added 2026-09-13 and `gemini` is the default. |
| 5 | Eval on the new model | `DONE` | `scripts/drive-generation.ts` (`--provider=`, `--model=`), captures `generation-17894168*` … `17894169*` | 8 replays: mean 137.3 / 140 (Llama-era 40-capture baseline 137.2), min 136, max 140, validator 100%, fallback 0%, truncated 0%. fatigueStacking 5.1 vs 4.5; coachingProDepth 7.0 vs 7.3; workoutOrder 7.1 vs 7.4. First-pass validator issues 7 of 8, same shape as the same inputs on Llama (5 of 8 then), and the batch retry cleared them every time. ~10 s / 2 calls / ~7.5k tokens for a four-day week, zero thinking tokens. |
| 6 | Live probe script | `DONE` | `scripts/test-llm-generate.ts` (replaces `test-groq-generate.*`, compiled siblings deleted) | Model check + one schema-enforced completion through the real client. |
| 7 | Privacy policy processor row | `DONE` | `site/privacy/index.html`, deployed (wrangler, `d2de3906`) | "Google (Gemini API, paid tier) … does not use paid-tier requests to train". Verified on https://jimplanner.app/privacy/ after deploy. |
| 8 | Preview summary line | `DONE` | `frontend/src/lib/planGenerationSummary.ts` (+test) | "AI: Gemini". JS-only, rides the next binary (no production OTA, see 2026-09-13 row 13). |
| 9 | Captures name the model | `DONE` | `generation-capture.ts`, `plans.service.ts` | `groqCallsRaw[].provider/model/thought_tokens`, `meta.groq.model`. Field family keeps its `groq` name on purpose: the eval harness reads it. |
| 10 | Sentry alert rule for `llm-unusable` rate | `NEEDS-DYLAN` | Sentry → Alerts | The events exist (warning "Generation fell back to rules", tags `generation.fallback_reason`); the model-check failure is a separate error-level issue that emails on first occurrence. A rate rule ("more than 5 fallback events in an hour") is a two-minute Sentry UI task; no API token here to do it. |
| 11 | Deploy | `DONE` | Render, `main` | Pushed; Render auto-deployed in about 3 minutes. `GET /api/health/ready` on production returns `{"db":"ok","supabase":"ok","llm":"ok"}` — so the new build is live AND the Render `GEMINI_API_KEY` reaches Gemini and the model id resolves. That is the prod env + prod key half proven; the request path itself was proven by the 8 local replays against the real API. |
| 12 | First real plan from the app | `NEEDS-DYLAN` | phone | Deliberately not done from here: it needs a real Supabase session, and minting one against the prod secret risks `ensureUser` clobbering a real account's email. Watch for `[LLM:generateFullProgram] model=gemini:gemini-3.5-flash-lite` in the Render logs when you generate. |
| 13 | Doc sweep after the rename | `DONE` | `backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md`, `docs/onboarding-review-2026-09.md`, a stale `@param` | The observability section told you to grep `[Groq:<label>]` and `groq_completion`, which no longer exist — now `[LLM:<label>]` / `llm_completion`, plus the `LlmModelWatch` lines. The September onboarding review's finding 1 ("not AI right now") is marked resolved, keeping the half of it that is still open: the preview never tells the user when a plan came from the rule-based builder. |
| — | Deliberately NOT done | | | Temperatures left at the Llama values (0.73 / 0.62 / 0.45): Google suggests 1.0 for Gemini 3 series but the eval held at parity, so no change until a reason appears. Prompt text untouched. `docs/exercises-public-api.md`, `docs/future.md`, `ONBOARDING_WELCOME_REVIEW.md` still say "Groq" in historical context; left. Groq SDK stays installed, but Dylan confirmed the same day that its account is the free tier being withdrawn, so it is a code path and not a fallback; the docs now say so and a real second provider is parked in `docs/future.md`. |

---

## 2026-09-13 — The mark stays a mark: placements dropped, launch animation replaced by a faster static launch

Dylan came back to the two deferred logo questions. For the in-app placements
he asked for real visuals before deciding, so a current-vs-proposed canvas of
all four screens was built from the screen source ("Jim Mark Placements",
artifact e404edcc). Looking at them he found the flaw himself: five segments is
a property of the letter, not of a plan. Plans run two to six days a week, so
1 of 2 and 3 of 6 both lit three segments and 2 of 3 jumped from three to five,
right next to the literal count. All four placements dropped; the proportional
mapping deleted. Then the launch animation: eight candidates were prototyped
live (artifact 92ebc652: drawn rep, stepped rep, flex, drop, lift, ripple,
breath, stem) with a short research pass on what makes launch motion good.
Dylan checked the apps on his phone: nearly all show a static mark and get into
the content. Agreed. The loader is now the splash frame itself, held only as
long as startup takes. Verified: `tsc` clean, 48 suites / 709 tests, Playwright
boot on the web rig with the dark theme seeded: frame at 507 ms is the flat
light splash frame with the mark dead centre and no wordmark; frame at 819 ms is
Welcome in dark with the dissolve tail fading.

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | In-app progress placements (Home hero, finish tick, Crew rows, Progress header) | `WONTFIX` | canvas e404edcc, memory | Drawn, reviewed, dropped. The mark is identity only. Kept out for good: any placement that puts the mark beside a session count. |
| 2 | Proportional session→segment mapping removed | `DONE` | `lib/jimMark.ts`, `jimMark.test.ts`, `JimMark.tsx`, `brand/README.md` (`f8558ba`) | `segmentsForProgress` and its tests gone; the README now records why (the 1 of 2 / 3 of 6 collision). `dashArrayFor` stays for the tap-to-rep. |
| 3 | Launch animation | `WONTFIX` | artifact 92ebc652 | Eight candidates built and watched at ¼ speed in both themes. Decision: none ships. The best launch is the shortest one; the animated launches people remember (X) are transitions into content, which needs a native mask and is polish for later, not a reason to hold a binary. |
| 4 | Loader = the splash frame | `DONE` | `components/LoadingScreen.tsx`, `lib/jimMark.ts` (`SPLASH`), `brand/tools/generate.js` | Flat #F2F2F7, solid #2563EB mark at 96 pt, centred, no aurora, no wordmark, no theme colours, whatever theme the user runs. Fixes two handoff bugs the old loader had: the mark sat 19 pt above the splash (the mark+wordmark column was centred, not the mark) and a dark-theme user got a hard cut from the light splash to a dark loader. Now the dissolve over the app is where the ground crosses. |
| 5 | No minimum hold | `DONE` | `App.tsx` | `LOADING_MIN_DISPLAY_MS` (1500) and its state removed; `ready` is purely session + preferences + the sign-in-before read. Dissolve 480 → 350 ms. Status bar icons stay dark until the dissolve starts, because the loader ground is light. Every launch is ~1.5 s shorter. |
| 6 | `JimLogo` entrance removed | `DONE` | `components/JimLogo.tsx` | The staggered wordmark/tagline reveal existed only for the loader. Reanimated dropped from the component; `showTagline` and `interactive` (tap-to-rep) unchanged, so AuthHero, AuthScreenLayout and Onboarding did not change. |
| 7 | What's New line for the faster launch + new icon | `OPEN` | `constants/changelog.ts` | Deliberately NOT done: the 1.2.0 card shipped in build 32. The next binary (new icon, splash, launch) gets a new card, written when that build is cut. |
| 8 | X-style reveal (mark scales up, app appears through it) | `OPEN` | — | Parked, not planned. Needs a native mask (Skia or MaskedView). Only worth it as a transition, never as a delay. |
| 9 | Website + email lockup | `OPEN` | `brand/` | Unchanged from 2026-09-11; waits on jimplanner.app. |

### Same day, later: jimplanner.app is live, Google sign-in unblocked

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 10 | Site: homepage, privacy policy, terms | `DONE` | `site/` (`9062ca8`, `3ecb289`), `docs/website.md` | Static, app palette + system type, light and dark. Privacy policy written to what the app actually does (every processor named; Sentry always on but id-only; Groq gets preferences only; export + delete in Profile). Terms carry beta / not-medical-advice / AI caveats and deliberately NO governing-law clause (Dylan did not know what to pick; counsel adds it). Beta CTA is a mailto to support@jimplanner.app. Verified: Playwright renders at 1100 and 400 wide; all five URLs 200 on the custom domain. |
| 11 | Cloudflare Pages deploy + custom domain | `DONE` | Pages project `jim-planner`, DNS CNAME `@ -> jim-planner.pages.dev` | `wrangler login` scoped to `account:read user:read pages:write zone:read` (approved in Dylan's Chrome). wrangler 4.131 tried to delegate to Workers, dropped a `wrangler.jsonc` + package.json scripts in the repo root and 403'd; reverted, created the project with `--force` (classic Pages), deployed. https://jimplanner.app resolved within a minute. |
| 12 | Google OAuth consent screen published | `DONE` | console.cloud.google.com, project `jim-app-508300` | Branding: homepage, privacy and terms URLs + authorized domain `jimplanner.app`, saved; Audience: Testing → In production (basic scopes, no verification). The Google button in build 1.2.0 (32) now works for everyone, not just test users (there were none). |
| 13 | Legal URLs + support address in the app | `DONE` | `frontend/eas.json` (`7cba4f4`), local `.env` | `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `_TERMS_OF_SERVICE_URL`, `EXPO_PUBLIC_FEEDBACK_EMAIL=support@jimplanner.app` in all three profiles. Deliberately NO production OTA: build 32 still carries the old splash image, so an OTA of the new loader would show the old chip and then the new mark at every launch until the next binary. Ships with the binary. |
| 14 | App Store Connect URLs | `DONE` | ASC app 6776483293, via the API key the TestFlight script uses | `privacyPolicyUrl` on the en-US app info, `supportUrl` + `marketingUrl` on version 1.0 (Prepare for Submission), read back after the write. Done through the API because ASC's web sign-in is Dylan's to do. |
| 15 | Build 32 phone pass | `NEEDS-DYLAN` | `docs/navigation-qa-checklist.md` §1 | Cannot be done from here. Apple sheet + first-run name, keyboard fold, dark mode, Hide My Email, "second focus" card, and now the Google button end to end. |

### Same day, last hour: day names lose their letters, Apple Health built

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 16 | Workout day naming | `DONE` | `backend/src/data/plan-templates/*.ts`, `workout-generator.service.ts` (2 prompt lines) | Option 1 of the 2026-08-25 proposal: 19 template titles drop the letter ("Upper · Bench + Row"); prompts ask for the focus + " · " + a two-word emphasis and forbid A/B and 1/2 suffixes. Verified: the six template/generator suites (160 tests). Not done: option 2's "Squat Day" grammar (bolder, parked); eval:drive must re-run once a Groq model replaces the dead one, since the prompt text changed. |
| 17 | Connect Apple Health | `DONE` (untested on a phone) | `lib/appleHealth.ts`, `lib/appleHealthEnergy.ts` (+test), `UserPreferencesContext` (`appleHealth`), `PlanCalendarWorkoutCompleteScreen.tsx`, `ProfileScreen.tsx`, `app.json` | Shape from the September research: offered ONCE on the finish screen after a live session, never in onboarding. Connect → HealthKit sheet → this workout written; every later finish writes automatically; Not now → hidden, Profile → Account → "Apple Health" turns it On/Off (the alert points at Health → Sharing → Apps to revoke). Writes `traditionalStrengthTraining` with active energy = MET 4.5 × kg × h (weight read from Health, else 170 lb) so the Move ring moves. Module `@kingstinct/react-native-healthkit` 15 behind a guarded `require` (white-screen rule); plugin verified via `expo config --type introspect`. Verified: tsc, 49 suites / 712 tests. **Nothing here has run on a device**: the web rig has no HealthKit. First phone check on the next binary: sheet appears, workout shows in Fitness with "Jim", ring credit, Profile toggle. |
| 18 | Privacy policy: Apple Health paragraph + processor row | `DONE` | `site/privacy/index.html`, redeployed | Says exactly what is written and read, and that none of it reaches our servers. |
| — | Sanity check vs Strong / Hevy / Fitbod (2026-09-13) | `DONE` | their help centres | Same shape everywhere: workout type + duration + estimated energy written, body weight read, per-set detail stays in the app. Two known support tickets to expect: (1) "workouts not showing" = the Health permission toggles; (2) Move-ring credit missing for Apple Watch wearers = Health's data-source priority ranks the Watch above Jim for the same hour (Fitbod and Strong both document it). Not built: a hint for (2); add one line on the Profile row if a tester reports it. |
| — | Not done | | | Reading Health body mass INTO the weight tracker (the optional half of the research) — left out; Health is read only for the energy estimate. Groq model swap: Dylan wants it soon, no time today. |

## 2026-09-11 — New logo: the segmented J replaces every old Jim mark (committed, no build)

Dylan built the mark himself (a J cut into five segments that doubles as a progress
track) and asked for a read, then for the fixes and the rollout. Four-person test:
"C", "d"/"J", "loading ring", "loved it". Each read traced to a separate lever, none
of them the five-segment idea: the loading read is the 3-of-5 tonal fill on the icon,
the C is the short stem, the d is the 270° hook closing the bowl (Gestalt closure).
Decision with Dylan: hook shortened to 235°, icon ships SOLID 5 of 5, partial fills
live only in-app as the user's week and in the launch animation. Stem left alone.
Verified: `tsc` clean, frontend suite green (9 new tests), Playwright on the Expo web
rig at 390×844: Welcome (light + dark), mid-rep frame after tapping the mark, Sign in.
Pitch of every placement: artifact b1823b25 ("Jim Logo Placement Map").

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | Asset set from one generator | `DONE` | `brand/tools/generate.js`, `brand/*.svg` + `.png`, `brand/README.md` | Geometry constants in one place: path `M66 20 L66 52 A22 22 0 1 1 31.38 33.98`, length 122.23, segment 19.25, gap 6.5. Writes light/dark/mono/tinted icons, Android adaptive foreground (0.66× into the safe zone), bare mark, progress and tonal references. Needs `sharp` from any node_modules (`node brand/tools/generate.js <dir>`). Stripped the 8 KB C2PA manifests the original SVGs carried. |
| 2 | App assets + iOS 18 variants | `DONE` | `frontend/assets/icon*.png`, `adaptive-icon.png`, `favicon.png`, `splash.png`, `app.json` | `ios.icon: { light, dark, tinted }`; Android background → white. Splash is the solid mark at 96 pt on #F2F2F7, the same size `JimLogo` draws it (`JIM_LOGO_MARK_PT` ↔ `SPLASH_MARK_PT`) so the handoff does not jump. Old `icon-source.png` deleted. Needs a NEW BINARY: icon, splash and adaptive icon are not OTA-able. |
| 3 | `JimMark` + geometry lib | `DONE` | `components/JimMark.tsx`, `lib/jimMark.ts` (+`jimMark.test.ts`) | Plain `react-native-svg`, two copies of one path, only the dash array changes. `segmentsForProgress` is proportional with two honesty rules (0 only when nothing done, 5 only when finished, else clamp 1–4) because plain rounding shows 5 at 9/10 and 0 at 1/12. Accessibility props are only spread when a label is given: RNSVG on web forwards RN-only props to the DOM and warns. |
| 4 | `JimLogo` rewrite, Skia glyph gone | `DONE` | `components/JimLogo.tsx`, `AuthHero.tsx`; `JGlyph.tsx`, `JGlyph.web.tsx`, `JGlyphSkia.tsx` deleted | Same props (`showTagline`, `interactive`, `entrance`) so LoadingScreen, AuthHero, AuthScreenLayout and Onboarding did not change. Chip, gradients, sheen and pulse rings removed (brand rule: flat, no gradient). Tap-to-flex became tap-to-rep: the mark empties and refills one segment at a time. AuthHero's keyboard row is a flat 30 pt mark. Aurora stays (backdrop, not logo). Skia is still a dep for the body map and Aurora. |
| 5 | Theme tokens | `DONE` | `theme/colors.ts` | `brand` (#2563EB / #4D9BFF) and `brandTrack` (#D9DDE5 / #1E3663) added; `brandGlyphShade` removed. `brand` ≠ `primary` (#0061C2) on purpose: primary is tuned for 4.5:1 text, the mark must match the shipped icon. `brandGradientStart/End` kept for Aurora and the What's New chip. |
| 6 | Launch animation | `OPEN` | `LoadingScreen.tsx` | Deliberately NOT done: Dylan wants extra effort on it as its own task. Today the loader shows the static mark with the wordmark rising, so nothing old ships. Intended shape: segments draw in from the stem and land on 5 of 5, starting from the exact splash frame. |
| 7 | In-app progress placements | `NEEDS-DYLAN` | see the artifact | Proposed, not built: Home hero week mark (replaces the momentum bar), finish-screen tick k→k+1, per-member marks in Crew, Progress header. Kept out on purpose: headers, tab bar, two marks on one screen, partial fill as decoration, the What's New gift chip. |
| 8 | Website + email lockup | `OPEN` | `brand/`, `docs/email-templates/sign-in-code.html` | Needs a raster lockup (email clients drop SVG) once jimplanner.app exists. |

## 2026-09-10 — Sign-in v2: Apple, Google, emailed code on one identifier-first screen (uncommitted)

Dylan: research what big apps do for sign-in, design the "most up to date" screens
(canvas c32074a8, page "v2 · Refined"), then "if you're absolutely confident about
the screens now then go ahead and build the v2." Built as drawn: hero over a bottom
sheet, Apple → Google → email → one blue Continue, six-digit code screen, password
fallback, and the pre-auth Welcome. Verified by `tsc` (clean), the frontend suite
(47 suites / 704 tests, 16 new) and a Playwright pass on the Expo web rig at 390×844
and 375×667 with Supabase's OTP endpoint stubbed: Welcome → Sign in → code screen
(partial, wrong-code error, resend countdown) → "Use password instead" → Password.
**Apple, Google, the keyboard fold and dark mode were NOT exercised** — web has no
native modules and no keyboard; they need the phone AND a new binary.

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | Identifier-first Sign in | `DONE` (web) | `screens/SignInScreen.tsx`, `components/AuthHero.tsx`, `AuthSheet.tsx`, `SignInButtons.tsx` | Brand + aurora in the top half (look zone), every control in a bottom sheet (thumb zone). Apple is Apple's own system button (`AppleAuthenticationButton`, CONTINUE, black/white by theme, radius 12); Google is a custom button in Google's Light/Dark theme with the four-colour G (`react-native-svg`); both 52pt, same as Continue. Each provider hides itself when its module is missing or Google's client ids are unset, so web/older binaries just show email. Keyboard open → hero folds into a brand row, legal line hides, sheet rides above the keyboard (KAV padding). Short screens (<700pt) shrink the lockup 0.8× so no control shrinks. |
| 2 | Emailed six-digit code | `DONE` (web, stubbed) | `screens/EmailCodeScreen.tsx`, `components/CodeInput.tsx`, `AuthContext.sendEmailCode/verifyEmailCode` | `signInWithOtp({ shouldCreateUser: true })` then `verifyOtp({ type: 'email' })` — one screen serves log in AND sign up. Six boxes over one hidden `TextInput` with `textContentType="oneTimeCode"` so iOS offers the code from Mail; pasted "482 913" lands. Submits on the sixth digit; wrong code → error, boxes cleared. Resend is a 60 s countdown (Supabase's per-address limit). |
| 3 | Password fallback | `DONE` (web) | `screens/PasswordScreen.tsx` | One field + show/hide, no confirm field. "Forgot it? Email me a code" sends a code and `replace`s to the code screen, so the code IS the recovery path; the ForgotPassword screen is gone. Old reset deep links still open `SetNewPasswordScreen` (untouched). |
| 4 | Welcome before sign-in | `DONE` (web) | `screens/WelcomeScreen.tsx`, `App.tsx` `AuthStack`, `AuthContext.hasSignedInBefore` | Same hero/sheet anatomy. Shown only on an install that has never held a session (`jim_auth_seen_v1` in AsyncStorage, device-local); a signed-out returning device opens on Sign in. `ready` waits for that one read so the stack never opens on Welcome and jumps. |
| 5 | Native providers, safely | `DONE` | `lib/authProviders.ts`, `AuthContext.signInWithProvider` | Both native modules are loaded with `require()` inside a try (the white-screen lesson), once. Apple: `signInAsync` → `signInWithIdToken`; the name Apple sends ONCE is stored as `user_metadata.full_name` immediately. Google: `GoogleSignin.signIn()` → id token → `signInWithIdToken`; configured from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID`; `app.config.js` adds the config plugin only when `GOOGLE_IOS_URL_SCHEME` is set, so builds succeed before Google Cloud exists. |
| 6 | Hide My Email / no-email accounts | `DONE` | `lib/authIdentity.ts` (+16 tests), `ProfileScreen.tsx`, `HomeScreen.tsx`, `CrewScreen.tsx`, `ShareModal.tsx` | `handleDeleteAccount` gated on the session, not `user.email` (an Apple-only account could not delete itself — App Store 5.1.1(v)). Greetings and the crew name never use a relay hash; the Profile identity row reads "Apple ID · email hidden". |
| 7 | Config, e2e, docs | `DONE` | `app.json` (`usesAppleSignIn`, `expo-apple-authentication` plugin), `.env.example`, `e2e/smoke.spec.ts`, `docs/auth-sign-in-setup.md` (new), `navigation-route-map.md`, `navigation-qa-checklist.md`, `INDEX.md`, `constants/changelog.ts` | Smoke test walks email → Continue → "Use password instead" → password. Setup doc has every Supabase / Apple / Google console step. One What's New row on the unshipped card. |
| — | Removed | `DONE` | `LoginScreen.tsx`, `SignupScreen.tsx`, `ForgotPasswordScreen.tsx` deleted; `AuthContext.signUp` / `requestPasswordReset` removed | Nothing else imported them. `AuthScreenLayout`, `AuthInput`, `AuthNotice` stay (SetNewPassword uses the layout). |
| 8 | Onboarding goal step: make "Add a second focus" visible | `DONE` (web) | `screens/OnboardingScreen.tsx` (goal step JSX + `secondFocus*` styles) | Dylan: "some users might miss it." It was a bare blue text link under the fact line, ~36pt tall and below the fold at 390×844. Now a dashed-outline "add slot" card in the goal-card family: 36pt `primarySoft` tile with a `+`, callout/semibold label, one muted hint ("Optional. Mixes a second goal into your plan."), chevron; unfilled and unshadowed so it never reads as a sixth goal. The same shell hosts picking mode (filled tile, "Tap a second goal…", Cancel) and the chosen state (checkmark tile, "X is your second focus.", Remove), both with 44pt actions. Moved directly under the goal cards, ahead of the fact line, which puts the whole card above the fold on 390×844. Behaviour, copy of the two existing states, badges, step order and persisted data unchanged; the single-select + explicit-mode decision from row 10 of 2026-09-09 stands. Verified: `tsc` clean, 47 suites / 704 tests, Playwright on the web rig at 390×844 in light AND dark (`jim_theme_v1` seeded), all three states screenshotted; hit box measured 350×84pt. Not done: no phone pass; dashed borders on iOS are the one thing web cannot vouch for. |

### Same evening, with Dylan driving the consoles

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 9 | Domain + transactional email | `DONE` | Cloudflare Registrar (`jimplanner.app`), Resend, Cloudflare Email Routing | Name research first (docs in memory: "Jim" is usable but not clean — FRIENDS CALL ME JIM covers our goods in US Cl. 9, JYM is phonetically identical; the fix is a composite brand, App Store name "Jim: Workout Planner"). Dylan chose jimplanner.app. Resend domain verified via its Cloudflare auto-configure (records on `send.` and `resend._domainkey`, DMARC added); Email Routing `support@jimplanner.app` → Gmail on the root MX — no SPF collision because the two live on different hostnames. |
| 10 | Supabase email codes, live | `DONE` | Supabase → Emails (SMTP + Templates), Rate Limits, Providers → Email | SMTP: smtp.resend.com:465, user `resend`, sending-only key, sender `codes@jimplanner.app`. BOTH templates (Confirm sign up, Magic link or OTP) use `docs/email-templates/sign-in-code.html`; subject carries `{{ .Token }}`. **Email OTP Length was 8 on this project** (the app assumes 6) → set to 6. Emails/hour 30 → 200. Verified: Dylan signed in through the web build with a real code from his own inbox. |
| 11 | Apple + Google providers configured | `DONE` (untestable until the binary) | Apple developer portal, Google Cloud, Supabase → Providers, `eas.json` | Sign In with Apple capability on `com.jimapp.app`; Supabase Apple provider with the bundle id as Client ID, no secret. Google: consent screen (Testing), web + iOS OAuth clients; Supabase Google provider with BOTH client ids comma-separated in Client IDs, web secret, **Skip nonce checks ON** (the native iOS SDK's nonce never reaches Supabase). The three public values are in every `eas.json` profile; `npx expo config` confirms the google-signin plugin and `usesAppleSignIn` are active. |
| 13 | Merge, deploy, build, ship | `DONE` | PR #37 (`ef6830f`), Render, EAS build 32, TestFlight "Friends/Family" | Seven scoped commits → PR #37, CI green, merged. Render redeployed from main (verified: `POST /plans/me/workarounds` answers 401 not 404; `/health/ready` green). Builds 28–31 died on a provisioning profile that predated the Sign in with Apple capability: the pinned `eas-cli` 18.5 never talks to Apple in `--non-interactive`, and `eas-cli@latest` got "Apple 401" because `@expo/apple-utils` signs its token for exactly 1200 s and this PC's clock is ~2 s ahead of Apple. Ran the CLI with `Date.now()` shifted back 20 s → profile RB78AH9UHD regenerated → build 32 (1.2.0) FINISHED, VALID in ASC 19:24 PT. Dylan: "ship it to friends and family" → added to the external group and submitted for Beta App Review (WAITING_FOR_BETA_REVIEW). Recipe in memory `run-builds-directly`. |
| 12 | Version 1.1.0 → 1.2.0 | `DONE` | `app.json`, `constants/changelog.ts` (card version) | Reversal of the earlier "not bumping" call: `SignInButtons.tsx` imports `react-native-svg` at module top level, and that module throws at import on a binary that does not link it. An OTA of this JS on the `production` channel would therefore crash 1.1.0 phones. Same `runtimeVersion` policy (appVersion) → a new version is what fences the OTA. |

### Needs Dylan (`NEEDS-DYLAN`)

| Thing | Why |
|-------|-----|
| Phone pass on build 32 (shipped to testers WITHOUT one, Dylan's call) | Apple sheet + first-run name capture, Google sheet, keyboard fold, dark mode, Hide My Email, the dashed "second focus" card, VoiceOver order. QA list in `navigation-qa-checklist.md` §1. |
| Google consent screen → Publish | It is in Testing (only listed test users can sign in). Publish before external testers try Google. |
| Commit | Small scoped commits per [[feedback_commit_hygiene]]; nothing is committed yet. |

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| Passkeys, Facebook, phone/SMS, a Face ID gate | Research call (2026-09-10): passkeys are a Supabase beta with no Expo path; Facebook is being dropped by Strava/Airbnb/MFP; no fitness app gates on Face ID. |
| Apple nonce | Supabase's own Expo recipe passes none; adding one needs `expo-crypto`, another native dep. Revisit if Supabase starts requiring it. |
| Sign-in AFTER the six onboarding questions | The bigger win per the canvas note, but a different change (answers held locally, account at the payoff). Ask first. |
| Commit | Not asked. |

---

## 2026-09-09 (night) — Work-arounds in Profile, schedule write-back on the plan pages (uncommitted)

Dylan's call after the onboarding batch: the schedule does NOT get a Profile editor
("people's plans change and it would probably be best to make these changes when they
make a plan"); the work-around does, and it may apply to the current plan. Agreed with
two conditions, both built here: the plan-making pages must remember the schedule they
were given (before this, the AI form was seeded from onboarding once and never wrote
anything back), and touching the plan in progress is an explicit yes, not a silent
rewrite. Verified on the web rig (throwaway Postgres, local backend, Expo web) and by
unit tests. Frontend 46 suites / 688 tests, backend 869, `tsc` clean on both.

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | "Working around" row in Profile → Training | `DONE` | `ProfileScreen.tsx` | Fourth row under Goal / Experience / Equipment, value "Knees / lower leg, Shoulders" or "Nothing". Sheet mirrors the equipment sheet: the seven joints as switches, Cancel / Clear / Save, "Not medical advice". Saving always feeds every NEW plan (the AI form and template applies read the tags). Verified live: row, sheet, toggle, Clear appears, Save persists `injuryTagIds`, row reads "Shoulders". |
| 2 | "Swap exercises in your current plan too?" | `DONE` | `ProfileScreen.tsx`, backend `POST /plans/me/workarounds` (`ApplyWorkaroundsDto`, `PlansService.applyWorkaroundsToCurrentPlan`), `planService.applyWorkaroundsToCurrentPlan` | Only an ADDED joint prompts (removing one cannot put a swapped exercise back), and only when a plan exists. "Just new plans" / "Swap". Swap runs the same substitution as a template apply over the stored plan from the CURRENT program week on (client computes it from the plan anchor; earlier weeks are history), rewriting plan rows AND the mirrored Workout rows a live session opens, one transaction per slot; the general plan PATCH (delete + recreate everything) is not used. Result alert names the count. Verified: curl with "shoulders" from week 2 on the rig plan → `swapped=7 dropped=7 slots=14`; week 1 untouched, weeks 2–8 lost the overhead press and swapped the bench, mirrors match; the calendar's week-2 Friday lost its Shoulders chip. Four service spec tests (no plan → 404, untouched slots write nothing, week filter + mirror ops, no mirror). |
| 3 | Plan pages remember the schedule | `DONE` | `lib/scheduleWriteBack.ts` (new, 6 tests), `GeneratePlanScreen.tsx` `handleGenerate`, `TemplateDetailScreen.tsx` `handleApply` | On Generate: days → `trainingFrequency` (only counts the picker can show, 2–6), picked days → `preferredTrainingDays` unless they equal the form's own default pattern for that count (then "flexible", so the next PROGRAM keeps its own defaults), session window → `sessionMinutes` (top of the window, 90 → 75+). On program apply: the same for days against the program's defaults. Verified live on the form: Mon–Fri + Sun at 60 min → prefs `6 · false · [Mon…Fri, Sun] · 60`. |
| 4 | The form's body-area chips match the seven joints | `DONE` | `GeneratePlanScreen.tsx` | Was three (knees, shoulders, lower back); a hips or neck tag seeded from Profile was applied with no chip to see or clear. Now all seven with the same labels; `planInputs.ts` already accepted them. Verified live: seven chips, Shoulders pre-selected from Profile, review row "Avoiding · shoulders". |
| — | What's New | `DONE` | `constants/changelog.ts` | One row on the unshipped card: "Work-arounds in Profile". |

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| A schedule editor in Profile | Dylan's call: the schedule changes when a plan is made. |
| Applying a REMOVED joint to the current plan | Nothing to do: a swapped exercise cannot be put back safely (the original may not exist in the rewritten slot). New plans just stop filtering it. |
| Live check of the program-apply write-back and the confirm dialog | Same helper as the form path, unit-tested; the dialog is `Alert.alert` with buttons, which react-native-web does not render. Both need the phone. |
| A "Swapped" toast instead of an alert | Kept the app's existing Alert pattern; a toast is a design call. |
| Commit | Not asked. |

---

## 2026-09-09 (latest) — Onboarding fixes, built in the review's order (uncommitted)

Dylan: "lets start implementing these fixes then, in the order you suggested (don't
worry about the first issue regarding the AI though because I will be changing the
model soon and begin testing this)". The order is §7 of
[`onboarding-review-2026-09.md`](./onboarding-review-2026-09.md). Everything below is in
the working tree, **not committed**. Verified by type-check on both sides and the full
unit suites (frontend 45 suites / 679 tests, backend 62 / 863, five of them new).
**Not run on a device or in the browser** — the screens need a pass.

| # | Task | Status | Where | What and why |
|---|------|--------|-------|--------------|
| 1 | Groq model swap + honest "AI" copy | `NEEDS-DYLAN` | `workout-generator.service.ts` | Dylan is changing the model and testing it. Untouched. |
| 2 | Injury tags honoured when a coach-built program is applied | `DONE` | backend `plans/plan-avoid-substitution.ts` (new), `plans.service.ts` `create()`, `ExercisesService.avoidPredicate`; frontend `templatePlan.ts` `limitations` | Before: tags reached the generate path only; the template path (the main exit) ignored them. Now `POST /plans` runs every slot through the same joint-demand + text checker the generator uses and swaps a flagged exercise for `pickReplacement`'s pick, keeping the sets/reps and noting "Swapped in for X (your work-arounds)". No replacement → dropped; a slot is never emptied. Both the onboarding one-tap and TemplateDetail send `storedInjuryTagsToAvoidList(tags)`. ⚠ Deploy the backend before the OTA; until then the field is accepted and ignored, nothing breaks. Five spec tests. |
| 3 | "Other notes" removed from onboarding | `DONE` | `OnboardingScreen.tsx` | The textarea only ever reached the Groq prompt, so it did nothing for anyone today. Tags stay; the subtitle now says what happens ("We'll swap exercises that load these joints. Not medical advice."). Profile never had a notes field, so nothing else references it. |
| 4 | TemplateDetail seeded from the answers; the real first day named | `DONE` | `TemplateDetailScreen.tsx`, `templatePlan.ts` | Days come from Profile's `trainingFrequency` clamped to the program's range, weekdays from the preferred days when not flexible, else the program's defaults for that count. The apply sheet says "First session Thu, Sep 11" (`firstSessionDateISO`) instead of "Week 1 starts the week of…", plus a line naming the joints that will be swapped. `suggestedTemplateStartDateISO` always returns today; `materializeTemplatePlan` writes a partial first week (chosen days from today on, session rotation continuous across the boundary) and only moves the anchor to next Monday when no chosen day is left this week. The calendar store refreshes after apply. Tests for the partial week and the Sunday roll. |
| 5 | Skip on optional steps, weight out, unit inferred | `DONE` | `OnboardingScreen.tsx`, `deviceUnits.ts` (new), `UserPreferencesContext.tsx` | Six steps, was seven: the weight step is gone (the tracker asks on first open). The footer button reads "Skip" in a secondary style on the work-arounds step while nothing is picked. The name field on the review step stays optional. Losing the weight step lost the only place lb/kg was chosen, so the default unit now comes from the device region (US, Liberia, Myanmar → lb; unknown → lb; else kg). |
| 6 | Session length on the schedule step; 2 days/week | `DONE` | `trainingSchedule.ts`, `UserPreferencesContext.tsx`, `templateRecommendation.ts`, `GeneratePlanScreen.tsx` | Schedule step = days (2–6) · minutes (30/45/60/75+) · Flexible/Pick days · a computed line "3 coach-built programs fit 4 days × 45 min" (or "none fit exactly, AI can build one"). `sessionMinutes` is a new persisted preference (default 45); it seeds the AI form's duration and scores recommendations (3 points per 15 min outside a program's range, never enough to outrank the goal family or the day range). |
| 7 | Payoff shows the first session, one-tap start, honest matching moment | `DONE` | `OnboardingScreen.tsx`, `onboardingPayoff.ts` (new) | Finish persists the answers and marks onboarding complete first, then shows "Matching you to a program" with the work that was done as lines (checked N programs · M fit 4 days × 45 min · picked X), at least 1.8 s, waiting for the catalog and the program detail, tap to skip, an empty catalog goes straight through. The card then shows the program, "First session · Today / Tomorrow / Thu, Sep 11", the first session's exercises with their week-1 sets × reps, and **Start this program**, which applies it with today as day 1 and lands on the plan list. "View the full program", "Build a custom plan with AI" and "I'll explore the app first" remain. If the program detail fails to load the button falls back to "View program". |
| 8 | Endurance labelled honestly | `DONE` | `templateRecommendation.ts` `recommendationMatch` | Eyebrow reads "Recommended for you" only when the program is in the goal's family; otherwise "Closest program to your goal". Endurance is always "closest" (no program is written for it). Kept in the goal list rather than dropped: the AI path does build for it. |
| 9 | Factual "something back" lines; truthful "Not sure" | `DONE` | `onboardingPayoff.ts` | Goal and experience lines state the rep ranges the set/rep schemes and templates actually use. A "Not sure" experience card maps to Beginner and says so ("We'll start you easy. You can change this in Profile."); the review row reads "Beginner · starting easy". No equipment line: the catalog cards carry no equipment, so nothing true could be computed. |
| 10 | Goal picker is single-select with an explicit second-focus mode | `DONE` | `OnboardingScreen.tsx` | Tapping a second card used to add a second goal silently. Now it changes your goal; "Add a second focus" enters a mode (with Cancel) where the next tap adds it; pills read "Main goal" / "2nd focus"; Remove clears it. |
| 11 | Pre-auth welcome | `OPEN` | — | Launch item per the review, not now. |
| — | What's New | `DONE` | `constants/changelog.ts` | One row on the unshipped card, for existing testers: programs start on your days from Profile and swap out exercises for your work-arounds. The onboarding changes themselves are not a row (existing testers never see onboarding again). |

### Verification round (same day, Dylan: "double check all the work done and confirm it is all working properly")

Two passes. **A fresh-eyes review agent** read the whole diff and returned seven findings;
five were real and are fixed below, two were copy. **A live run** on the web rig
(throwaway Postgres on 55432, local backend on 3005, Expo web on 8090, session
bypass per `feedback_local_session_bypass_technique`): drove all six steps, the
matching moment, the payoff card, **Start this program**, then the Templates →
program → apply path, and read the plan back from the database each time.

| # | Finding | Status | What and why |
|---|---------|--------|--------------|
| R1 | Preview-apply rewrote plans the user had just approved, with a stricter checker than generation used, and without their equipment | `DONE` | `PlanPreviewScreen` sends `limitations` on every apply, so `create()` was re-filtering rows the generator had already filtered (text match) with the joint-demand checker — "Shoulders" would swap the bench press out of a plan the user just previewed. Now `CreatePlanDto.applyWorkarounds` gates the pass; only `materializeTemplatePlan` sets it (when limitations exist). The substitution also receives `equipment` (catalog display names, the same format `POST /exercises/replace` takes), so a dumbbell-only user cannot get a machine swapped in. |
| R2 | The same slot swapped to a DIFFERENT exercise each week | `DONE` (found in the DB read-back) | Back Squat → trap-bar deadlift in week 1, cable pull-through in week 2, while the week-2 note said "one more set than last week". The picker varies its answer call to call. `substituteAvoidedExercises` now keeps one alternative per avoided exercise for the whole plan (falls back to the picker only when that day already has it). Re-applied Beginner · Full Body with "knees": Back Squat → glute bridge in all 8 weeks, Goblet Squat → 45° back extension in all 7, lunge → dumbbell RDL in all 8. Two spec tests. |
| R3 | A failed catalog fetch printed "No coach-built program fits … AI can build one" | `DONE` | `templates` stays null on failure (`catalogFailed`), so the schedule line stays silent, the matching moment ends immediately, and the payoff shows the browse card. |
| R4 | "N fit" and "Picked X" could name different programs; the "none fit" line was unreachable; the days count was clamped silently | `DONE` | The recommender ranks goal above schedule, so Strength at 6 days picks the 5-day Upper/Lower while "1 fit" meant the PPL. Third line now says "None fit exactly — showing the closest" unless the pick is one of the fits; `recommendationMatch` returns "closest" when the days or minutes fall outside the program; the card reads "5 days/week (the most it supports)". Verified live: Strength · 6 days · Home → eyebrow "Closest program to your goal", meta "5 days/week (the most it supports)". |
| R5 | "You can change anything later in Profile" was false for four of six answers | `DONE` (copy) | Profile edits goal, experience and equipment only. Review subtitle now says exactly that. ⚠ Days, preferred days, session length and work-arounds have NO editor anywhere: a "Knees" tag set in onboarding filters every plan until Dylan adds a Profile row for it (see NOT done). |
| R6 | Payoff card listed the template's rows verbatim while the server was about to swap some | `DONE` | Same hint line as the program screen under the list when work-arounds exist. |
| R7 | "Matched to your answers" while the recommender ignores equipment | `DONE` (copy) | Subtitle reads "Matched to your goal and schedule." Template cards carry no equipment field, so an equipment-aware scorer needs data first (NOT done). |
| R8 | A flagged row with no alternative vanished silently | `DONE` | The slot's `detailLine` (Home's subtitle) gains "N exercises removed for your work-arounds". |
| — | Live run, one-tap Start | `DONE` | `POST /plans` 201 with `applyWorkarounds`; landed on the plan list at "Week 1 of 8 · Strength · Upper/Lower"; Wednesday (today) = Upper A, Thursday = Lower A, Friday = Upper B, next Monday = Lower B — the partial first week and continuous rotation, straight from the database (week 1 has 3 slots, weeks 2–8 have 4). Backend log: `work-arounds ["knees"] swapped=30 dropped=0`. Home the next load: "Good evening, Rig! · Wednesday, September 9 · Week 1 of 8", today's card Upper A. |
| — | Live run, program screen | `DONE` | Beginner · Full Body with the saved answers (4 days, Mon/Wed/Thu/Fri, knees): sheet opened at "3" (the program's max), Mon/Wed/Fri (the 4 saved days do not fit 3), "First session Wed, Sep 9", and the "Exercises that load your knees / lower leg will be swapped" line. Applied: week 1 = Wed + Fri, weeks 2–8 = 3 slots. |
| — | Suites after the fixes | `DONE` | Frontend 45 suites / 682 tests, backend 62 / 865, `tsc` clean on both. |

Rig notes for next time: the Chrome tab counted as hidden for the whole run, so Reanimated's
frame loop paused and every `Rise`/`withTiming` entrance froze at opacity 0 — the DOM and
network were fine (verified by page text and a forced-opacity screenshot), only the
screenshots were blank. Not an app bug; bring the window to the front or verify by page
text. The window-activation script was blocked by the permission classifier.

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| The Groq model swap and the AI copy (item 1) | Dylan's, in progress. |
| Profile rows for days per week, preferred days, session length and work-arounds | None of the four has an editor anywhere in the app (the review agent checked). Work-arounds matter most: a tag set in onboarding cannot be cleared. Dylan's call on placement; the setters already exist in `UserPreferencesContext`. |
| An equipment-aware recommender | Template cards carry no equipment field; a Home-preset user is still recommended a barbell program by goal. Needs data on the templates first. |
| Session titles after a swap | "Lower A · Squat" keeps its name when the squat is swapped out. Titles are authored strings; renaming them safely is a small follow-up. |
| The swap picker's taste | Back Squat → glute bridge for a full-gym user is the catalog picker's choice (`pickReplacement`), not this batch's. |
| An equipment "something back" line | Not computable from the catalog cards. |
| Auto-generate on the AI exit | Product call still open (default > 1 week). |
| Motivation question, HDYHAU, notification prime | The review put them after the payoff, later. |
| Dropping Endurance from the goal list | The AI path builds for it; the card just stops calling a hybrid program a match. |
| On-device / browser run | No e2e covers onboarding; the auth-bypass rig was not used. Unit + type only. |
| Commit | Not asked. |

---

## 2026-09-09 (later) — Onboarding research: what to add, how to end, where to skip

Dylan wants to rework onboarding next and asked four things: why other gym apps ask so
much more and what to add; whether generating a plan at the end is right or the user
should explore first; where "Skip" belongs; and whether `github.com/emilkowalski/skills`
is "Apple's design and flow" as a friend said. **Research and recommendations only —
nothing built.** Full write-up: [`onboarding-review-2026-09.md`](./onboarding-review-2026-09.md)
(registered in INDEX.md).

| # | Task | Status | What and why |
|---|------|--------|--------------|
| 1 | Verify the flow against the code | `DONE` | Nine screens, seven questions, four required. **Correction to the June doc and to this morning's block:** onboarding no longer auto-generates; it ends on a payoff screen (recommended 8-week template / AI form / explore). `weeks: 1` only affects the AI-form exit. Found one real friction: `TemplateDetailScreen` seeds days and weekdays from the template's defaults, so the fastest exit re-asks step 3. |
| 2 | Why others ask more | `DONE` | Three forces, none about the plan: the investment effect before a paywall (Lose It!, Me+, Noom's 113 screens), personalisation uplift, and post-ATT attribution / permission priming. Counter-evidence: top-decile apps cluster at 3–5 questions / 90–180 s; skippable flows complete ~25% more. Recommendation: add session length (the one input that changes the plan), consider a motivation question, give one line back per step; do not add body stats, Health, or a quiz funnel. |
| 3 | Generate vs explore | `DONE` | Apple HIG: postpone nonessential setup, get to the action. Activation data: a finished first workout on day one is the best predictor of day-30 retention. Fitbod builds ONE workout instantly; Duolingo delays sign-up. Jim's payoff screen is already the right shape. Fix around it: one-tap "Start this program" with today as day 1, show the first session on the card, and make the AI exit generate from the answers (auto-generate for that exit only, default > 1 week — product call) instead of landing on the form. |
| 4 | Skip | `DONE` | Required only where the plan is wrong without it (goal, experience, frequency, equipment). Explicit "Skip" on work-arounds and name; move weight out to the tracker's first open. Anything added later (HDYHAU, notifications) goes after the payoff. |
| 6 | Visual of the proposed flow | `DONE` | Design canvas "Jim Onboarding" — https://claude.ai/code/artifact/c4ee541d-6c81-48a2-b532-7cf94d1b7615 — twelve artboards drawn with the app's own tokens (light palette, the onboarding screen's cards, chips, segments and footer): welcome, six question screens, the payoff with the first session on the card, the AI "building" screen, a Motivation test candidate, "Later, in context", and a rationale board (want / need / evidence per screen). Static mockups, not a clickable prototype. Working files in the session scratchpad (`onboarding-canvas/build.mjs`), regenerable. Checked in Chrome before saving: every frame renders; the editor lazily mounts about ten previews at a time, so an unfocused frame can show a hatch until clicked. |
| 7 | The in-depth asks (height, weight, sex, maxes, "your gym", Apple Health, projections, …) | `DONE` (doc §6) | Each judged by three tests: does Jim consume it, would the person see the difference, what does it cost. What depth buys the big apps is calorie maths, a paywall that sunk cost pays for, and a starting-load model trained on other people's workouts — none of which Jim has. Two are worth building as FEATURES with their own moment: a strength level on the Athlete card (bodyweight + sex, asked when the first lift exists; Liftoff's rank model is the evidence) and workouts written to Apple Health (primed after the first finished session; Move ring; needs a HealthKit module and a dev build, iOS only). Finding: the catalog already stores ~40 machine-level equipment ids but `EQUIPMENT_MAP` folds them into one "Machine" label and gates by label — so "machines at my gym" is a gate + a checklist, not a data project. Height, projections, body fat: no. Preferred exercises: feed the hearts in, no question. |
| 8 | The harsh walkthrough (doc §7) | `DONE` | Twelve findings, three of them the app promising what it does not do: (1) `GROQ_MODEL` still names the model Groq retired on 2026-08-16, so "Build a custom plan with AI" is the rule-based builder and the user is never told (fallback goes to logs/Sentry only); (2) injury TAGS are honoured on the generated/rule-based path but the recommended-template path never reads them; (3) "Other notes" is prompt-only, so it does nothing for anyone today and never touched templates — drop it from onboarding. Also: removing the weight step removes the only place the lb/kg unit is set (infer from region); "Start today" can be false (template start logic can push to next Monday); Endurance/General fitness map to the "balanced" bucket; 2 days/week missing though 4 of 5 templates support it; the two-goal picker is a hidden mode. Loading moment: the AI exit's "Building your first week" is real work; for the template exit add a 1.5–2.5 s honest matching moment (Buell & Norton 2011, labor illusion), tap to skip, never a fake spinner. |
| 5 | The GitHub repo | `DONE` (doc §4) | Delegated to a background agent after a first look. It is Emil Kowalski's twelve AI-agent skills (ten web animation, one Swift, one toast-library docs), MIT; not Apple's app flows. Worth installing: `animate-expo` and `review-animations` (copied, not symlinked). It flagged three real things in `OnboardingScreen.tsx`: `ZoomIn` from scale 0 on the review checkmark, no `useReducedMotion`, and the same `FadeInDown` whether going forward or back. |

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| Any onboarding code | Dylan asked for research and opinions first, and has their own list of fixes to add. |
| Fetching Fitbod's help centre and the Hevy teardown | Both 403 to the fetcher; the Fitbod facts come from App Fuel, Yahoo and TechRadar instead. Hevy has no usable 2025 teardown; not needed for the conclusions. |
| A verbatim copy of the current HIG onboarding page | The page is script-rendered; quotes come from a maintained mirror of the same text and from the older "First Launch Experience" page. |

---

## 2026-09-09 — "My workouts disappear" (tester report) — found, simulated, FIXED (uncommitted)

A tester reports workouts added by hand, by the plan, or otherwise stop sticking and
vanish after a while, sometimes within hours. Traced every write path for a workout
(Calendar day edits, Quick Workout, Exercises-tab add, plan apply, templates, shares)
from the screen to the database. Nothing on the server deletes a user's workouts on its
own: the only deletes are account deletion, the client's own remove-slot call, and a
share double-accept heal. The losses are all on the **client**, in
`frontend/src/lib/planCalendarPrototypeStore.ts`. Three sessions in one day: the
investigation, the simulation suite, then the fix. All frontend, so OTA-shippable.

| # | Finding | Status | Where | What and why |
|---|---------|--------|-------|--------------|
| 1 | **Day edits live in memory and are never persisted to the device** | `DONE` | store: `additions` / `replacements` / `removals` / `customDays` | These four maps are what "+ Add Exercise", Replace, Remove and an out-of-plan Quick Workout write to. The AsyncStorage snapshot (`jim_calendar_session_v1`) saved set logs, skips and moves, but **not these**. So whenever the server write did not happen (rows below), the workout was visible in the UI, then gone the moment iOS evicted the app from memory. That is the "after a couple of hours" shape exactly. **Fix:** all four maps, plus the set of dates still owed to the server, go into the same snapshot. |
| 2 | Server write silently skipped: **no plan** ('empty' mode) | `DONE` | `queuePersistDayEdits` returned when `!livePlan`; `addQuickSessionToday` out-of-plan branch | A user with no active plan can still tap "+ Add Exercise" (the row is unconditional) and "Quick Workout" (Day view and Home). Everything stayed session-local. Worse, `syncDayCompletion` returned early with no plan, so a finished quick workout **never posted a workout log** either. **Fix:** `persistDayEdits` creates a plan on demand (`POST /plans`, one slot, anchored so the edited date is inside it), the same thing the Exercises tab already did on `NO_CURRENT_PLAN`; the completion sync no longer needs a plan (the ad-hoc-workout path was already there behind the gate). |
| 3 | Server write silently skipped: **multi-slot day** | `DONE` | `persistDayEdits`: `if (slots.length > 1) return;` | A day gets two slots from Quick Workout "add" landing, or from the old Exercises-tab add-to-plan. The calendar merges both into one list, but every later edit on that day was session-only forever, with no message. **Fix:** the day is rebuilt as ONE slot (add the new, remove every old), titled "A + B", typed strength unless every source is cardio. |
| 4 | Server write silently skipped: **plan fetch in flight** | `DONE` | `queuePersistDayEdits` / `persistDayEdits` checked `liveStatus === 'ready'` | Week and Month refetch on focus (10s throttle) and set the store to 'loading'. An edit made while that fetch was out (slow or cold Render) was dropped from persistence, not queued. **Fix:** the date is marked owed first; `persistDayEdits` leaves it owed while the plan is unknown, and every successful fetch drains the owed set. |
| 5 | Server write **failed** (network, 4xx) → dropped, no retry, no UI | `DONE` | `persistDayEdits` catch → `console.warn` only | The edit stayed on screen as if saved. The offline footer even said "changes stay on this device", which was false (see #1). **Fix:** stays owed and is retried on the next plan fetch (focus, pull to refresh, cold start, and now **foreground** — Home listens to AppState), and on every later edit; the Day view footer says "Kept on this phone — it syncs to your plan once the app can reach the server" (`isDayEditPending` / `isDayCompletionPending`). |
| 6 | **Plan past its last week goes blank in the Calendar** | `DONE` (as a product call, not a bug) | store `programWeekForDate` / `programWeekInfoFor`; `planCalendar.ts`; Home | The Calendar matched the exact week only, while Home (since July) rolled a finished plan forward and said "repeating week 1" with a Start card for a day the Calendar called rest. Onboarding's plan defaults to **1 week**, so this was the "workouts from the plan disappeared" half of the report. First fix rolled the Calendar forward too. **Dylan's call, same day: no repeating anywhere.** An empty week is honest (travel, a break, a plan not generated yet). So: roll-forward REMOVED from `resolveProgramWeekForCalendarOffset` (new `after_program` status; `lastContiguousProgramWeek` deleted), Home gets a `plan_ended` card ("Your plan has ended · Generate a new plan · Open Calendar") instead of the repeat banner, and the Week screen shows a "Your plan has ended" banner with a Generate button over the empty week. **What does not depend on the window: saving.** `programWeekForDate` maps any date from the anchor on, so an edit, a Quick Workout or a move on a week past the plan's last EXTENDS the plan (a slot at that week number) instead of being kept on the phone; the move picker's 'beyond' state is gone. Only pre-anchor dates stay local. |
| 7 | Edit on a stale base can **overwrite** server exercises | `DONE` | `persistDayEdits` rebuilt the slot from `livePlan` | Day view never refetches on focus. Exercises added through another surface (WorkoutDetail "add to workout" syncs plan_exercises server-side) were not in `livePlan`; the next calendar edit on that day rebuilt the slot without them. **Fix (button pass):** `persistDayEdits` fetches the plan FIRST; if the day's base rows changed since the last fetch, `rebaseDayOverlays` carries the edits across by exercise identity (remove Bench removes Bench wherever it now sits; a replacement follows its target; an exercise the other surface added is kept). Three tests. **Related race fixed earlier:** a plan fetch in flight while a slot write completed used to clobber the fresh day with the pre-write answer; `writeSeq` makes that fetch ask again. |
| 8 | Pre-anchor day edit lands on the wrong date | `DONE` | `persistDayEdits` `Math.max(1, programWeek - offset)` | Adding to a day before the plan's anchor Monday clamped to week 1, so the slot was created on next week's same weekday and the local overlay for the tapped day was cleared. **Fix:** no slot is written for a date the plan cannot hold; the exercise is kept on the phone (persisted) and logging still mints its ad-hoc workout. |

### The fix, in one paragraph

`persistDayEdits` is now a retried queue instead of a best-effort call: an edit marks its
date owed (on disk), the write runs when the plan is known, and the date is cleared only
after the server confirms. A write that completes after a NEWER edit on the same day
re-expresses the current day against the new base (drop all base rows, append the current
list) and stays owed, so a mid-flight edit is never lost (tested). Quick Workout goes
through the same path now instead of writing its slot inline, which is what makes it
survive a failed write. Finished days whose log POST failed or ran offline are owed the
same way (`pendingCompletions`) and retried after the next fetch; a reopened day with an
owed log posts the whole day as one log rather than a delta that would drop the morning.
The first plan a device ever sees no longer wipes the overlays (only a genuinely different
plan id does), so edits made before the first successful fetch survive it.

### Verification

- `frontend/src/lib/planCalendarPrototypeStore.persistence.test.ts`: 25 scenarios, all
  passing — the 12 former `it.failing` ones (findings 1–5, 8) flipped to plain `it`
  (finding 5's rewritten for the no-repeat rule: empty week reported as 'after', Home
  says `plan_ended`, and an exercise or Quick Workout added to that week still lands on
  the server as week 3 of a now-3-week plan), plus the new ones: the whole "no signal at
  the gym, no plan yet" story (session, sets and log all reach the server on reconnect),
  an edit during an in-flight write, a refetch served before a write landed, the pending
  indicator, and Quick Workout "add" / "replace" on a plan day. `planCalendar.test.ts`
  and `homeToday.test.ts` updated for `after_program` / `plan_ended`. Frontend: 43 suites
  green, `tsc --noEmit` clean.
- **Not** run on a device or in the web rig. The store has no React in it and every new
  import (`createPlan`, `lastContiguousProgramWeek`) is already used elsewhere in the app,
  so the runtime risk is small, but the Day footer copy, the Week header, and the
  foreground refetch on Home want one look on a phone.

### The simulation suite (added later the same day)

`frontend/src/lib/planCalendarPrototypeStore.persistence.test.ts` — 17 tests that drive the
REAL store through a fake server and a fake AsyncStorage, then simulate what happens to a
phone hours later: the app is evicted and reopened cold (`jest.resetModules` + re-require
with the fake disk kept). Findings 1, 2, 3, 4, 5 and 8 each have a scenario written the
way the tester experienced it ("I added Cable Fly, came back later, it was gone").

- **12 scenarios are `it.failing`** — they fail on the user-facing assertion today (verified
  by running them as plain `it`: every one fails on "Cable Fly not in the day after reopen",
  "server never received the write", "no /workout-logs POST", "Bench Press is back",
  "Calendar Monday empty", "exercise landed on next Wednesday"). Jest keeps the suite green
  while the bug exists and **fails the test the day it starts passing** — the cue to flip
  it to a plain `it`. Never delete one to make the suite green.
- **5 controls are plain `it`** and pass on real behaviour (healthy-server add, rest-day add,
  Home's roll-forward, the two-slot merge, and one that documents finding 8's wrong-date
  landing and should be deleted when fixed). They prove the harness reflects what works,
  so a failing scenario beside them is a defect and not a broken rig.
- Frontend: 43 suites / 648 tests green, `tsc --noEmit` clean. The suite costs ~24s
  (each reopen waits out the store's real 300ms snapshot debounce).
- Finding 7 (stale-base overwrite of an exercise added through another surface) has no
  test: it needs a decision on the fix shape (refetch on Day focus vs. server-side merge).

### Verification, and its limits

- Code-traced only. **Not reproduced on a device** and **not confirmed against production data**:
  the read-only SQL probe (users with more than one active plan, duplicate-slot days,
  0-based week numbers, orphaned workouts, slots created after their plan) was blocked by
  the session's permission classifier. Script left at `backend/logs/probe-disappearing.js`
  (gitignored); it is SELECT-only and reads `backend/.env`, which is prod.
- No test covers `persistDayEdits`; `planCalendarPrototypeStore.test.ts` only tests
  `plannedExerciseFromCatalog`.

### The button pass (Dylan: "one more check that all the buttons are synced")

Every action that creates, edits, finishes or moves a workout, traced to its write, and
every surface that describes today, compared. Found and fixed five things; the rest held.

| Action | Where | Path | Verdict |
|--------|-------|------|---------|
| Add Exercise · Replace · Remove | Day view (picker, hold menu) | overlays → owed → `persistDayEdits` (fetch first, rebase by identity, one slot, retry) | ✓ |
| Quick Workout, replace or add | Home row, Day view door, day ⋯ sheet | same path; plan on demand when none | ✓ |
| Complete Workout · Finish early | Day view, set deck | `syncDayCompletion`; owed + retried on failure/offline | ✓ |
| Save this workout | Finish screen | `createWorkout` + save; failure shows an error state | ✓ (no retry, but visible) |
| Do it today · Move · Swap | ⋯ sheet, week hold | `commitMoves` → server; failure refetches + shows error; nothing local to lose | ✓ |
| Apply plan · template · shared plan | Preview, Templates, Redeem | `createPlan` / accept, then **forced** calendar refetch (added) | ✓ |
| Add to workout · Remove · Regenerate | Exercises tab, workout detail | `updateWorkout` (server syncs the slot), then **forced** calendar refetch (added) | ✓ |
| Skip · Undo skip | Day banner, ⋯ | local + fire-and-forget server PUT/DELETE | ⚠ no retry (see below) |

| # | Contradiction or gap | Fix |
|---|----------------------|-----|
| C1 | **Home chose its today card from the server's plan while the Calendar answered from the store**, so a pending edit split them: "Start workout" over a day the Calendar called rest; "No plan yet" over a Quick Workout waiting to be saved; a title from the server with muscle chips from the store. | `todayStatus` in `HomeScreen`: the store answers first (any exercises today → the workout card, title/meta/chips all from the store), the server's status is used only to say why an empty day is empty, and a server "scheduled" over an empty store day reads as "Nothing scheduled". Week tiles and the hero no longer require 'live' mode, only "not loading". |
| C2 | Home's "Generate my plan" / "Generate a new plan" buttons opened the Calendar month, not the generator. | `goToGeneratePlan` navigates to `GeneratePlan` inside the Calendar stack. |
| C3 | Edits made from the Exercises tab (add to workout), workout detail (remove, regenerate) and share redeem changed the plan server-side, but the Calendar kept the old copy until a throttled focus refetch (up to 10s), and a calendar edit inside that window rebuilt the day from the stale copy. | `refreshLiveCalendarData(true)` after each of those writes, and after plan apply. |
| C4 | Finding 7 (above). | Fetch-first + rebase by identity in `persistDayEdits`. |
| C5 | **New with persisted edits:** the snapshot is one per phone, so a second account signing in (Dylan's own 2-account share testing does exactly this) would inherit the first account's owed edits — and with plan-on-demand, have them written into its own plan. | `noteCalendarAccount(userId)` (Home calls it on mount, before the first fetch, and the fetch waits for it): a different account than the snapshot's drops every edit, log, skip, owed write and history cache, and refetches; the same account keeps everything. Two tests. |

Verification: 30 scenarios in the simulation suite (25 → 30), whole frontend green, `tsc` clean.
Still not run on a device: the Home card logic is the one piece here that only a phone (or the
web rig with a fake session) can show; the store parts are covered by the suite.

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| Skip / undo-skip retry | The server write is fire-and-forget; a skip made offline that fails its PUT reads as a miss to the crew until the next `syncSkippedDaysFromServer`, which then overwrites the local mark. Same owed-queue shape would fix it; out of scope for workouts, noted for the crew work. |
| Set logs after an external base change | Logged sets are keyed by displayed row; when another surface changes the day's rows while sets are logged on this phone, the rows can shift under them. Rare (a day being trained here and edited elsewhere at once); the rebase keeps the sets rather than dropping them. |
| Prod DB probe | Blocked by the classifier; `backend/logs/probe-disappearing.js` is ready for Dylan to run. Would confirm which path the reporting tester hit. |
| Device / web-rig run | Jest and tsc only. The Day footer copy, the Week header wording and Home's foreground refetch want a look on a phone. |
| Onboarding's 1-week default | Product call. With no roll-forward a one-week plan ends after its week and the user is asked to generate the next one; a longer default (4 weeks?) is a separate conversation. |
| A "Generate" door on the Month and Day screens for ended plans | Month already has "Generate a Plan"; the Week banner and Home card cover the landing surfaces. The Day view's rest card stays plain. |
| 0-based legacy plans | An edit on one still sends `weekNumber: 0` and the DTO rejects it; the edit now stays owed on the phone instead of vanishing, but never lands. The probe would say whether any exist. |
| Commit | Not asked. Six files changed, listed in the session summary. The What's New line ("Calendar edits that stick") was added to the UNSHIPPED card in place per the standing rule; drop it if it reads as a bug fix. |

---

## 2026-08-28 — Crew feature review (code, not concept)

Dylan asked how to improve the Crew page. **The evidence sweep in memory
(`reference_crew_social_mechanics_evidence`) is unambiguous: Crew's ceiling is
DELIVERY (push), not design — ship, don't add.** So this was a correctness review
of the crew code rather than a feature hunt. Four real defects found and fixed.

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 16 | Crew made in the evening lost its first streak day | `DONE` | `4a0bbd6` | `crewCreatedIso` is the **floor the crew streak counts back to**, built with `crew.createdAt.toISOString().slice(0,10)` — the UTC date. `createdAt` is a real timestamp, so a crew started 9pm on the 27th in US Eastern reads as created on the **28th**, and the streak loop breaks on `d < floor` before counting that afternoon's session. Every other timestamp in `getSummary` already used `localDateIso`. ⚠ The `weekAnchorMonday` slice two lines above looks identical but is **correct** — that column is `@db.Date`. Difference is the column type, not the style. |
| 17 | Pound count could tick up then snap back | `DONE` | `59f12a5` | `toggleKudos` returned `count({ toUserId, eventRef })` while the summary that repaints the chip queries `crewId: crew.id`. They diverge once a recipient has been in another crew that still exists. Same failure shape as the old `kudosWeek`/`kudosLatest` bug: not a wrong write, two different questions rendered as one number. |
| 18 | Badge only noticed activity on a **cold start** | `DONE` | `7654417` | `refreshCrewBadge` ran once on mount, and the tab navigator mounts once per launch. Background the app overnight, come back, and the dot still showed yesterday until a force-quit. With no push, a foreground is the *only* moment the app can notice a crewmate trained — so this was most of the mechanic missing. |
| 19 | Crew screen showed yesterday's week after a foreground | `DONE` | `93237e9` | `useFocusEffect` covers arriving at the tab, not returning to the app while already on it. ⚠ Gated on `useIsFocused`, and **that gate is load-bearing**: bottom tabs keep the screen mounted, and `load` ends in `markCrewSeen`, so an ungated listener would clear the Crew dot on every foreground while the user sat on Home — marking activity seen that was never shown. |

### Verification

- Backend 858 tests, frontend 631, both typechecks clean.
- The streak fix is pinned by **two new tests on `crewStreakDaysOf`** that assert the
  consequence, not the spelling: a crew created the same day counts that day, and a floor
  one day late returns **0**. The existing specs passed `crewCreatedIso` in as a literal,
  which is exactly why the service's own conversion was never covered.
- ⭐ **The foreground work was verified behaviourally in the rig**, not just compiled.
  RN-web maps `AppState` to `visibilitychange`, so faking hidden→visible is possible:
  on Crew a foreground fired **+2** summary calls (badge + screen), on Home **+1**
  (badge only, screen correctly stayed out), and **0** while hidden. That second number
  is the proof the focus gate holds and the badge cannot be cleared unseen.

### The join funnel, driven end to end (33 checks, all PASS)

The prod probe said the join path had never been exercised for real, and it is what
has to work the day a build ships — so it was driven against a **local throwaway
Postgres + local API** (recipe in `.claude/skills/verify/SKILL.md`; **no prod writes**,
which matters because prod is the data the probe above measured).

Verified: create → invite → join with the code typed every realistic way (lowercase,
dashed, space-padded); unknown / too-short / ambiguous-character codes all rejected
with human messages; already-in-a-crew blocked (409); the summary readable immediately
after joining and showing every member; self-pound, pounding a session that never
happened, and pounding across crews all refused; lead-only actions enforced for remove
and rotate; a rotated code killing the old one; the **10-person cap** holding at the
eleventh with a human message; leaving freeing a slot; a crewless user getting a clean
`crew: null` rather than a crash; the last member out deleting the crew so its code
dies with it; Rest up round-tripping.

**Nothing failed.** The funnel is not the risk — it is the best-defended part of the
feature. `requireLead` returning 400 rather than 403 is deliberate: the message names
who the lead is ("whoever has been in the crew longest"), and leadership transfers on
its own when the lead leaves, since there is no lead column.

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| **Any new crew mechanic** | The evidence sweep lists the replicated nulls: assigned accountability buddies (PNAS, N≈250k, n.s.), all-or-nothing crew goals (Patel, p=.96), ordinal ranks in small groups (lowers the most active), naming who owes. The buildable versions are the ones that tested null. |
| `@@unique([fromUserId, toUserId, eventRef])` missing `crewId` | The toggle's `deleteMany` can still reach a row in a crew the user has left, and scoping the delete without widening the constraint would make a re-pound hit P2002 and report `pounded` with no row to show. Needs a **migration + backend-first deploy**, so it wants a session that can coordinate that. |

---

## 2026-08-28 — accessibility round 2 (the rest of the audit)

Worked the open a11y items from the previous block (D–G). Frontend 631 tests,
typecheck clean, all four commits pushed.

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 8 | 24 colour-only selection controls | `DONE` | `6da0060` | `theme/colors.ts` states the rule outright — colour only *reinforces* identity, it never carries it — and the newer screens honour it. `GeneratePlanScreen` did not: goal, secondary goal, training days, location, experience, equipment, duration, the custom-split builder, hybrid ratio, detail level, progression, avoid chips, cardio modality, focus priority all changed **only colour**, so a VoiceOver user heard four options with no way to tell which was active. The boolean was already computed on each line to pick the "selected" style. |
| 9 | Remaining unlabelled controls | `DONE` | `6da0060` | 2 per-day time-cap steppers (the only unlabelled ones of the ten — an oversight, not a convention), 7 numeric fields announcing a bare "45", 2 full-screen dismiss overlays that put a large unlabelled button in front of the sheet. |
| 10 | Split-tile info button was unreachable | `DONE` | `6da0060` | Nested inside a tile that is itself an accessibility element, so with VoiceOver on its Alert could never be opened. The text is now one constant used twice: the Alert for sighted users, an `accessibilityHint` on the tile for everyone else. |
| 11 | Four tap targets under 44pt | `DONE` | `a692fd2` | The live workout's set-complete button (40×40, **most-tapped control in the app**), Home's What's New (32×32) and profile (42×42) buttons, and `WorkoutLikeButton` (42×42, whose sibling already had `hitSlop: 10`). Each checked for neighbours first — slop that overlaps trades a missed tap for a **wrong** one. |
| 13 | Three status dots that were colour-only | `DONE` | `6de2d8a` | Each was the **only** signal that something happened, with no spoken equivalent: the Crew tab's unseen dot (the tab said "Crew" either way — `crewBadgeHasUnseen` lived inside the icon, so the subscription became a small `useCrewUnseen` hook the navigator holds), Home's What's New badge (constant label), and the crew avatar's story ring (gold = trained today, blue = training today; the row label never mentioned today). **Verified in the rig**: labels actually exposed as `"What's new, unread"` and `"Crew"`, all four tabs still render after the hook move, zero page errors. These map to `aria-label` on web, so unlike `accessibilityState` they *can* be checked here. |
| 12 | Three fixed-height boxes vs Dynamic Type | `DONE` | `6e1897a` | Home's week tile (56pt box, two 11pt rows, no `numberOfLines`), the day-cap input, the picker's month-nav button. All → `minHeight`, the pattern used elsewhere. `navBtn` checked for the circle trap first: its radius is a fixed token, so it is a rounded square. |

| 14 | Three labels describing something other than the screen | `DONE` | `40ff83f` | Home's week tile draws the muted dash for rest, skipped **and** no-muscle days but only said "rest day" for the first — a skipped day announced its workout title as if still scheduled. A crew member's row is two sibling touchables opening the same sheet, both with the identical label, so every member was announced twice; the second is the week strip and now names that. The pound chip's explicit label was **replacing** the synthesized one and silencing the count beside it. |
| 15 | Goal / experience pickers showed no current selection | `DONE` (half) | `e33216f` | The list rendered every option identically, so VoiceOver read four goals as if none were active. Added `accessibilityState`; the values were already in scope. ⚠ **Half a fix on purpose** — a sighted user cannot see the current choice either. See NEEDS-DYLAN below. |

### Verification, and its limits

- Ran the codemod as a **dry run first**, printing all 24 extracted conditions before
  applying; 22 matched the multi-line shape, 2 inline ones were done by hand. Output read
  back site by site afterwards.
- Booted the rig, navigated Calendar → Month → **Generate a Plan**: the screen renders,
  **zero page errors**. That is the check that matters for a codemod in a 3,900-line TSX
  file, since `tsc` alone would not catch a mangled JSX tree.
- ⚠ **`accessibilityState` cannot be verified on web.** react-native-web derives
  `aria-selected` from `accessibilitySelected` alone, never from `accessibilityState`, so
  the rig reports 0 `aria-selected` elements even though the props are correct.
  `accessibilityState` **is** the right API on iOS/Android, where every tester is —
  **do not "fix" this by switching to the RNW-only prop.**
- ⚠ `minHeight` ≥ `height`, so those three render **identically** at the default text size.
  That is what makes the change safe and also why nothing visible changed. Needs a device
  with a larger text size to actually exercise.

### Deliberately NOT done (with reasons)

| Thing | Why |
|-------|-----|
| Crew pound chips (`pump`, `dayPound`) | Real measurements (~26pt and 18pt), but the day tile above already extends `hitSlop` `bottom: 4` into the 4pt gap, and on a member row the chip sits between the row itself (opens a sheet) and `personBottom`. Slop there turns a near-miss into a **wrong action**. Needs a device, not a measurement. |
| Picker **visual** selected state | The Profile goal/experience list has no checkmark, no tint, no trailing tick — confirmed on screen: with goal = Strength, the row above reads "Goal — Strength" while "Strength" in the list looks identical to the other five. Choosing how that should look is a design call. `NEEDS-DYLAN`. |
| `dayPound` height → `minHeight` | Coupled to `dayPoundSpacer`, which exists to hold untrained columns to the same height so tiles stay on one baseline. The spacer has no content, so it cannot grow with it — converting one without the other breaks the alignment it was written to protect. Needs a shared measurement. |

### Rig facts worth keeping

- **Metro under `CI=1` does not watch files.** The server was serving a stale bundle after
  edits; restart with `--clear`. (Already in memory; it bit again here.)
- The Calendar tab can restore to **Week**, not Month. The planning rows ("Generate a
  Plan", "Quick Workout") live on Month — click back at `(26, 32)` to get up the stack.
- Home shows "Plan data unavailable" with no backend, so the **week tiles do not render** —
  frontend-only boot cannot verify anything that needs plan data.

---

## 2026-08-27 → 08-28 — post-ship hardening

**Started from:** build 27 shipped to internal testers; repo cleaned 30 branches → 1.
**Ended:** 18 commits on `main`, all pushed, all three CI workflows green on `a33bfd0`.
**Suites:** backend 856 tests, frontend 631, both typechecks clean.

### Security

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 1 | Preview IDOR | `DONE` | `d52bea3` | `POST /workouts/preview` took `@Body()` and **no caller identity**, and `GenerateWorkoutDto.userId` carried validators, so `whitelist: true` KEPT a caller-supplied id. The generator read that user's recent workouts + last logged weights and fed them to the LLM, which returns them as `weight`/`notes`. Crew summaries publish every crewmate's `userId`, so targets were not secret. `POST /workouts/generate` never had it. Two defences: DTO field left bare so the pipe strips it, and the service overwrites from `@UserId()`. **⚠ The bare field is load-bearing — adding validators reopens the hole.** Verified: 3 new tests in `preview-scoping.spec.ts`. |
| 2 | Unbounded LLM fan-out on plan routes | `DONE` | `3d876d7` | `POST /plans` + `PATCH /plans/:id` call `createWorkoutsForPlan` with `fillAllEmptySlots: true`, which **skips the date gate**, so every slot without exercises = one sequential Groq call. `slots` had no size cap; neither route had `AiThrottlerGuard`. Now bounded three ways (`@ArrayMaxSize(120)` slots, `@ArrayMaxSize(60)` exercises, a per-request generation cap that degrades gracefully) plus the guard. Checked first that nothing legit depends on it: every client path sends slots that already carry exercises, and `PATCH /plans/:id` has **no frontend caller at all**. |
| 3 | Six lenient ownership checks | `DONE` | `3d876d7` | `plan.userId && plan.userId !== userId` made an **owner-less plan readable and writable by any authenticated user**. Tightened to a plain `!==`. **Probed production read-only first: 0 orphan plans of 27**, so no real access lost. (6 orphan `workouts` of 162 exist but `WorkoutsService.findOne` was already strict.) |

### Accessibility

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 4 | Sheets were unusable with VoiceOver | `DONE` | `540db79` | RN defaults `accessible` to **true** on `Pressable`/`TouchableOpacity` (`accessible: accessible !== false`, verified in `node_modules` at 0.81.5). On iOS that sets `isAccessibilityElement`, which VoiceOver will not traverse into. `SheetModal` tells every consumer to make the card a tap-guard `Pressable` — so the thing stopping a tap from dismissing was **swallowing every control inside**. 20 containers now set `accessible={false}`; each wrapping backdrop was checked to have its own Cancel first. |
| 5 | Controls that announced nothing | `DONE` | `540db79` | Reps + weight in a live workout (**the most-used inputs in the app**, both announced as a bare number); 3 stateless custom toggles; equipment rows that swallowed their own `<Switch>` so on and off sounded identical; month cells reading raw ISO (`2026-08-27` spoken as digits) while dropping the workout entirely; date-picker cells; icon-only buttons (month nav, close-day, back). |

### Cleanup

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 6 | ~1,260 lines of dead code | `DONE` | `a33bfd0` | 6 orphaned components (836 lines) + the uncollected half of the `WorkoutSession.tsx` deletion (`848d7f0`). **⚠ `saveWorkoutLog` was a complete SECOND implementation of workout logging** and the only `/workout-logs` POST in the service layer — exactly what someone finds by grep and "fixes". Live path is an inline `api.post` in `planCalendarPrototypeStore.ts`. Also removed `supertest` + a `test:e2e` script pointing at a `backend/test/` that does not exist; **lockfile resynced** because both CI workflows run `npm ci`. |

### Earlier the same session (already pushed before the hardening pass)

| Commit | What |
|--------|------|
| `320e377` | 401 sign-out race — Supabase rotates the refresh token, so two concurrent 401s signed users out despite a successful refresh. `lib/singleFlight`. |
| `38c857d` | Session clock in the header + an e1RM chart that can actually show progress. |
| `a8aa0b0` | e1RM personal bests — full-stack and additive; a PR won on a lighter bar now counts. |
| `e0a2efc` | A loaded carry booked 3,150 lb — timed rows log seconds in the reps field, corrupting persisted `totalVolume`. |
| `ef143cc` | Silent LLM degradation now reported — the Groq outage ran 11 days because the generator catches the failure and returns a rule-based plan. |
| `b70e645` | `GET /workout-logs` with no params returned every log with every set inline. Now defaults to a year, caps at 750. |
| `8a89790` | A failed exercise load no longer claims the exercise does not exist. |
| `491c2f7` | Preview: moving a workout onto an occupied day doubled it and silently dropped a session. |
| `5175aa3` | What's New — show that the release list scrolls. |
| `2270714` | Corrected six stale items in the July action checklist. |

### Verification performed

- Backend 856 / frontend 631 tests, both typechecks clean.
- **CI green on `a33bfd0`** — Backend CI, Frontend CI, Gitleaks. This is what proves the
  lockfile resync was right; local `node_modules` would have hidden a mismatch.
- **Rig boot after the deletions**: app bundles all 2,923 modules, all four tabs render,
  **zero page errors**.
- **Sheet behaviour after the a11y change**: sheet opens, a tap inside the card does *not*
  dismiss, the button still closes it. This was the actual risk of `accessible={false}`.
- Production probed read-only for orphan-plan counts before tightening ownership.

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| Preview "Swap Workout" (audit 4.5) | **Confirmed real**: `handleReplaceWithType` writes the card to `planData` but nulls the session in `planDraft`, so Apply emits an exercise-less slot — invisible to the calendar *and* the crew streak. Every fix changes product behaviour. `NEEDS-DYLAN`. |
| Plan management IA | `getPlanById`/`updatePlan` had zero callers (now deleted); there is still no list endpoint. Needs an IA decision + the 5.13 delete-semantics call. `NEEDS-DYLAN`. |
| `planDisplayName.ts` | Only its own test calls it, but it plausibly belongs to the rename flow. Deleting it means deleting the test too — a different decision. |
| `MAX_CHANGELOG_ENTRIES` | No code reads it, but it is what the pruning-rule comment points at. |
| `runPipeline` | Test scaffolding (runs the pipeline with mock stages 5–6), not dead product code. |
| `TouchableWithoutFeedback` in `AuthScreenLayout` | Keyboard-dismiss wrapper; RNW stubs `KeyboardAvoidingView`, so the risk is unverifiable from the rig. |
| Groq model swap | Dylan is picking the replacement himself. |

### Traps worth not re-learning

- **`frontend/dist/` is a gitignored 85 MB stale web build.** Its minified names produce
  false grep hits and it predates several deletions. Exclude it; a repo-root `grep -r`
  times out on it.
- **Skia `PictureRecorder` page errors in the web rig are pre-existing noise.** They appear
  non-deterministically (0 on one run, 105 on the next, *identical code*). `JGlyph.tsx` has
  a try/catch **and** a `GlyphBoundary` that degrades to a text "J". Filter them, don't chase.
- **The What's New sheet only auto-opens for a RETURNING user** (`seen !== null`). To make
  it open in the rig, set `jim_whatsnew_seen_v1` to an *old* id — removing the key does the
  opposite of what you want.
- **Count in-file references before calling an export dead.** `VALID_EQUIPMENT` and
  `SLOTS_BY_FOCUS` look unused from outside and are not.
- **"Dead" and "test-only" are different categories.** Deleting a test-only export means
  deleting its test, which is a separate decision.

### Still open

| # | Task | Status | Notes |
|---|------|--------|-------|
| A | What's New scroll on device | `NEEDS-DYLAN` | Affordance fixed (`5175aa3`) but web cannot exercise the native touch responder. One observation needed: is the fade visible, does it scroll? |
| B | VoiceOver pass on any bottom sheet | `NEEDS-DYLAN` | The fix is iOS-only and structurally invisible on web + jest. |
| C | Render deploy confirmation | `OPEN` | No Render→GitHub reporting on this repo, no version marker on `/api/health`, and 22/22 polls returned 200 with no restart blip — so no crash-loop, but the swap was never observed. Dashboard deploy log is the authority. |
| D | 24 colour-only selection controls in `GeneratePlanScreen` | `OPEN` | Need `accessibilityState={{ selected }}`; the boolean is already computed on every one of those lines. |
| E | ~10 touch targets under 44pt | `OPEN` | Includes the live workout's 40pt check button — the most-tapped control in the app. `hitSlop` is the fix and is already used well in 49 places. |
| F | Remaining unlabelled controls | `OPEN` | 2 per-day time-cap steppers, 7 numeric fields with neither label nor placeholder, the split-tile info button (unreachable — nested inside an `accessible` tile), 2 full-screen unlabelled dismiss overlays. |
| G | Fixed-height containers vs Dynamic Type | `OPEN` | 4 containers hold scalable text at a fixed height; `minHeight` is the pattern already used correctly elsewhere. |
