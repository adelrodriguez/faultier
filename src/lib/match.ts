import type { Fault } from "./fault"

export type TagOf<E extends Fault> = E["_tag"]

export type ByTag<E extends Fault, T extends string> = Extract<E, { _tag: T }>

type MatchHandlers<E extends Fault> = Partial<{
  [T in TagOf<E>]: ((e: ByTag<E, T>) => unknown) | undefined
}>

export type HandlerResult<H> = ReturnType<Extract<H[keyof H], (...args: never[]) => unknown>>

type RequiredHandlerKeys<H> = {
  [K in keyof H]-?: undefined extends H[K]
    ? never
    : H[K] extends (...args: never[]) => unknown
      ? K
      : never
}[keyof H]

type MatchTagsResult<E extends Fault, H> =
  TagOf<E> extends RequiredHandlerKeys<H> ? HandlerResult<H> : HandlerResult<H> | undefined

export function dispatchTag(
  err: Fault,
  tag: PropertyKey,
  handler: (err: never) => unknown,
  fallback?: (err: never) => unknown
): unknown {
  if (err._tag === tag) {
    return handler(err as never)
  }

  return fallback?.(err as never)
}

export function dispatchTags(
  err: Fault,
  handlers: object,
  fallback?: (err: never) => unknown
): unknown {
  const handler = Object.hasOwn(handlers, err._tag)
    ? (handlers as Record<PropertyKey, ((matched: never) => unknown) | undefined>)[err._tag]
    : undefined

  if (typeof handler === "function") {
    return handler(err as never)
  }

  return fallback?.(err as never)
}

export function matchTag<E extends Fault, RH, T extends TagOf<E>>(
  err: E,
  tag: T & TagOf<NoInfer<E>>,
  handler: (e: ByTag<E, T>) => RH
): RH | undefined
export function matchTag<E extends Fault, RH, RF, T extends TagOf<E>>(
  err: E,
  tag: T & TagOf<NoInfer<E>>,
  handler: (e: ByTag<E, T>) => RH,
  fallback: (err: Exclude<E, { _tag: T }>) => RF
): RH | RF
export function matchTag<E extends Fault, RH, RF, T extends TagOf<E>>(
  err: E,
  tag: T & TagOf<NoInfer<E>>,
  handler: (e: ByTag<E, T>) => RH,
  fallback?: (err: Exclude<E, { _tag: T }>) => RF
): RH | RF | undefined {
  return dispatchTag(err, tag, handler, fallback) as RH | RF | undefined
}

export function matchTags<E extends Fault, const H extends MatchHandlers<E>>(
  err: E,
  handlers: H
): MatchTagsResult<E, H>
export function matchTags<E extends Fault, const H extends MatchHandlers<E>, RF>(
  err: E,
  handlers: H,
  /** Called when no handler matches. Receives the original error (not narrowed). */
  fallback: (err: E) => RF
): HandlerResult<H> | RF
export function matchTags<E extends Fault, const H extends MatchHandlers<E>, RF>(
  err: E,
  handlers: H,
  fallback?: (err: E) => RF
): HandlerResult<H> | RF | undefined {
  return dispatchTags(err, handlers, fallback) as HandlerResult<H> | RF | undefined
}
