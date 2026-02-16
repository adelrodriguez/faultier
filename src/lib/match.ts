import type { Fault } from "./fault"

export type TagOf<E extends Fault> = E["_tag"]

export type ByTag<E extends Fault, T extends string> = Extract<E, { _tag: T }>

type NoInferType<T> = [T][T extends unknown ? 0 : never]

type MatchHandlers<E extends Fault> = Partial<{
  [T in TagOf<E>]: (e: ByTag<E, T>) => unknown
}>

type MatchHandlersExhaustive<E extends Fault> = {
  [T in TagOf<E>]: (e: ByTag<E, T>) => unknown
}

type HandlerResult<H> = NonNullable<H[keyof H]> extends (...args: never[]) => infer R ? R : never

export function matchTag<E extends Fault, R, T extends TagOf<E>>(
  err: E,
  tag: T & TagOf<NoInferType<E>>,
  handler: (e: ByTag<E, T>) => R
): R | undefined
export function matchTag<E extends Fault, R, T extends TagOf<E>>(
  err: E,
  tag: T & TagOf<NoInferType<E>>,
  handler: (e: ByTag<E, T>) => R,
  fallback: (err: Exclude<E, { _tag: T }>) => R
): R
export function matchTag<E extends Fault, R, T extends TagOf<E>>(
  err: E,
  tag: T & TagOf<NoInferType<E>>,
  handler: (e: ByTag<E, T>) => R,
  fallback?: (err: Exclude<E, { _tag: T }>) => R
): R | undefined {
  if (err._tag === tag) {
    return handler(err as ByTag<E, T>)
  }

  return fallback?.(err as Exclude<E, { _tag: T }>)
}

export function matchTags<E extends Fault, H extends MatchHandlersExhaustive<NoInferType<E>>>(
  err: E,
  handlers: H
): HandlerResult<H>
export function matchTags<E extends Fault, H extends MatchHandlers<NoInferType<E>>>(
  err: E,
  handlers: H
): HandlerResult<H> | undefined
export function matchTags<E extends Fault, H extends MatchHandlers<NoInferType<E>>, R>(
  err: E,
  handlers: H,
  /** Called when no handler matches. Receives the original error (not narrowed). */
  fallback: (err: E) => R
): HandlerResult<H> | R
export function matchTags<E extends Fault, H extends MatchHandlers<NoInferType<E>>, R>(
  err: E,
  handlers: H,
  fallback?: (err: E) => R
): HandlerResult<H> | R | undefined {
  const handler = handlers[err._tag as keyof H]

  if (typeof handler === "function") {
    return handler(err as never) as HandlerResult<H>
  }

  return fallback?.(err)
}
