import { Fault, isReservedKey } from "./fault"
import {
  collectPayloadFields,
  MAX_CAUSE_DEPTH,
  RESERVED_FAULT_KEYS,
  type SerializableCause,
  type SerializableFault,
} from "./wire"

export type FaultResolver = (tag: string, payload: Record<string, unknown>) => Fault | undefined

// Prefix applied (repeatedly, until unique) to payload keys that would
// collide with reserved Fault keys during deserialization.
const PAYLOAD_PREFIX = "__payload_"

type PreparedPayload = {
  collisionPayload: Record<string, unknown>
  constructorPayload: Record<string, unknown>
}

class DeserializedFault extends Fault {
  // Static factory because Fault's constructor is protected; a bare public
  // constructor would be flagged as useless.
  static create(tag: string): DeserializedFault {
    return new DeserializedFault(tag)
  }

  private constructor(tag: string) {
    super(tag)
  }
}

function assertSerializableFault(value: unknown): asserts value is SerializableFault {
  if (
    typeof value !== "object" ||
    value === null ||
    !("__faultier" in value) ||
    value.__faultier !== true
  ) {
    throw new Error("Invalid Faultier payload: expected __faultier: true")
  }

  if (!("_tag" in value) || typeof value._tag !== "string") {
    throw new Error("Invalid Faultier payload: _tag must be a string")
  }

  if (
    "meta" in value &&
    value.meta !== undefined &&
    (typeof value.meta !== "object" || value.meta === null)
  ) {
    throw new Error("Invalid Faultier payload: meta must be an object")
  }
}

function createDeserializedError(name: string, message: string, stack?: string): Error {
  const error = new Error(message)
  error.name = name
  error.stack = stack
  return error
}

function extractPayloadFields(json: SerializableFault): Record<string, unknown> {
  // Exclude only envelope keys here (not the full reserved rule): a wire key
  // that shadows a Fault method must be renamed by preparePayload, not dropped.
  return collectPayloadFields(json, (key) => RESERVED_FAULT_KEYS.has(key))
}

function definePayloadField(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}

function preparePayload(payload: Record<string, unknown>): PreparedPayload {
  const collisionPayload: Record<string, unknown> = {}
  const constructorPayload: Record<string, unknown> = {}
  const rawKeys = new Set(Object.keys(payload))
  const assignedKeys = new Set<string>()

  for (const [key, value] of Object.entries(payload)) {
    let targetKey = key

    while (
      isReservedKey(targetKey) ||
      assignedKeys.has(targetKey) ||
      (targetKey !== key && rawKeys.has(targetKey))
    ) {
      targetKey = `${PAYLOAD_PREFIX}${targetKey}`
    }

    assignedKeys.add(targetKey)

    if (targetKey === key) {
      definePayloadField(constructorPayload, key, value)
    } else {
      definePayloadField(collisionPayload, targetKey, value)
    }
  }

  return { collisionPayload, constructorPayload }
}

function restorePayloadFields(fault: Fault, payload: Record<string, unknown>): void {
  const target = fault as unknown as Record<string, unknown>

  for (const [key, value] of Object.entries(payload)) {
    definePayloadField(target, key, value)
  }
}

function deserializeCause(
  cause: SerializableCause,
  resolveFault: FaultResolver | undefined,
  depth: number
): unknown {
  if (cause.kind === "fault") {
    // Invariant: allow at most MAX_CAUSE_DEPTH nested fault edges.
    if (depth >= MAX_CAUSE_DEPTH) return undefined
    return deserializeFaultInternal(cause.value, resolveFault, depth + 1)
  }

  if (cause.kind === "error") {
    return createDeserializedError(cause.name, cause.message, cause.stack)
  }

  return cause.value
}

function restoreDeserializedFields(fault: Fault, json: SerializableFault): void {
  const target = fault

  if (typeof json.name === "string") {
    target.name = json.name
  }

  if (typeof json.message === "string") {
    target.message = json.message
  }

  if (typeof json.details === "string") {
    target.details = json.details
  }

  if (json.meta !== undefined) {
    target.meta = json.meta
  }

  if (typeof json.stack === "string") {
    target.stack = json.stack
  }
}

export function fromSerializable(json: SerializableFault): Fault {
  return deserializeFault(json)
}

export function deserializeFault(json: SerializableFault, resolveFault?: FaultResolver): Fault {
  return deserializeFaultInternal(json, resolveFault, 0)
}

function deserializeFaultInternal(
  json: unknown,
  resolveFault: FaultResolver | undefined,
  depth: number
): Fault {
  assertSerializableFault(json)

  const payload = preparePayload(extractPayloadFields(json))
  const resolvedFault = resolveFault?.(json._tag, payload.constructorPayload)
  const fault = resolvedFault ?? DeserializedFault.create(json._tag)

  // A resolved constructor already applied constructorPayload; the generic
  // fallback needs both buckets restored directly.
  if (!resolvedFault) {
    restorePayloadFields(fault, payload.constructorPayload)
  }
  restorePayloadFields(fault, payload.collisionPayload)
  restoreDeserializedFields(fault, json)

  if (json.cause) {
    // Intentionally assign cause directly instead of withCause().
    // Serialized stacks already contain any prior "Caused by:" enhancement.
    fault.cause = deserializeCause(json.cause, resolveFault, depth)
  }

  return fault
}
