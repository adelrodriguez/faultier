import {
  collectPayloadFields,
  defaultTrimFormatter,
  FAULT_METHOD_KEYS,
  MAX_CAUSE_DEPTH,
  RESERVED_SERIALIZE_KEYS,
} from "./utils"

export type FlattenField = "message" | "details"

export type FlattenOptions = {
  field?: FlattenField
  separator?: string
  formatter?: (value: string) => string
}

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

const FAULT_METHOD_KEY_SET = new Set<string>(FAULT_METHOD_KEYS)
const SERIALIZE_EXCLUDED_KEYS = new Set<string>([
  ...RESERVED_SERIALIZE_KEYS,
  ...FAULT_METHOD_KEY_SET,
])

function toCause(cause: unknown, depth: number): SerializableCause {
  if (cause instanceof Fault) {
    return { kind: "fault", value: serializeFault(cause, depth + 1) }
  }

  if (cause instanceof Error) {
    return {
      kind: "error",
      message: cause.message,
      name: cause.name,
      stack: cause.stack,
    }
  }

  return { kind: "thrown", value: cause }
}

function serializeFault(fault: Fault, depth: number): SerializableFault {
  const payload = collectPayloadFields(
    fault as unknown as Record<string, unknown>,
    SERIALIZE_EXCLUDED_KEYS,
    {
      excludeFunctionValues: true,
    }
  )

  const serialized: SerializableFault = {
    __faultier: true,
    ...payload,
    _tag: fault._tag,
    message: fault.message,
    name: fault.name,
  }

  if (fault.details !== undefined) serialized.details = fault.details
  if (fault.meta !== undefined) serialized.meta = fault.meta
  if (fault.stack !== undefined) serialized.stack = fault.stack

  if (fault.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    serialized.cause = toCause(fault.cause, depth)
  }

  return serialized
}

function valueToMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`
  }
  if (typeof value === "symbol") {
    return value.description ?? value.toString()
  }
  if (value === undefined) return "undefined"
  if (value === null) return "null"

  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }

  return ""
}

export abstract class Fault extends Error {
  readonly _tag: string
  override cause?: unknown
  meta?: Record<string, unknown>
  details?: string
  #originalStack?: string

  protected constructor(tag: string, message?: string) {
    super(message ?? tag)
    this._tag = tag
    this.name = tag
    this.#originalStack = this.stack
  }

  withMeta(meta: Record<string, unknown>): this {
    this.meta = { ...this.meta, ...meta }
    return this
  }

  withMessage(message: string): this {
    this.message = message
    return this
  }

  withDetails(details: string): this {
    this.details = details
    return this
  }

  withDescription(message: string, details?: string): this {
    this.message = message
    if (details !== undefined) {
      this.details = details
    }
    return this
  }

  withCause(cause: unknown): this {
    this.cause = cause

    // Rebuild stack from the original (pre-cause) stack on every call,
    // so replacing a cause doesn't leave stale "Caused by:" blocks.
    if (cause instanceof Error && cause.stack && this.#originalStack) {
      const indented = cause.stack.replaceAll("\n", "\n  ")
      this.stack = `${this.#originalStack}\nCaused by: ${indented}`
    } else {
      this.stack = this.#originalStack
    }

    return this
  }

  unwrap(): [Fault, ...unknown[]] {
    const chain: unknown[] = [this]
    let current: unknown = this.cause
    let depth = 0

    while (current !== undefined && depth < MAX_CAUSE_DEPTH) {
      chain.push(current)
      depth += 1

      if (current instanceof Fault) {
        current = current.cause
        continue
      }

      break
    }

    return chain as [Fault, ...unknown[]]
  }

  getTags(): string[] {
    return this.unwrap()
      .filter((item): item is Fault => item instanceof Fault)
      .map((item) => item._tag)
  }

  getContext(): Record<string, unknown> {
    const faults = this.unwrap().filter((item): item is Fault => item instanceof Fault)
    const merged: Record<string, unknown> = {}

    for (const fault of faults) {
      const meta = fault.meta ?? {}

      for (const [key, value] of Object.entries(meta)) {
        if (!(key in merged)) {
          merged[key] = value
        }
      }
    }

    return merged
  }

  flatten(options?: FlattenOptions): string {
    const {
      field = "message",
      formatter = defaultTrimFormatter,
      separator = " -> ",
    } = options ?? {}

    // Details path does not deduplicate — details are typically unique per layer.
    // Message path deduplicates because wrappers often copy the inner message verbatim.
    if (field === "details") {
      return this.unwrap()
        .filter((item): item is Fault => item instanceof Fault)
        .map((item) => item.details)
        .filter((value): value is string => value !== undefined)
        .map((value) => formatter(value))
        .filter((value) => value !== "")
        .join(separator)
    }

    const values = this.unwrap().map((item) => formatter(valueToMessage(item)))
    const deduped: string[] = []
    let previous: string | undefined

    for (const value of values) {
      if (value !== "" && value !== previous) {
        deduped.push(value)
        previous = value
      }
    }

    return deduped.join(separator)
  }

  toSerializable(): SerializableFault {
    return serializeFault(this, 0)
  }

  toJSON(): SerializableFault {
    return this.toSerializable()
  }
}

export function isFault(value: unknown): value is Fault {
  return value instanceof Fault
}
