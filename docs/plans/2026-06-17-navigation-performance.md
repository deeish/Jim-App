# Navigation / page-switch performance (~2s tab-switch delay)

**Date:** 2026-06-17
**Branch context:** `feat/beta-feedback`
**Status:** Diagnosed 2026-06-19 as **DB fetch latency** (not render/auth) — and the dev numbers are inflated by a local→cloud-DB setup, so they don't represent prod. Shipped safe wins (PlanScreen guard, Sentry tracing, a behavior-preserving plan-query merge); **awaiting real prod TTID from the next TestFlight build** before further backend work. Client cache held. Phase 1.2 deferred.
**Symptom (reported):** Switching between pages has a ~2-second delay before the page renders.
**Scope confirmed with reporter:** Happens on **all tabs, every switch**, on the **TestFlight / production** build (not just dev, not just one tab).

> ⚠️ Key takeaway up front: the obvious code-level suspects have been **ruled out by static review** (see §3). A genuine uniform ~2s on every switch in a *production* build is most reliably localized by **on-device measurement** (§4) before we refactor — speculative changes here risk regressions for uncertain payoff, which violates the "without breaking anything" constraint.

---

## Progress — 2026-06-19 (uncommitted on `feat/beta-feedback`)

Plan re-verified against live code before any change. Verdict: the static analysis holds — stable tab `component` refs (`NavBar.tsx`) mean **no remount**; `navTheme` recreation in `App.tsx` doesn't reach tab switches; PlanScreen is the only screen that blanks on focus. Decisions:

