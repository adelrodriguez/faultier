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
  // Non-finite numbers become null, matching JSON.stringify's behavior for nested values.
  if (typeof value === "number") return Number.isFinite(value) ? value : null

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

// Prefix applied (repeatedly, until unique) to payload keys that would
// collide with reserved Fault fields during deserialization.
export const PAYLOAD_PREFIX = "__payload_"

export const FAULT_INSTANCE_RESERVED_KEYS = [
  "_tag",
  "cause",
  "name",
  "message",
  "stack",
  "meta",
  "details",
] as const

export const FAULT_METHOD_KEYS = [
  "toJSON",
  "toSerializable",
  "withMeta",
  "withMessage",
  "withDetails",
  "withDescription",
  "withCause",
  "unwrap",
  "getTags",
  "getContext",
  "flatten",
] as const

export const RESERVED_KEYS: ReadonlySet<string> = new Set<string>([
  ...FAULT_INSTANCE_RESERVED_KEYS,
  ...FAULT_METHOD_KEYS,
])

export const RESERVED_SERIALIZE_KEYS: ReadonlySet<string> = new Set<string>(
  FAULT_INSTANCE_RESERVED_KEYS
)

export const RESERVED_FROM_SERIALIZABLE_KEYS: ReadonlySet<string> = new Set<string>([
  "__faultier",
  ...FAULT_INSTANCE_RESERVED_KEYS,
])

export function collectPayloadFields(
  source: Record<string, unknown>,
  excludedKeys: ReadonlySet<string>,
  options?: { excludeFunctionValues?: boolean }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  const excludeFunctionValues = options?.excludeFunctionValues ?? false

  for (const key of Object.keys(source)) {
    if (excludedKeys.has(key)) continue

    const value = source[key]
    if (excludeFunctionValues && typeof value === "function") continue

    Object.defineProperty(payload, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }

  return payload
}
