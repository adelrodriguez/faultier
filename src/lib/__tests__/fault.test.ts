import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { Fault, isFault, isReservedKey } from "../fault"
import { Tagged } from "../tagged"
import { RESERVED_FAULT_KEYS } from "../wire"

class ExampleFault extends Fault {
  constructor(message?: string) {
    super("ExampleFault", message)
  }
}

describe("Fault", () => {
  it("defaults message to tag", () => {
    const fault = new ExampleFault()
    expect(fault.message).toBe("ExampleFault")
    expect(fault.name).toBe("ExampleFault")
    expect(fault._tag).toBe("ExampleFault")
  })

  it("appends an indented caused-by stack", () => {
    const cause = new Error("root")
    cause.stack = "RootError: root\nline-1\nline-2"

    const fault = new ExampleFault()
    const originalStack = fault.stack
    fault.withCause(cause)

    expect(fault.stack).toBe(`${originalStack}\nCaused by: RootError: root\n  line-1\n  line-2`)
  })

  it("rebuilds stack when withCause is called multiple times", () => {
    const first = new Error("first")
    first.stack = "Error: first\nfirst-line"
    const second = new Error("second")
    second.stack = "Error: second\nsecond-line"

    const fault = new ExampleFault()
    const originalStack = fault.stack

    fault.withCause(first)
    expect(fault.stack).toBe(`${originalStack}\nCaused by: Error: first\n  first-line`)

    fault.withCause(second)
    expect(fault.stack).toBe(`${originalStack}\nCaused by: Error: second\n  second-line`)
  })

  it("restores original stack when cause has no stack", () => {
    const cause = new Error("root")
    cause.stack = "Error: root\nroot-line"

    const fault = new ExampleFault()
    const originalStack = fault.stack

    fault.withCause(cause)
    expect(fault.stack).not.toBe(originalStack)

    fault.withCause("not an error")
    expect(fault.stack).toBe(originalStack)
  })

  it("returns full unwrap chain from latest fault to root cause", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}
    class ApiError extends Tagged("ApiError")() {}

    const root = new Error("root")
    const db = new DatabaseError().withCause(root)
    const svc = new ServiceError().withCause(db)
    const api = new ApiError().withCause(svc)

    const chain = api.unwrap()

    expect(chain).toEqual([api, svc, db, root])
  })

  it("stops unwrap traversal when cause depth exceeds max", () => {
    const head = new ExampleFault("head")
    let current: ExampleFault = head

    for (let index = 0; index < 150; index += 1) {
      const next = new ExampleFault(`node-${index}`)
      current.withCause(next)
      current = next
    }

    const chain = head.unwrap()

    expect(chain.length).toBe(101)
    expect(chain[0]).toBe(head)
    expect((chain.at(-1) as ExampleFault).message).toBe("node-99")
  })

  it("stops unwrap traversal for circular cause chains", () => {
    const fault = new ExampleFault().withMessage("loop")
    fault.withCause(fault)

    const chain = fault.unwrap()

    expect(chain.length).toBe(101)
    expect(chain.every((item) => item === fault)).toBe(true)
  })

  it("avoids stack overflow when serializing circular cause chains", () => {
    const fault = new ExampleFault().withMessage("loop")
    fault.withCause(fault)

    const serialized = fault.toSerializable()

    expect(serialized.__faultier).toBe(true)

    let current = serialized
    let depth = 0

    while (current.cause?.kind === "fault") {
      depth += 1
      current = current.cause.value
      expect(current.message).toBe("loop")
    }

    expect(depth).toBe(100)
    expect(current.cause).toBeUndefined()
  })

  it("merges full context in head-to-leaf order with head precedence", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}
    class ApiError extends Tagged("ApiError")() {}

    const db = new DatabaseError().withMeta({ db: true, shared: "db" })
    const svc = new ServiceError().withMeta({ service: true, shared: "service" }).withCause(db)
    const api = new ApiError().withMeta({ api: true, shared: "api" }).withCause(svc)

    expect(api.getContext()).toEqual({
      api: true,
      db: true,
      service: true,
      shared: "api",
    })
  })

  it("sets only message with withDescription when details is omitted", () => {
    const fault = new ExampleFault().withDetails("existing details")

    fault.withDescription("updated message")

    expect(fault.message).toBe("updated message")
    expect(fault.details).toBe("existing details")
  })

  it("overwrites existing message and details with withDescription", () => {
    const fault = new ExampleFault().withMessage("old message").withDetails("old details")

    fault.withDescription("new message", "new details")

    expect(fault.message).toBe("new message")
    expect(fault.details).toBe("new details")
  })

  it("accumulates meta across multiple withMeta calls", () => {
    const fault = new ExampleFault()
      .withMeta({ requestId: "req-1" })
      .withMeta({ traceId: "trace-1" })
      .withMeta({ requestId: "req-2" })

    expect(fault.meta).toEqual({
      requestId: "req-2",
      traceId: "trace-1",
    })
  })

  it("returns tags from fault nodes in chain order", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withCause("raw")
    const head = new ServiceError().withCause(leaf)

    expect(head.getTags()).toEqual(["ServiceError", "DatabaseError"])
  })

  it("skips empty values in message flatten path", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withMessage("db")
    const head = new ServiceError().withMessage("svc").withCause(leaf)

    const flattened = head.flatten({
      formatter(value) {
        return value === "db" ? "" : value
      },
    })

    expect(flattened).toBe("svc")
  })

  it("flattens details when field is details", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withDetails("db details")
    const head = new ServiceError().withDetails("service details").withCause(leaf)

    expect(head.flatten({ field: "details" })).toBe("service details -> db details")
  })

  it("skips faults without details when flattening details", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withDetails("db details")
    const head = new ServiceError().withCause(leaf)

    expect(head.flatten({ field: "details" })).toBe("db details")
  })

  it("flattens safely when cause contains a circular object", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    const fault = new ExampleFault().withMessage("top").withCause(circular)

    expect(fault.flatten()).toBe("top -> [object Object]")
  })

  it("flattens any chain to the exact join of trimmed, consecutively-deduped messages", () => {
    const separator = " | "
    // Random strings almost never repeat or trim to empty, so mix in a small
    // pool that reliably exercises the dedupe and empty-skip branches.
    const messageArb = fc.oneof(
      fc.string({ maxLength: 10 }),
      fc.constantFrom("same", " same ", "other", "", "   ")
    )

    fc.assert(
      fc.property(fc.array(messageArb, { maxLength: 8, minLength: 1 }), (messages) => {
        class LayerError extends Tagged("LayerError")() {}

        let fault: Fault | undefined
        for (const message of messages) {
          const layer = new LayerError().withMessage(message)
          if (fault !== undefined) layer.withCause(fault)
          fault = layer
        }
        if (fault === undefined) throw new Error("unreachable: minLength is 1")

        // flatten() walks head to leaf (the reverse of construction order),
        // trims each message, drops empties, and dedupes consecutive repeats.
        const expected: string[] = []
        for (const message of messages.toReversed().map((value) => value.trim())) {
          if (message !== "" && message !== expected.at(-1)) expected.push(message)
        }

        expect(fault.flatten({ separator })).toBe(expected.join(separator))
      })
    )
  })

  it("serializes through toJSON when stringified", () => {
    const fault = new ExampleFault()
      .withDescription("message", "details")
      .withMeta({ key: "value" })

    const json = JSON.stringify(fault)
    const parsed = JSON.parse(json) as unknown

    expect(parsed).toEqual({
      __faultier: true,
      _tag: "ExampleFault",
      details: "details",
      message: "message",
      meta: { key: "value" },
      name: "ExampleFault",
      stack: fault.stack,
    })
  })
})

