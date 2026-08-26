# Crew — feature audit, 2026-08-26

**Scope:** the whole Crew surface — controller, DTOs, `crew-summary.util.ts`, `crews.service.ts`, `CrewScreen.tsx`, `crewSignature.ts` — read end to end after the "one hero, one list" redesign landed.
**Status:** all ten findings fixed and pushed, `e8820c8`…`27d263e` on `feat/calendar-tab-prototype`. Backend 814 tests, frontend 565, both green.
**Tags:** `[BE]` backend (auto-deploys via Render) · `[OTA]` ships over-the-air · `[DATA]` needs a one-off action against production.

Two things worth carrying forward before the list:

1. **Four of the ten predate the redesign** and had simply never been reachable — the recap pound only exists on Mondays and Tuesdays, the ranking exploit needed a planless member, and nobody had ever created a crew in production until 2026-08-26.
2. **One was introduced by the redesign and one by the demo seeder.** Collapsing two renderings of the same data into one makes every state the survivor must carry load-bearing; see 4 below, and `missed` (`b90c71d`) before it. That is now the standing lesson: when a redesign deletes one of two drawings of the same thing, audit every state the remaining one inherits.

---

## Correctness

- [x] **1. The Monday recap 💪 could never work** `[BE]` — fixed in `e8820c8`
  `KudosDto.eventRef` matched only `day:` and `pr:`, so every pound on a recap ref was refused as a 400 while `crews.service.ts` went on querying `eventRef.startsWith('recap:')` for rows that could never be written. The frontend's catch swallowed it and reloaded, so the chip filled in optimistically and silently snapped back. Pre-existing — the old moments feed had the same chip — and invisible because the recap only renders two days a week.
  The `pr:` arm was also `.+`, accepting any trailing junk up to 160 chars; it now matches the catalog's id charset. `crewstreak:` stays excluded: a crew-wide milestone has no recipient.
  *Verified:* `recap:<iso>` → `200 {"pounded":true,"count":1}`.

