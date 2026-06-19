# Liquid Glass app icon (iOS 26) — implementation checklist

**Date:** 2026-06-19
**Branch context:** `feat/beta-feedback` (icon refresh already committed — see below)
**Status:** **Deferred / not started.** Optional polish. Do as its own task later.
**Owner:** Dylan

> One-line summary: making the iOS home-screen icon "Liquid Glass" is an **artwork + build-tooling** task, **not** a Swift rewrite. We're already on **Expo SDK 54 + RN 0.81.5**, which is the SDK that supports iOS 26 icons, so nothing is blocked. The work is: rebuild the icon as **layers** in Apple's **Icon Composer**, export a `.icon` file, wire it into the Expo/EAS build, and keep the current flat PNG as the fallback.

---

## 0. Context — what's already done (don't redo)

The flat icon was refreshed and is fully shippable on its own (commits on `feat/beta-feedback`):
- `feat(brand): refresh app icon, favicon, and splash with new J artwork` (`9bf0f65`)
- `chore(brand): retire old icon-sculpting pipeline and unused BrandMark` (`6f8b8f6`)
- `fix(brand): flatten splash.png to opaque RGB (no alpha)` (`4699dee`)
- `perf(brand): losslessly optimize icon/splash/favicon PNGs (~35% smaller)` (`799bb9a`)

Current assets (these **remain the fallback** for iOS ≤ 25 and Android — do not delete):
- `frontend/assets/icon.png` (1024², RGB, no alpha)
- `frontend/assets/adaptive-icon.png`, `favicon.png`, `splash.png`
- `frontend/assets/icon-source.png` (1254² master)

Liquid Glass **adds** an iOS-26-only appearance on top of this; it does not replace the fallback.

---

## 1. Key facts / constraints (so future-me doesn't re-litigate)

- **No Swift / no native rewrite.** App icons are assets, independent of app language. RN/Expo is fine.
- **iOS 26+ only.** Older iOS and Android keep showing the flat `icon.png`. So this is additive, never a regression.
- **macOS required.** Icon Composer is a Mac-only app (ships with Xcode 26).
- **Layered art is the real work.** The current `icon.png` is flat (gradient baked in). The glass material (translucency, specular highlights, depth, Dark/Clear/Tinted variants) needs the icon supplied as **separate layers** so the system can light them. A flat PNG will *not* look glassy.
- **Don't confuse two different features:**
  - *light / dark / tinted PNG variants* (older, simpler) → gives a dark-mode + tinted icon, but **not** the layered glass look.
  - *Icon Composer `.icon` (layered)* → the actual Liquid Glass treatment. **This is what we want.**

---

## 2. Prerequisites

- [ ] A Mac with **Xcode 26** installed (provides **Icon Composer**).
- [ ] Confirm EAS builds use the **Xcode 26 image** (Expo SDK 54 default toolchain should; verify in `eas.json` / EAS build image notes).
- [ ] Locate the editable source art for the J icon (layers, not the flattened PNG). If only the flat `icon-source.png` exists, plan to **re-cut the layers** (see §3) or regenerate from the original design file.

---

## 3. Artwork — layer breakdown (the design work)

Goal: deliver the icon as discrete transparent layers at **1024×1024**, respecting Apple's icon grid (keep key shapes off the extreme corners — the system rounds and lights the edges).

- [ ] **Background layer** — the warm gold→orange gradient, full-bleed. (Can be an image or a gradient built in Icon Composer.)
- [ ] **Foreground layer** — the cream **"J"** glyph, on transparency (its own PNG/SVG, 1024²).
- [ ] **Accent layer (decide):** the small barbell / abs mark.
  - Recommendation: **simplify or drop it** for the glass version — fine detail tends to wash out / read as noise under the glass material and specular highlights. Validate both ways in Icon Composer preview.
- [ ] Export each layer as its own **transparent PNG (or SVG)** at 1024².

---

## 4. Build the `.icon` in Icon Composer

- [ ] New document in **Icon Composer**; import the layers from §3 (background → foreground → accent).
- [ ] Arrange depth/order; tune per-layer **opacity / blur / specular / translucency** to taste.
- [ ] Preview **all appearances**: **Default, Dark, Clear (Liquid Glass), Tinted.** Each must look intentional, not accidental.
- [ ] Confirm the "J" stays legible and centered in every appearance and at small sizes.
- [ ] Export the **`.icon`** file. Keep the Icon Composer source document in the repo (e.g. `frontend/assets/branding/`) so it's re-editable.

---

## 5. Wire into Expo / EAS

> ⚠️ **Verify the exact mechanism against the current Expo SDK 54 "App icons" docs** before implementing — the icon config shape changed for iOS 26 and may differ from what's written here.

- [ ] **Preferred path:** if SDK 54 supports pointing the Expo config at the `.icon` file (e.g. an `ios.icon` field accepting the Icon Composer output), set it in `frontend/app.json` and keep the existing PNG as the non-iOS-26 fallback.
- [ ] **Fallback path:** if app-config support is insufficient, add a **config plugin** (or `expo prebuild` + manual step) that drops the `.icon` into the generated Xcode asset catalog and sets it as the `AppIcon`.
- [ ] Keep `frontend/assets/icon.png` referenced as the legacy/fallback icon (iOS ≤ 25, Android adaptive, web favicon all unaffected).
- [ ] `npx tsc --noEmit` / `expo-doctor` clean; config validates.

---

## 6. Build & verify on device

- [ ] `npm run eas:build:preview` (or your normal iOS build) on the Xcode 26 image.
- [ ] Install on a **physical iOS 26 device**.
- [ ] **Acceptance:**
  - [ ] Home screen shows the **Liquid Glass** icon (depth + specular as you move the device).
  - [ ] **Dark** and **Tinted** home-screen modes look intentional.
  - [ ] On an **iOS ≤ 25 device / Android**, the **flat fallback** icon is unchanged.
  - [ ] App Store marketing icon (1024², opaque, no alpha) still valid — unaffected by the layered home-screen icon.
- [ ] OTA note: icons are baked into the **native binary** → this only appears via a **full EAS build**, never `eas update`.

---

## 7. Risks & gotchas

- **Mac-only tooling** — can't do the Icon Composer step from Windows.
- **Expo maturity** — confirm SDK 54's iOS-26 icon support before committing to the app-config path; budget time for the config-plugin fallback.
- **Detail wash-out** — the barbell/abs mark may disappear or look muddy under glass; prefer the simplest layer set that still reads as the brand.
- **Keep the fallback** — never remove `icon.png`; a large share of users won't be on iOS 26 yet.

---

## 8. References (confirm before relying on)

- Apple **Human Interface Guidelines → App Icons** (Liquid Glass) + **Icon Composer user guide** (ships with Xcode 26).
- WWDC25 sessions on the new app-icon system / "Create icons with Icon Composer."
- **Expo docs → "App icons"** for SDK 54 — the authoritative source for the exact `app.json` field / config-plugin steps. **This supersedes §5 if it differs.**

---

**Last reviewed:** 2026-06-19
