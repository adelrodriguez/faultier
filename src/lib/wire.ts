// The wire format contract shared by Fault encoding (fault.ts) and
// decoding (reviver.ts). This module must stay dependency-free so the
// lib import graph remains a DAG.

export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly SerializableValue[]
  | { readonly [key: string]: SerializableValue }

export type SerializableCause =
  | { kind: "fault"; value: SerializableFault }
  | { kind: "error"; name: string; message: string; stack?: string }
  | { kind: "thrown"; value: SerializableValue }

export type SerializableFault = {
  __faultier: true
  _tag: string
  name: string
  message?: string
  details?: string
  meta?: Record<string, SerializableValue>
  stack?: string
  cause?: SerializableCause
  [key: string]: SerializableValue | SerializableCause | undefined
}

function stringifyFallback(value: object): string {
  try {
    // oxlint-disable-next-line typescript/no-base-to-string -- thrown objects may only have a default string representation.
    return String(value)
  } catch {
    return "[Unserializable]"
  }
}

export function normalizeThrown(value: unknown): SerializableValue {
  // Match JSON.stringify's number semantics: non-finite numbers become null
  // and -0 canonicalizes to 0, so the output survives transport identically.
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    return value === 0 ? 0 : value
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value
  }

  if (typeof value === "bigint") return `${value}`
  if (typeof value === "symbol") return value.description ?? value.toString()
  if (typeof value === "function") return "[Function]"

  try {
    const serialized = JSON.stringify(value) as string | undefined
    if (serialized === undefined) return stringifyFallback(value)

    const parsed: unknown = JSON.parse(serialized)
    // JSON.parse only produces JSON-safe primitives, arrays, and objects.
    return parsed as SerializableValue
  } catch {
    return stringifyFallback(value)
  }
}

export const MAX_CAUSE_DEPTH = 100

// The canonical wire envelope keys. Everything else on a SerializableFault
// is user payload. Fault methods are not listed here: they live on the
// prototype, so isReservedKey (fault.ts) covers them via a prototype check.
export const RESERVED_FAULT_KEYS: ReadonlySet<string> = new Set<string>([
  "__faultier",
  "_tag",
  "cause",
  "name",
  "message",
  "stack",
  "meta",
  "details",
])

// Collects own payload fields, skipping excluded keys and function values.
// defineProperty (not assignment) so a "__proto__" key becomes an own data
// property instead of triggering the Object.prototype.__proto__ setter.
export function collectPayloadFields(
  source: Record<string, unknown>,
  isExcluded: (key: string) => boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const key of Object.keys(source)) {
    if (isExcluded(key)) continue

    const value = source[key]
    if (typeof value === "function") continue

    Object.defineProperty(payload, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }

  return payload
}