- [x] **2. Crew records were not the app's records** `[BE]` `[OTA]` — fixed in `2112247`
  Crew ranked by raw max weight; `frontend/src/lib/exerciseHistory.ts` uses Epley with a 12-rep cap. So `225×1` announced a record the Profile screen did not recognise, and `205×5` — genuinely stronger, 239 estimated against 225 — announced nothing. One word, two meanings, depending on the screen.
  `estimateOneRepMax` in `crew-summary.util.ts` now mirrors the frontend exactly, both deliberate limits included (a single rep is the weight itself, not Epley's inflated `w × 1.033`; past the cap is suppressed, not projected). **Detection moved to the estimate; the announcement did not** — a record is still reported as the set actually lifted, which is why `reps` now ships alongside `weight`.

- [x] **3. A member with no plan ranked first** `[OTA]` — fixed in `6f93f0e`
  `race.planned` counts any day with a log **or** a slot, so someone with no plan who trained once read `1/1` — a perfect ratio, top of the leaderboard, above a person who went 4/5 against a real program. `hasPlanThisWeek` gated the gold "done" colour but not the ordering. The Monday recap already gated its winner correctly; the live list was the one place that disagreed with it.
  Planless members now sort below everyone racing, ordered by sessions done, and their score drops its denominator — `3/3` claims a perfect week against a target that does not exist.
  *Verified:* a demo member stripped of his plan moved from a would-be tie for first to last-among-the-zeros, showing a bare `2`.

- [x] **4. Only one record per member was reachable** `[OTA]` — fixed in `6f93f0e`
  Introduced by the redesign. Before it, every PR moment had its own card and chip; after, the row carried the newest one in its subtitle and the day tile redirected to the first record of that day. A session where you PR two lifts lost one of them **entirely** — invisible and unpoundable. The member sheet now lists every record of the week, each with its own chip.

---

## Safety and moderation

- [x] **5. No way to remove a member, no way to change the code** `[BE]` `[OTA]` — fixed in `b8224e2`
  A code posted in the wrong group chat meant a stranger watched your training week forever, and abandoning your own crew was the only exit. Added `DELETE /crews/mine/members/:userId` and `POST /crews/mine/code`.
  **The lead is derived, not stored:** whoever has been in the crew longest, which is the founder until they leave and then the next-longest member. That avoids a production migration for a rule this small and means a crew can never end up with nobody able to administer it. `leadUserId` ships in the summary so the UI knows whose controls to show. Removing someone takes their kudos with them, so counts stop crediting a non-member.
  *Verified:* non-lead rotate 400, non-lead remove 400, lead-removes-self 400 ("use leave"), lead rotate 200, lead remove 204.

- [x] **6. Kudos could name events that never happened** `[BE]` — fixed in `b8224e2`
  The DTO checks an eventRef's *shape*, and shape is not existence — a member could mint kudos rows for sessions and records that never occurred. A pound now has to name a day the recipient actually trained. The window is a day either side because the ref is in the *pounder's* local calendar and this check has no timezone of its own; it is a bound on junk, not an audit. `recap:` is exempt — it names a computed crew event, not one of the recipient's logs.
  *Verified:* `pr:2019-01-01:totally_made_up` → *"There is nothing there to pound."*

- [x] **7. The wire carried the hour each member trains** `[BE]` — fixed in `2112247`
  `lastSession.performedAtIso` was the full timestamp of every member's last session. It is not in the "what your crew sees" list the empty state promises, and nothing ever rendered it. Deleted.

---

## Performance

- [x] **8. The record lookup read a year of sets on every tab focus** `[BE]` — fixed in `b8224e2`
  `priorSets` fetched every `CompletedSet` matching any exercise the crew touched this week, across all members, over 370 days — plausibly 10–15k rows per request for a ten-person crew a year in — and folded them into one number each in JS. It is a MAX; the database should compute it. Now one grouped `$queryRaw` whose `CASE` mirrors `estimateOneRepMax`, with rounding left in JS so both sides round once, the same way.
  The 370-day log read also dropped its `workout` join: it feeds week-streak math, which only needs to know *which days* had a session, and it was dragging a name through thousands of rows to display one of them. The two rows whose titles are actually rendered come from small queries — this week's, and a `distinct: ['userId']` for each member's latest.
  ⚠ **Raw SQL table names:** `completed_sets`, `workout_log_entries`, `workout_logs`, columns camelCase and quoted. Verified against a real database before pushing.

---

## Smaller

- [x] **9. The badge missed the most interesting event of all** `[OTA]` — fixed in `5feccb6`
  `crewSignature` tracked moments, crewmates' latest sessions and pounds received. A member **joining** contributed a new `s:<id>:none` part and did light it, but a member **leaving** removed one silently, and neither read as an event worth surfacing. Counting members makes both count.

- [x] **10. Assorted UI honesty** `[OTA]` — fixed in `6f93f0e`
  - An invite deep link did **nothing at all** when you were already in a crew: the code was stored in state only the no-crew branch renders, so tapping a friend's link opened the tab with no sign anything had happened.
  - Offline with cached data rendered stale numbers with no warning; the note only appeared when there was no summary at all. You could not tell yesterday's week from today's.
  - Your own days wore a filled chip they could not act on — you cannot pound yourself.
  - The row subtitle dropped the lift's name, which only ever truncated (`…Flat Barbell Benc…`) and pushed the number that matters out of view. The name lives in the sheet, where there is room.

---

## Regression found while fixing

- [x] **11. The demo seeder handed the crew to a fake member** `[DATA]` — fixed in `27d263e`
  `scripts/seed-demo-crew.mjs` backdated demo mates' `joinedAt` by 20 days to give the streak room to count. Harmless until finding 5 made "longest-standing member" a real role — at which point a demo account became the lead of a crew its owner created, with the power to remove him from it. Reproduced on the rig: a demo user successfully rotated the code.
  They join a minute after the owner now, which costs the streak nothing (a member cannot violate days from before they joined, so their earlier sessions still count and their earlier rest days cannot break anything — verified, the streak reads the same 7 either way).
  ⚠ **`[DATA]` action:** anyone who already ran the seeder must re-run it to correct `joinedAt`.
  ```
  cd backend && node scripts/seed-demo-crew.mjs --owner <email> --apply
  ```

---

## Known and deliberately not fixed

- **`SheetModal`'s positioner is a `Pressable` with `accessibilityRole="button"`**, so every control in every sheet in the app is a nested button on web. Pre-existing and app-wide — Plan and Profile sheets too, not caused by the crew work. Functionally fine on native: the card's own `Pressable` stops propagation, so the hierarchy is well-defined and controls work. It is a DOM-validity warning on web only, and it wants its own pass across every sheet consumer rather than being slipped into a crew change.
- **Timezone:** `localDateIso` applies *today's* offset to all history, so a log within ~1h of local midnight across a DST switch can bucket to the neighbouring day. Documented v0 caveat in `crews.service.ts`; fixing it properly needs an IANA zone per request.
- **Client-only skips** still read as crew-streak misses (v0 caveat, `crew-summary.util.ts`).
