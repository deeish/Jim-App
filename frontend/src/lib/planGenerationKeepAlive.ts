/**
 * Keeps a plan generation alive when the preview screen unmounts.
 *
 * Until 2026-09-17 the preview aborted the in-flight request on unmount, so
 * backing out to edit one field and returning threw the first result away
 * and paid for a second. Now the run is held here by draft id: a screen that
 * mounts while it is still running joins the same promise, and when the run
 * finishes it persists the draft itself so a later mount hydrates from
 * storage even if no screen is listening.
 */

const inFlight = new Map<string, Promise<unknown>>();

/** True while a generation for this draft id is running. */
export function isGenerationInFlight(draftId: string): boolean {
  return inFlight.has(draftId);
}

/**
 * Starts `run` for `draftId`, or joins the run already in flight. `persist`
 * is awaited on a successful result before the promise settles.
 */
export function runKeepAlive<R extends { ok: boolean }>(
  draftId: string,
  run: () => Promise<R>,
  persist: (result: R) => Promise<void>,
): Promise<R> {
  const existing = inFlight.get(draftId) as Promise<R> | undefined;
  if (existing) return existing;
  const promise = (async () => {
    try {
      const result = await run();
      if (result.ok) {
        try {
          await persist(result);
        } catch {
          /* storage is best effort; the caller still gets the result */
        }
      }
      return result;
    } finally {
      inFlight.delete(draftId);
    }
  })();
  inFlight.set(draftId, promise);
  return promise;
}

/** Test seam. */
export function resetKeepAliveForTests(): void {
  inFlight.clear();
}
