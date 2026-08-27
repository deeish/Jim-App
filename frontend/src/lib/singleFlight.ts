/**
 * Collapse concurrent calls of an async function into ONE execution.
 *
 * Written for the token refresh, where running twice is not merely wasteful
 * but actively destructive — see `api/client.ts`. Kept generic and free of
 * Supabase so the concurrency semantics can be unit-tested on their own;
 * the client itself cannot be imported in tests without real auth env.
 *
 * Semantics, all of which the tests pin:
 *
 * - while a call is in flight, every caller receives THAT promise
 * - once it settles the flight clears, so a later call starts fresh
 * - a rejection is delivered to every waiter and does NOT poison the next
 *   call (a failed refresh must not permanently disable refreshing)
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;
    // `finally` clears the slot AFTER settling. Callers already hold their own
    // reference to this promise, so clearing it cannot strand them.
    const flight = fn().finally(() => {
      if (inFlight === flight) inFlight = null;
    });
    inFlight = flight;
    return flight;
  };
}
