import type { RequestActor } from '../common/request-actor.context';

/**
 * Who may spend model tokens. A beta switch, not a product feature: while the
 * paid Gemini key is being watched (2026-09-15, Dylan's call), only listed
 * accounts reach the model and every other generation is served by the
 * rule-based builder, silently and for free. Remove the env var to open it up.
 *
 * `AI_GENERATION_ALLOWLIST` is a comma- or whitespace-separated list of
 * account emails and/or Supabase user ids, matched case-insensitively.
 * Empty or unset = no restriction.
 */
export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * With an empty list everyone is allowed. With a list, the actor must be on
 * it by email or id — and a MISSING actor is denied: an unauthenticated path
 * that reaches the model is exactly what the switch exists to stop.
 */
export function isActorAllowed(
  allowlist: readonly string[],
  actor: RequestActor | undefined,
): boolean {
  if (allowlist.length === 0) return true;
  if (!actor) return false;
  const email = actor.email?.trim().toLowerCase();
  const id = actor.id?.trim().toLowerCase();
  return allowlist.some((entry) => entry === email || entry === id);
}

/** Thrown by `LlmClient.completeJson` for an actor the allowlist keeps out. */
export class LlmPolicyDeniedError extends Error {
  readonly code = 'LLM_POLICY_DENIED' as const;
  constructor(actor: RequestActor | undefined) {
    super(
      actor
        ? `generation allowlist: ${actor.email ?? actor.id} is not listed`
        : 'generation allowlist: no request actor',
    );
    this.name = 'LlmPolicyDeniedError';
  }
}
