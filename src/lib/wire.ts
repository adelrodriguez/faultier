// The wire format contract shared by Fault encoding (fault.ts) and
// decoding (reviver.ts). This module must stay dependency-free so the
// lib import graph remains a DAG.

export type SerializableCause =
  | { kind: "fault"; value: SerializableFault }
  | { kind: "error"; name: string; message: string; stack?: string }
  | { kind: "thrown"; value: unknown }

export type SerializableFault = {
  __faultier: true
  _tag: string
  name: string
  message?: string
  details?: string
  meta?: Record<string, unknown>
  stack?: string
  cause?: SerializableCause
  [key: string]: unknown
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
