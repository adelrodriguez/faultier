export const MAX_CAUSE_DEPTH = 100

export function defaultTrimFormatter(value: string): string {
  return value.trim()
}

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

export const RESERVED_KEYS = new Set<string>([
  ...FAULT_INSTANCE_RESERVED_KEYS,
  ...FAULT_METHOD_KEYS,
])

export const RESERVED_SERIALIZE_KEYS = new Set<string>(FAULT_INSTANCE_RESERVED_KEYS)

export const RESERVED_FROM_SERIALIZABLE_KEYS = new Set<string>([
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

    payload[key] = value
  }

  return payload
}
