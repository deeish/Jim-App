import { BODY_MAP_REGIONS, BodyMapRegion, BodyMapRegionBounds, BodyMapView } from './bodyMapPaths';

/**
 * Lookup helpers over the generated asset. Highlights are named in the
 * catalog's sub-muscle vocabulary ("Upper Chest", "Quads", ...); regions are
 * named anatomically ("Rectus Femoris", "Vastus Lateralis", ...) and carry the
 * sub-muscle they light up for in `sub`. A highlight name matches a region when
 * it equals the region key OR the region's `sub`, so both vocabularies work.
 */

export type BodyMapRegionEntry = { key: string; region: BodyMapRegion };

const VIEWS: BodyMapView[] = ['front', 'back'];

const ENTRIES: Record<BodyMapView, BodyMapRegionEntry[]> = {
  front: Object.entries(BODY_MAP_REGIONS.front).map(([key, region]) => ({ key, region })),
  back: Object.entries(BODY_MAP_REGIONS.back).map(([key, region]) => ({ key, region })),
};

/** Every name a highlight may use: region keys plus catalog sub-muscle names. */
export const BODY_MAP_HIGHLIGHT_NAMES: ReadonlySet<string> = new Set(
  VIEWS.flatMap((v) => ENTRIES[v].flatMap((e) => (e.region.sub ? [e.key, e.region.sub] : [e.key]))),
);

export function regionMatches(key: string, region: BodyMapRegion, name: string): boolean {
  return key === name || region.sub === name;
}

/** Regions of one view that a highlight name lights up. */
export function regionsForHighlight(view: BodyMapView, name: string): BodyMapRegionEntry[] {
  return ENTRIES[view].filter((e) => regionMatches(e.key, e.region, name));
}

/** True when the name has at least one region on the given view. */
export function hasRegionOnView(view: BodyMapView, name: string): boolean {
  return ENTRIES[view].some((e) => regionMatches(e.key, e.region, name));
}

/** The muscle-group hue key for a highlight name (first matching region, either view). */
export function highlightGroup(name: string): string | undefined {
  for (const view of VIEWS) {
    const hit = ENTRIES[view].find((e) => regionMatches(e.key, e.region, name));
    if (hit) return hit.region.group;
  }
  return undefined;
}

/**
 * The one region to select when a highlight name is opened in the explorer:
 * the largest region carrying that name, on whichever view holds it (front
 * wins a tie). A region key returns itself.
 */
export function primaryRegionFor(name: string): { view: BodyMapView; key: string } | null {
  let best: { view: BodyMapView; key: string; area: number } | null = null;
  for (const view of VIEWS) {
    for (const { key, region } of regionsForHighlight(view, name)) {
      const b = region.bounds;
      const area = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (!best || area > best.area) best = { view, key, area };
    }
  }
  return best ? { view: best.view, key: best.key } : null;
}

/** Union of the bounds of every region the name lights up, across BOTH views. */
export function highlightBoundsFor(name: string): BodyMapRegionBounds | null {
  let out: BodyMapRegionBounds | null = null;
  for (const view of VIEWS) {
    for (const { region } of regionsForHighlight(view, name)) {
      const b = region.bounds;
      out = out
        ? {
            x0: Math.min(out.x0, b.x0),
            y0: Math.min(out.y0, b.y0),
            x1: Math.max(out.x1, b.x1),
            y1: Math.max(out.y1, b.y1),
          }
        : { ...b };
    }
  }
  return out;
}
