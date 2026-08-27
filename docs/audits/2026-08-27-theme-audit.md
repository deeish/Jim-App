# Light / Blackout theme audit — 2026-08-27

Every screen reachable on the web rig, walked in **both** themes, with the
rendered DOM measured rather than the screenshots eyeballed.

## Method

A browser-side auditor walks every text node, resolves the effective background
by climbing ancestors until something opaque, and computes the WCAG contrast
ratio (AA: 4.5:1 normal, 3:1 for large or bold text). It runs on both themes and
the two runs are **diffed** — that is what separates a dark-mode regression from
a design choice that was always there.

Deliberate exclusions, each of which produced a wall of meaningless failures
before it was added:

- **`opacity: 0` elements.** Animation start frames and the calendar's parked
  pager panes. 30 of the first run's 51 "failures" were things nobody can see.
- **Emoji.** Colour glyphs; their CSS `color` describes nothing.
- **Off-screen nodes.** The calendar keeps three live panes, so every labelled
  control exists three times.

⚠ **Known blind spot: text on a gradient.** `LinearGradient` renders as a
`background-image` on web, and where the gradient is a sibling layer rather than
an ancestor the resolver reads straight through to the card behind it. Those are
reported as `unresolved`, never as a pass. The aurora avatar initials fall in
here and are still open — see below.

## Fixed

### 1. `GOLD` used as text and icons — 2.03:1 on a white card ⚠

`GOLD` (`#F5A623`) is a **fill** colour. As small text it measures **2.03:1 on
`surface`** and **1.82:1 on the grey page** — well under AA, in the theme that is
the app's default. Measured, not estimated.

The palette already carries the fix: `accent` (`#9C4E00` light / `#FFB340` dark)
is the warm-attention token and clears AA in both modes by construction —
**5.99:1** and **9.31:1**. This is the same mistake that was fixed once before
for the crew PR subtitle (`#8A5B00` → `c.warning`); these are the sites it was
still live at.

| Site | Was | Now |
|---|---|---|
| `CrewScreen` week score (`3/3`) | GOLD, 2.03:1 | `accent`, 5.99:1 |
| `CrewScreen` "Trained today" | GOLD, 2.03:1 | `accent`, 5.99:1 |
| `CrewScreen` legend trophy (13px) | GOLD, 2.03:1 | `accent`, 5.99:1 |
| `CrewScreen` streak-chip flame | hardcoded `#E08D0C` | `accent` |
| `PlanCalendarWorkoutScreen` rest countdown | GOLD, 2.03:1 | `accent`, 5.99:1 |

**GOLD stays wherever it is a SHAPE** — story rings, the set-deck checkmarks, the
rosette seal, gradient stops. A large filled form is legible at a ratio small
type is not, and that is the app's visual language.

Light-mode AA failures across the seven audited screens: **33 → 24**. Dark was
21 before and after; GOLD always passed on a dark card, which is exactly why this
never showed up as a "dark mode" bug.

## Deliberately not fixed

- **Adjacent-month dates in the month grid** — 11 failures per theme
  (2.05:1 light / 2.33:1 dark), and identical in both, because they are
  `textMuted` at `opacity: 0.5`. That is a deliberate de-emphasis of dates
  outside the month being viewed, and the same in both themes. Raising it is a
  design call, not a bug fix.
- **The disabled "Reset" control** on Exercises (1.9:1 at `opacity: 0.4`).
  Disabled controls are explicitly exempt from WCAG contrast requirements.
- **Gold icons in the calendar week/day views** (2.03:1 / 1.82:1, light only).
  Same class as the fixes above, but these belong to the calendar's established
  gold completion language (seals, checks). Changing them is Dylan's call on the
  visual system, not a unilateral accessibility patch.
- **The celebration screen** (`PlanCalendarWorkoutCompleteScreen`). It carries
  10 hardcoded colours, four of them dark values (`#0A0D13`, `#14161B`,
  `#2A2E36`, `#6B6B70`) — it was built as a dark poster and already branches on
  its own `dark` flag in places. It needs its own pass, which is a separate open
  item, not a token swap.

## Still open

### Aurora avatar initials — unresolvable from static analysis

The initial uses `colors.onPrimary`, which flips `#FFFFFF` → `#0A0D13` with the
theme. The disc behind it is a fixed brand gradient that does **not** change with
the theme, so the glyph's colour moves while its background stays put.

That sounds like a clear dark-mode bug, and the measurements say it is not that
simple. The discs run light→dark, and the glyph sits over the middle:

| disc stop | white initial | dark initial |
|---|---|---|
| `#4BA8FF` | 2.52 | 7.73 |
| `#35D0C0` | 1.92 | 10.13 |
| `#F2B23D` | 1.87 | 10.38 |
| `#2733B8` | 9.33 | 2.09 |
| `#0A4E8F` | 8.40 | 2.31 |

Neither colour wins everywhere — **light mode is the weaker one** on the light
stops. Deciding this needs the rendered pixels under the glyph, not the gradient
endpoints, so it wants a device look rather than another static pass.

### Native surfaces do not follow the in-app theme

`app.json` sets `userInterfaceStyle: "light"` and a `#F2F2F7` splash background.
The app's theme is a manual, binary choice in Profile with no system-following
(deliberate, per `ThemeContext`), so a Blackout user gets a **light splash, then a
light keyboard and light system alerts** — the native surfaces the app does not
paint. `GlassSurface` already solves this for the tab bar by passing the app's
`mode` explicitly instead of letting the material read the device. The rest needs
a binary to change.

### The launch loader's readiness gate does not include the theme

`App.tsx` gates on `!loading && hydrated && minDisplayElapsed`, where `hydrated`
comes from `useUserPreferences`. The **theme** is a separate AsyncStorage read in
`ThemeContext`, which starts at `'light'` and flips when its own read lands. In
practice the minimum-display floor covers it, but nothing enforces that — a slow
theme read can paint light frames under a Blackout user. Adding the theme's
hydration to the gate would make it a guarantee rather than a race that usually
wins.

## Nav bar

Checked specifically. Its colours are all tokens (`primary`, `textMuted`,
`surface`, `border`, `shadow`) and it audits clean in both themes. The glass
branch is also correct: `GlassSurface` passes the app's `mode` rather than
letting the iOS 26 material default to `'auto'`, which would read the *device*
appearance and put a light glass bar under a dark app. That reasoning is already
documented at length in the component.

The one nav-bar-adjacent thing worth remembering is not a colour bug: the bar
floats over content on every platform, so **every tab screen must pad its
scrollable bottom edge with `useTabBarInset()`** or its last rows hide behind the
bar.
