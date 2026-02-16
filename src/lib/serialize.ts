import type { SerializableCause, SerializableFault } from "./fault"
import { Fault } from "./fault"
import {
  collectPayloadFields,
  MAX_CAUSE_DEPTH,
  RESERVED_FROM_SERIALIZABLE_KEYS,
  RESERVED_KEYS,
} from "./utils"

class DeserializedFault extends Fault {
  static create(tag: string): DeserializedFault {
    return new DeserializedFault(tag)
  }

  private constructor(tag: string) {
    super(tag)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function createDeserializedError(name: string, message: string, stack?: string): Error {
  const error = new Error(message)
  error.name = name
  error.stack = stack
  return error
}

export function extractPayloadFields(json: SerializableFault): Record<string, unknown> {
  return collectPayloadFields(json, RESERVED_FROM_SERIALIZABLE_KEYS)
}

export function deserializeCause(
  cause: SerializableCause,
  resolveFaultCause: (json: SerializableFault) => unknown,
  depth: number
): unknown {
  if (cause.kind === "fault") {
    // Invariant: allow at most MAX_CAUSE_DEPTH nested fault edges.
    if (depth >= MAX_CAUSE_DEPTH) return undefined
    return resolveFaultCause(cause.value)
  }

  if (cause.kind === "error") {
    return createDeserializedError(cause.name, cause.message, cause.stack)
  }

  return cause.value
}

export function restoreDeserializedFields(fault: Fault, json: SerializableFault): void {
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
    if (!isRecord(json.meta)) {
      throw new Error("Invalid Faultier payload: meta must be an object")
    }
    target.meta = json.meta
  }

  if (typeof json.stack === "string") {
    target.stack = json.stack
  }
}

export function fromSerializable(json: SerializableFault): Fault {
  return fromSerializableInternal(json, 0)
}

function fromSerializableInternal(json: SerializableFault, depth: number): Fault {
  if (!isRecord(json) || !json.__faultier) {
    throw new Error("Invalid Faultier payload: expected __faultier: true")
  }

  if (typeof json._tag !== "string") {
    throw new Error("Invalid Faultier payload: _tag must be a string")
  }

  const fault = DeserializedFault.create(json._tag)
  const payload = extractPayloadFields(json)

  for (const key of Object.keys(payload)) {
    const targetKey = RESERVED_KEYS.has(key) ? `__payload_${key}` : key
    ;(fault as unknown as Record<string, unknown>)[targetKey] = payload[key]
  }
  restoreDeserializedFields(fault, json)

  if (json.cause) {
    // Intentionally assign cause directly instead of withCause().
    // Serialized stacks already contain any prior "Caused by:" enhancement.
    fault.cause = deserializeCause(
      json.cause,
      (value) => fromSerializableInternal(value, depth + 1),
      depth
    )
  }

  return fault
}
