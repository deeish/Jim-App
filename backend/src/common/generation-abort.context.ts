import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped AbortSignal for AI generation.
 *
 * The plans controller runs `generateSessions` inside {@link runWithGenerationSignal}
 * with a signal tied to the HTTP request. Deep in the generator, each Groq
 * `chat.completions.create(...)` call reads {@link currentGenerationSignal} and
 * passes it as `{ signal }`, so when the client navigates away ("Edit inputs")
 * and the connection drops, the in-flight Groq call aborts instead of running to
 * completion and burning free-tier tokens.
 *
 * Using AsyncLocalStorage avoids threading an AbortSignal param through every
 * nested generator method (batch / polish / per-session). It is null-safe:
 * callers outside a `run(...)` scope (e.g. slot-fill materialization) simply get
 * `undefined` and behave exactly as before.
 */
const store = new AsyncLocalStorage<{ signal: AbortSignal }>();

/** Run `fn` with `signal` available to any nested generation code via {@link currentGenerationSignal}. */
export function runWithGenerationSignal<T>(
  signal: AbortSignal,
  fn: () => T,
): T {
  return store.run({ signal }, fn);
}

/** The current request's generation AbortSignal, or `undefined` outside a run scope. */
export function currentGenerationSignal(): AbortSignal | undefined {
  return store.getStore()?.signal;
}