- **Done — Phase 1.1 (PlanScreen first-load guard).** `PlanScreen.tsx`: `loadPlan` gates `setPlanLoading(true)` behind an `isFirstPlanLoad` ref and clears it in `finally`. The Plan tab keeps the previous week visible and refetches silently on revisit instead of blanking. Scroll-to-today effect (`:335`) already gates on `didScrollToTodayRef`, so no regression. Type-check clean.
- **Done — Phase 0 (Sentry navigation tracing).** `sentry.ts` exports `sentryNavigationIntegration` (`reactNavigationIntegration({ enableTimeToInitialDisplay: true })` — API verified against the installed **7.2.0**) and adds `tracesSampleRate: 1.0` via the **function** `integrations` form (preserves Sentry's default integrations). `App.tsx` binds the `NavigationContainer` ref and registers it in `onReady`. Yields per-route TTID on the next build.
- **Deferred — Phase 1.2 (`freezeOnBlur`).** Not applied: `WorkoutSession.tsx:198` runs a 30s **auto-save-draft** interval ("survives an app kill"); freezing the Workout tab while the user peeks at another tab would pause that safety net. Combined with the plan's own note that `freezeOnBlur` affects only *background* work (not the focused render being complained about), the risk isn't justified until measurement says so. (The elapsed-clock interval at `:189` is timestamp-based → would be freeze-safe.)
- **Doc correction:** §2 calls the `client.ts` getSession retry loop "web-only" — it is **not**; there's no `Platform` check (it simply no-ops when a token is already present). Conclusion unchanged.

### Measurement (2026-06-19, dev / web → local backend)

A temporary per-request timing probe (added to `api/client.ts`, since **removed**) split each request into `getSession` vs network time. Findings:

- **Not auth, not render — it's the database fetch.** `getSession` was 1–18ms everywhere. The only fast endpoint was `POST /exercises/search` (~60ms), served from the in-memory catalog. **Every DB-backed endpoint was 650ms+** — including a `saved/ids` query that returned **zero rows in 656ms**, i.e. the cost is *reaching* the DB (connection/round-trip), not query execution. `/plans/me/with-weekly` was the slowest (1.2–3.0s) because it issues the most queries.
- **This is a dev artifact, not prod.** Local backend → cloud (Supabase) Postgres over home internet ⇒ a ~650ms/query floor. Production (Render next to its DB) should be far lower, so these absolute numbers don't represent TestFlight users.
- **Backend query-merge applied but ~no improvement** (`getCurrentWithWeekly`, kept). Prisma's `include` fans out into separate per-relation queries rather than a single JOIN, so "2 queries → 1" didn't cut round-trips materially; the connection floor dominates. The merge is still correct/cleaner and would collapse to one round-trip under Prisma `relationLoadStrategy: "join"` if ever needed.

**Decision:** stop optimizing against misleading dev numbers. Ship the safe wins (PlanScreen guard = instant warm switches; query merge; Sentry). **Get real per-route TTID from the next TestFlight build** before any further backend work — DB connection pooling / `relationJoins` / co-location are only worth it if prod is genuinely slow. The **client stale-while-revalidate cache** remains the one environment-independent lever for instant cold-launch paint — **held** (it's the only change with staleness risk). Then lower `tracesSampleRate`.

---

## 1. Navigation architecture (as built)

- `frontend/App.tsx` — `NavigationContainer` (line ~98). Authed users land on `RootStack` → `Main` screen, whose component is **`NavBar`** (`App.tsx:122`).
- `frontend/src/components/NavBar.tsx` — the bottom tab navigator (`@react-navigation/bottom-tabs`). Tabs: **Home, Plan, Workout, Search**.
  - `Plan` → `PlanStackNavigator`, `Search` → `SearchStackNavigator` (native-stack inside the tab).
  - `screenOptions` (`NavBar.tsx:40-69`) sets styling only. It does **not** override `lazy`, `unmountOnBlur`, `detachInactiveScreens`, or `freezeOnBlur`.
- **Versions** (`frontend/package.json`):
  - `@react-navigation/bottom-tabs` `^6.6.1` (v6) → defaults: `lazy: true`, `unmountOnBlur: false`, `detachInactiveScreens: true`.
  - `@react-navigation/native` `^6.1.18`, `@react-navigation/native-stack` `^6.11.0`.
  - `react-native-screens` `~4.16.0` (supports `freezeOnBlur` / `enableFreeze`).
  - `react-native` `0.81.5`, `expo` `^54.0.31`, `@sentry/react-native` `~7.2.0`.

**Implication:** With v6 defaults, each tab mounts on first focus and then **stays mounted** (state/refs preserved). Repeat switches should therefore *not* remount heavy trees — which is why a uniform per-switch 2s is suspicious and points at the switch/re-render machinery or something runtime-specific rather than a remount.

---

## 2. Per-screen focus behavior (evidence)

| Screen | On focus | Blocks render? | Notes |
|---|---|---|---|
| **HomeScreen** | `loadHomeData` via `useFocusEffect` (`HomeScreen.tsx:194-198`) | **No** — spinner only on first load | `isFirstLoad` ref (`:132`) gates `setLoading(true)` (`:170`); render shows spinner only when `loading` (`:419`). Refocus keeps content + silent refresh. ✅ correct pattern |
| **PlanScreen** | `loadPlan` via `useFocusEffect` (`PlanScreen.tsx:280-291`) | **Yes, every focus** | `loadPlan` calls `setPlanLoading(true)` unconditionally (`:240`); render short-circuits to `<LoadingSpinner/>` when `planLoading` (`:1135`). No first-load guard. ❌ blanks + refetches every visit |
| **WorkoutScreen** | three `useFocusEffect`s (`WorkoutScreen.tsx:437,460,507`) | **No** | Refetches (`getWorkoutById`, `getCurrentPlanWithWeekly`, draft) but updates state in place; doesn't blank the screen |
| **SearchScreen** | refetch saved-exercise ids (`SearchScreen.tsx:151-162`) + Android back handler (`:166`) | **No** | Cheap; main list already rendered from prior search |

**Service layer:**
- `frontend/src/services/planService.ts:93-96` — `getCurrentPlanWithWeekly` calls `api.get('/plans/me/with-weekly')` directly. **No client cache.** Home, Plan, and Workout each fetch the same plan data independently on focus.
- `frontend/src/api/client.ts:19-42` — request interceptor `await supabase.auth.getSession()` on **every** request, with a web-only retry loop (`:26-30`, up to ~480ms) when no token is present. On native this is usually fast but it's on every request's critical path.

**Backend endpoint (not the bottleneck):**
- `backend/src/plans/plans.service.ts:114-124` — `getCurrentWithWeekly` = `findActivePlan` + one `workout.findMany({ include: { exercises: true } })`. Two indexed queries; not pathologically slow on a warm Standard instance.

---

## 3. Ruled out by static review (do not re-investigate without new evidence)

- **Block-on-focus is NOT the systemic cause.** It only affects **PlanScreen**. Home/Workout/Search keep their content on refocus, yet the reporter sees the delay on *all* tabs.
- **Theme / StyleSheet recreation — clean.** `frontend/src/theme/ThemeContext.tsx`: `colors` is a stable module constant (`darkColors`/`lightColors`), context value is `useMemo`'d on `[theme]` (`:19-27`). Screens define styles at module level (`HomeScreen.tsx:722`) or `useMemo` on stable `colors` (`PlanScreen.tsx:373`, `WorkoutScreen.tsx:153`). Styles are **not** recreated per render.
- **No heavy components mounted in tab screens.** No Skia/Lottie/BlurView/gradients in Home/Plan/Workout/Search; only ordinary `react-native-reanimated` usage in Plan.
- **Reanimated/Babel config correct.** `frontend/babel.config.js` includes `react-native-worklets/plugin` as the last plugin.
- **No config-driven remounting.** No `unmountOnBlur`; v6 keeps tabs mounted.

---

## 4. Remaining hypotheses (require runtime data to distinguish)

1. **Screens remounting / re-running first-load on each switch.** If true, `isFirstLoad`-style refs reset and every tab would re-show its first-load spinner → uniform delay. (Contradicts v6 defaults, but worth confirming.)
2. **Heavy focused-screen re-render on the device.** Focus triggers a re-render; on a large tree this can stall the JS thread. PlanScreen is the largest screen.
3. **`react-native-screens` detach/reattach cost.** With `detachInactiveScreens: true`, the target screen's native views reattach on focus; large trees can cause a visible hitch.
4. **Device / network specifics.** Older device, or the focus-triggered fetches contending on a slow connection.

These cannot be separated from source alone.

---

## Phase 0 — Measure first (REQUIRED, low risk, no behavior change)

**Goal:** Get real per-screen timings from a production build so we fix the confirmed bottleneck, not a guess.

### Option A (recommended): enable Sentry navigation performance tracing
Sentry is already initialized but **without** performance tracing — `frontend/src/lib/sentry.ts` has no `tracesSampleRate` and no React Navigation integration. Add both (additive):

```ts
// frontend/src/lib/sentry.ts  (sketch — verify against @sentry/react-native ~7.2.0 docs)
export const sentryNavigationIntegration = isSentryEnabled
  ? Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true })
  : undefined;

Sentry.init({
  dsn,
  environment: resolveEnvironment(),
  release: `${slug}@${version}`,
  enableAutoSessionTracking: true,
  tracesSampleRate: 1.0,            // diagnostic: capture everything; lower (e.g. 0.2) after
  integrations: sentryNavigationIntegration ? [sentryNavigationIntegration] : [],
  debug: __DEV__ && process.env.EXPO_PUBLIC_SENTRY_DEBUG === '1',
});
```

```tsx
// frontend/App.tsx — register the navigation container with the integration
import { sentryNavigationIntegration } from './src/lib/sentry';
const navigationRef = useNavigationContainerRef();   // from @react-navigation/native
<NavigationContainer
  ref={navigationRef}
  theme={navTheme}
  onReady={() => sentryNavigationIntegration?.registerNavigationContainer(navigationRef)}
>
```

- `Sentry.wrap(App)` is already applied (`sentry.ts:30-37`) — required for TTID/TTFD.
- **What we get:** per-route **Time to Initial Display (TTID)** and (optionally) **Time to Full Display (TTFD)** from real TestFlight sessions → pinpoints whether the 2s is in the transition, the render, the fetch, or native reattach.
- **Cleanup:** drop `tracesSampleRate` to a sane sampling rate (or behind `EXPO_PUBLIC_APP_ENV`) once diagnosed. See `docs/sentry-client.md`.
- **Risk:** very low (additive; tracing volume only). **Acceptance:** TTID numbers visible per route in Sentry for a TestFlight build.

### Option B: local profiler
Build a **release** configuration locally (not Expo Go / dev — dev JS is much slower and not representative) and record a tab switch with the **Hermes sampling profiler** or **React DevTools Profiler**. Look for: long JS frames on focus, repeated mounts, or large commit times.

---

## Phase 1 — Safe wins (apply regardless; low risk)

These won't fix a systemic 2s on their own, but they're correct and harmless.

### 1.1 PlanScreen first-load guard (stale-while-revalidate)
Mirror HomeScreen so the Plan tab stops blanking to a spinner on every revisit.

```ts
// PlanScreen.tsx
const isFirstPlanLoad = useRef(true);

const loadPlan = useCallback(async () => {
  if (isFirstPlanLoad.current) setPlanLoading(true);   // was: unconditional setPlanLoading(true) at :240
  setPlanError(null);
  try {
    // ...unchanged fetch + setState...
  } catch (err) {
    // ...unchanged...
  } finally {
    setPlanLoading(false);
    isFirstPlanLoad.current = false;
  }
}, [/* unchanged deps */]);
```

- Content branch (`PlanScreen.tsx:1157+`) already reads from persisted state (`currentPlan`, `planByWeek`), so keeping stale content while refreshing is safe.
- **Files:** `frontend/src/screens/PlanScreen.tsx`. **Risk:** very low (proven pattern from HomeScreen). **Acceptance:** returning to Plan shows the previous week immediately; no full-screen spinner after first load.

### 1.2 `freezeOnBlur: true` on the tab navigator
Stop inactive tab screens from re-rendering in the background.

```ts
// NavBar.tsx — Tab.Navigator screenOptions
freezeOnBlur: true,
```

- Backed by `react-native-screens` 4.16. **Risk:** low. **Note:** speeds background work, not necessarily the focused screen's render — confirm impact via Phase 0 numbers. **Acceptance:** no regression in tab content/state; ideally lower main-thread work on switch.

---

## Phase 2 — Shared, self-healing plan cache (ONLY if measurement shows fetch/refetch is the cost)

**Idea:** a small in-memory cache for plan data so Home/Plan/Workout paint instantly from the last-known value, then revalidate. Because Home is the initial tab and always loads the plan, Plan/Workout could be instant even on first open.

**Design (self-healing = safe):**
- Module-level cache in `planService.ts` (or a tiny `PlanDataContext`): `{ data, fetchedAt }`.
- Screens render cached data immediately **and always trigger a background `getCurrentPlanWithWeekly()` on focus**. Because we revalidate every focus, a *missed* invalidation auto-corrects on the next focus — this removes most staleness risk.
- Optional explicit invalidation (belt-and-suspenders) at the mutation points so the UI updates without waiting for the next focus:
  - `createPlan`, `updatePlan`, plan slot add/remove, regenerate week/cardio (PlanPreview), apply preview
  - workout completion / `saveWorkoutLog`, `regenerateWorkoutInPlace`, `materializeFromPlanSlot`, workout edit
- **Risk:** medium — staleness if both the revalidate-on-focus and an invalidation are missed. Mitigated by the always-revalidate rule. **Do not pursue unless Phase 0 shows network/refetch is the dominant cost.**
- **Acceptance:** Home↔Plan↔Workout switches paint instantly; data converges within one refresh; no stale completion/plan state after mutations.

---

## Phase 3 — Micro-optimizations (incremental, optional)

- **Cache the access token in memory** in `api/client.ts` (subscribe to `supabase.auth.onAuthStateChange`) to avoid `await getSession()` per request; keep the existing 401 refresh-and-retry (`client.ts:64-80`) as the correctness backstop. *Risk: low–medium; only if Phase 0 shows per-request auth latency matters.*
- **Strip `__DEV__` console logs** on hot paths (`SearchScreen` focus, `api/client.ts`). No production effect (dev-only) but cleans dev profiling.
- **`detachInactiveScreens={false}` experiment** on the tab navigator — can make switches instant at a memory cost; measure both ways. *Risk: medium (memory); experiment only.*
- **Memoize heavy children / virtualize lists** in whichever screen the profiler flags. PlanScreen first.

---

## Risk register / "don't break anything" notes

- Phase 0 is additive instrumentation — safe to ship.
- Phase 1.1 mirrors an existing, proven pattern (HomeScreen) — safe.
- Phase 1.2 is a single screenOption — low risk; verify tab state survives.
- Phase 2 is the only change with real regression surface (staleness). The "always revalidate on focus" rule is what keeps it safe; **gate it behind measurement**.
- Phase 3 token caching touches auth — keep the 401 retry as the safety net.

---

## Recommended sequence

1. **Phase 0 (measure)** → ship Sentry tracing, gather TTID/TTFD from TestFlight (or local release profile).
2. **Phase 1** safe wins in parallel (PlanScreen guard, `freezeOnBlur`).
3. Read the numbers → fix the **confirmed** bottleneck (likely Phase 2 if it's fetch-bound, or targeted render/reattach fixes if it's render-bound).
4. Re-measure to confirm the delay dropped; then lower `tracesSampleRate`.

---

## Decision log / open questions

- [ ] Confirm via Phase 0 whether the 2s is **render-bound** (focused screen re-render / reattach) or **fetch-bound** (network on focus). This decides Phase 2 vs. targeted render fixes.
- [ ] Confirm whether tab screens **remount** on switch (Sentry "screen mount" spans / profiler) — would change everything.
- [ ] Decide final `tracesSampleRate` for production after diagnosis.

## References
- `frontend/App.tsx` (NavigationContainer, RootStack → NavBar)
- `frontend/src/components/NavBar.tsx` (tab navigator + options)
- `frontend/src/screens/HomeScreen.tsx:132,167-198,419` (first-load guard pattern)
- `frontend/src/screens/PlanScreen.tsx:239-264,280-297,1135` (block-on-focus)
- `frontend/src/screens/WorkoutScreen.tsx:437-518` (in-place refetch)
- `frontend/src/screens/SearchScreen.tsx:151-162` (cheap focus refetch)
- `frontend/src/services/planService.ts:93-96` (no client cache)
- `frontend/src/api/client.ts:19-42,64-80` (per-request getSession; 401 retry)
- `frontend/src/theme/ThemeContext.tsx:17-36` (stable colors, memoized value)
- `frontend/src/lib/sentry.ts` (no tracing yet)
- `frontend/babel.config.js` (worklets plugin)
- `backend/src/plans/plans.service.ts:114-124` (getCurrentWithWeekly)
