# Jim — logo assets and spec

The mark is a letter J whose stem and bowl are broken into five equal segments,
so it doubles as a progress track. Same geometry everywhere; only the colors and
the dash pattern change.

## Files

| File | Use |
|---|---|
| `jim-icon-light-1024.svg` / `.png` | Primary app icon. White ground. |
| `jim-icon-dark-1024.svg` / `.png` | Dark app icon variant. |
| `jim-icon-mono-dark-1024.svg` / `.png` | Monochrome, for press, merch, colored grounds. |
| `jim-mark.svg` | Bare mark, transparent, `currentColor`. Nav bars, lockups, favicon. |
| `jim-progress-3of5.svg` | Reference for the in-app progress element. |

App icons are full-bleed squares with no alpha and no baked corner radius. iOS
applies its own squircle mask, so do not round the corners yourself.

## Geometry

All coordinates are in a 100 x 100 design space. The two nested transforms center
the mark in the tile and scale it to fill about 63% of the width.

```
path      M66 20 L66 52 A22 22 0 1 1 44 30
stroke-width   14
stroke-linecap butt        (flat radial cuts — do not change to round)
transform      translate(50,50) scale(1.08) translate(-44,-50.5)
```

Derived constants:

```
path length     135.67
segments        5
segment length  21.93
gap             6.50
pitch           28.43
```

If you ever change the stroke width, keep the gap at roughly 45% of it. That
ratio is what stops the gaps closing up optically at small sizes. Verified
legible down to 58 px.

General form, if you need a different segment count `n`:

```
segmentLength = (135.67 - (n - 1) * gap) / n
```

## Colors

```
LIGHT (logo)
  background   #FFFFFF
  filled       #2563EB
  unfilled     #C5D8FB

DARK (logo)
  background   #0B0B0B
  filled       #4D9BFF
  unfilled     #1E3663

MONO DARK
  background   #0B0B0B
  filled       #FFFFFF
  unfilled     #3A3A3C

IN-APP PROGRESS (on white or #F2F2F7)
  filled       #2563EB
  unfilled     #D9DDE5
```

The dark variant is not a recolor of the light one. On white, pale blue recedes
and reads as "not yet." On black it becomes the brightest element and the
hierarchy inverts, so dark needs a brighter fill and a darker unfilled tone.

## Dash patterns by fill state

Draw two copies of the same path. The unfilled copy underneath always uses
`21.93 6.5`. The filled copy on top uses:

```
0 of 5   (omit the filled path entirely)
1 of 5   21.93 400
2 of 5   21.93 6.5 21.93 400
3 of 5   21.93 6.5 21.93 6.5 21.93 400
4 of 5   21.93 6.5 21.93 6.5 21.93 6.5 21.93 400
5 of 5   21.93 6.5
```

The trailing `400` is just a gap longer than the path, so the pattern stops.

Generated form:

```
filled(k) = ("21.93 6.5 " * (k - 1)) + "21.93 400"     for 1 <= k <= 4
filled(5) = "21.93 6.5"
```

## Mapping real sessions to segments

Five segments is a property of the geometry, not a count of the user's sessions.
Do not draw three segments for someone who trains three days a week — the
spacing was tuned for five and only looks right at five.

Map proportionally instead:

```
filled = round(completed / planned * 5)      clamped to 0...5
```

So 2 of 4 sessions shows 3 filled. It reads as "a bit past halfway," which is
what it should say. Nobody counts the segments.

## Usage rules

- The pale blue version is the identity. It never shows live progress.
- The gray version is the progress element. It never becomes the app icon.
- The app icon is fixed at 3 of 5 and does not animate or reflect real data.
- Do not switch the caps to round. The flat radial cuts are the whole character
  of the mark.
- Do not add a gradient.

