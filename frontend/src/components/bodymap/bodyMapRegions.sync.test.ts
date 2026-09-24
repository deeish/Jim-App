import * as fs from 'fs';
import * as path from 'path';
import { BODY_MAP_REGIONS } from './bodyMapPaths';

/**
 * The backend keeps its own copy of "which regions belong to which catalog
 * sub-muscle" (backend/src/data/muscle-regions.ts) so it can retag exercises
 * and score recovery per region. This test reads that file and asserts it
 * matches the asset's own tags, so the two can never drift apart silently.
 */
function readBackendRegions(): { bySub: Record<string, string[]>; detailOnly: string[] } | null {
  const file = path.join(__dirname, '..', '..', '..', '..', 'backend', 'src', 'data', 'muscle-regions.ts');
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const grab = (name: string) => {
    const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*(\\{[\\s\\S]*?\\n\\};|\\[[\\s\\S]*?\\];)`));
    if (!m) throw new Error(`${name} not found in muscle-regions.ts`);
    // The literal is plain data (strings and arrays); evaluate it as such.
    return Function(`return (${m[1].replace(/;\s*$/, '')});`)();
  };
  return { bySub: grab('BODY_REGIONS_BY_SUB'), detailOnly: grab('DETAIL_ONLY_REGIONS') };
}

describe('backend muscle-regions stays in sync with the figure asset', () => {
  const backend = readBackendRegions();
  const maybe = backend ? it : it.skip;

  maybe('lists exactly the asset regions for every catalog sub-muscle', () => {
    const assetBySub = new Map<string, Set<string>>();
    const assetDetailOnly = new Set<string>();
    for (const view of ['front', 'back'] as const) {
      for (const [key, region] of Object.entries(BODY_MAP_REGIONS[view])) {
        if (!region.sub) {
          assetDetailOnly.add(key);
          continue;
        }
        if (!assetBySub.has(region.sub)) assetBySub.set(region.sub, new Set());
        assetBySub.get(region.sub)!.add(key);
      }
    }
    const b = backend!;
    expect(Object.keys(b.bySub).sort()).toEqual([...assetBySub.keys()].sort());
    for (const [sub, regions] of assetBySub) {
      expect([...(b.bySub[sub] ?? [])].sort()).toEqual([...regions].sort());
    }
    expect([...b.detailOnly].sort()).toEqual([...assetDetailOnly].sort());
  });
});
