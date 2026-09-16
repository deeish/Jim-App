import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Who is making the current request, readable anywhere in the request's async
 * chain without threading it through every signature.
 *
 * Shape: `RequestActorMiddleware` (global, see AppModule) opens one context
 * per request with `store.run`, BEFORE guards run; `AuthGuard` then fills in
 * the actor once the token verifies. The context object is shared by
 * reference, so filling it in from the guard needs no `enterWith`.
 *
 * ⚠ Do not "simplify" this back to `enterWith` inside the guard. That was the
 * first version: on the local rig the actor reached the LLM client for one
 * request and was missing on the next, because a context entered after an
 * `await` inside `canActivate` is not seen by the caller's continuation.
 * The middleware + shared object shape is what nestjs-cls does, and it held
 * on the rig for both users.
 *
 * The first consumer is the generation allowlist in `LlmClient`
 * (`AI_GENERATION_ALLOWLIST`): only listed accounts spend model tokens, and
 * everyone else gets the rule-based builder. Outside a request (scripts,
 * tests) there is no actor, and consumers decide what that means for them.
 */
export interface RequestActor {
  id: string;
  email?: string | null;
}

type RequestContext = { actor: RequestActor | null };

const store = new AsyncLocalStorage<RequestContext>();

/** Run `fn` inside a fresh, empty request context (the middleware's job). */
export function runWithRequestContext<T>(fn: () => T): T {
  return store.run({ actor: null }, fn);
}

/** Record the verified actor on the current request's context (the guard's job). */
export function setRequestActor(actor: RequestActor): void {
  const ctx = store.getStore();
  if (ctx) {
    ctx.actor = actor;
    return;
  }
  // No middleware context (a handler wired outside AppModule): best effort.
  store.enterWith({ actor });
}

/** Run `fn` with `actor` as the current actor (tests, scripts). */
export function runWithRequestActor<T>(actor: RequestActor, fn: () => T): T {
  return store.run({ actor }, fn);
}

/** The current request's actor, or `undefined` outside a request / before auth. */
export function currentRequestActor(): RequestActor | undefined {
  return store.getStore()?.actor ?? undefined;
}

/** Opens the per-request context. Registered for every route in AppModule. */
@Injectable()
export class RequestActorMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    runWithRequestContext(() => next());
  }
}