describe("isFault", () => {
  it("returns true for Fault instances", () => {
    expect(isFault(new ExampleFault())).toBe(true)
  })

  it("returns false for non-Fault values", () => {
    expect(isFault(new Error("plain"))).toBe(false)
    expect(isFault("error")).toBe(false)
    expect(isFault(null)).toBe(false)
  })
})

class ProbeFault extends Fault {
  constructor() {
    super("ProbeFault")
  }
}

describe("isReservedKey", () => {
  it("reserves every wire envelope key", () => {
    for (const key of RESERVED_FAULT_KEYS) {
      expect(isReservedKey(key)).toBe(true)
    }
  })

  it("reserves every property reachable through Fault's prototype chain", () => {
    let proto: object | null = ProbeFault.prototype

    while (proto !== null) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        expect(isReservedKey(key)).toBe(true)
      }
      proto = Object.getPrototypeOf(proto) as object | null
    }
  })

  it("controls exactly which own fields serialization includes as payload", () => {
    // oxlint-disable-next-line typescript/unbound-method -- always invoked with an explicit receiver via .call below.
    const toSerializable = Fault.prototype.toSerializable
    // Random strings almost never land on a prototype-derived reserved key,
    // so mix them in to make the exclusion branch reliable in every run.
    const keyArb = fc.oneof(
      fc.string({ maxLength: 30, minLength: 1 }),
      fc.constantFrom(
        "toString",
        "valueOf",
        "constructor",
        "hasOwnProperty",
        "__proto__",
        "unwrap",
        "withMeta",
        "toJSON",
        "toSerializable"
      )
    )

    fc.assert(
      fc.property(keyArb, fc.jsonValue({ maxDepth: 2 }), (key, value) => {
        const fault = new ProbeFault()
        Object.defineProperty(fault, key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        })

        // Call via the prototype: the generated key may shadow instance methods.
        const serialized = toSerializable.call(fault)

        if (!isReservedKey(key)) {
          expect(Object.hasOwn(serialized, key)).toBe(true)
          expect(serialized[key]).toEqual(value)
        } else if (!RESERVED_FAULT_KEYS.has(key)) {
          // Prototype-derived reserved keys (Fault methods, Error/Object
          // built-ins) must never leak into the wire object; envelope keys
          // are legitimately present.
          expect(Object.hasOwn(serialized, key)).toBe(false)
        }
      })
    )
  })
})
