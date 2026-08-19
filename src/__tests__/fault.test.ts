import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { Fault, isFault, Tagged } from "../index"

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

  it("sets cause through withCause", () => {
    const cause = new Error("root")
    const fault = new ExampleFault().withCause(cause)

    expect(fault.cause).toBe(cause)
    expect(fault.unwrap().length).toBe(2)
  })

  it("appends an indented caused-by stack", () => {
    const cause = new Error("root")
    cause.stack = "RootError: root\nline-1\nline-2"

    const fault = new ExampleFault().withCause(cause)

    expect(fault.stack).toContain("Caused by: RootError: root")
    expect(fault.stack).toContain("\n  line-1")
    expect(fault.stack).toContain("\n  line-2")
  })

  it("rebuilds stack when withCause is called multiple times", () => {
    const first = new Error("first")
    first.stack = "Error: first\nfirst-line"
    const second = new Error("second")
    second.stack = "Error: second\nsecond-line"

    const fault = new ExampleFault().withCause(first)
    expect(fault.stack).toContain("Caused by: Error: first")

    fault.withCause(second)
    expect(fault.stack).toContain("Caused by: Error: second")
    expect(fault.stack).not.toContain("Caused by: Error: first")
  })

  it("restores original stack when cause has no stack", () => {
    const cause = new Error("root")
    cause.stack = "Error: root\nroot-line"

    const fault = new ExampleFault().withCause(cause)
    expect(fault.stack).toContain("Caused by:")

    fault.withCause("not an error")
    expect(fault.stack).not.toContain("Caused by:")
  })

  it("returns unwrap chain in head-to-leaf order", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withMessage("db")
    const head = new ServiceError().withMessage("svc").withCause(leaf)
    const chain = head.unwrap()

    expect(chain[0]).toBe(head)
    expect(chain[1]).toBe(leaf)
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
  })

  it("stops unwrap traversal for circular cause chains", () => {
    const fault = new ExampleFault().withMessage("loop")
    fault.withCause(fault)

    const chain = fault.unwrap()

    expect(chain.length).toBe(101)
    expect(chain[0]).toBe(fault)
    expect(chain[1]).toBe(fault)
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
    }

    expect(depth).toBe(100)
    expect(current.cause).toBeUndefined()
  })

  it("merges context with head precedence", () => {
    const leaf = new ExampleFault().withMeta({ a: 1, b: 1 })
    const head = new ExampleFault().withMeta({ b: 2 }).withCause(leaf)

    expect(head.getContext()).toEqual({ a: 1, b: 2 })
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

  it("sets both message and details with withDescription", () => {
    const fault = new ExampleFault().withDescription("user message", "dev details")

    expect(fault.message).toBe("user message")
    expect(fault.details).toBe("dev details")
  })

  it("overwrites existing message and details with withDescription", () => {
    const fault = new ExampleFault().withMessage("old message").withDetails("old details")

    fault.withDescription("new message", "new details")

    expect(fault.message).toBe("new message")
    expect(fault.details).toBe("new details")
  })

  it("preserves fluent chaining subclass type with withDescription", () => {
    class AppError extends Tagged("AppError")() {}

    const fault = new AppError().withDescription("message", "details").withMeta({ code: "x" })

    expect(fault).toBeInstanceOf(AppError)
    expect(fault.message).toBe("message")
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

  it("flattens and deduplicates consecutive messages", () => {
    class InnerError extends Tagged("InnerError")() {}
    class OuterError extends Tagged("OuterError")() {}

    const leaf = new InnerError().withMessage("same")
    const head = new OuterError().withMessage("same").withCause(leaf)

    expect(head.flatten()).toBe("same")
  })

  it("flattens in head-to-leaf order", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withMessage("db")
    const head = new ServiceError().withMessage("svc").withCause(leaf)

    expect(head.flatten()).toBe("svc -> db")
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

  it("flattens chains with non-fault Error causes", () => {
    const fault = new ExampleFault().withMessage("svc").withCause(new Error("db"))

    expect(fault.flatten()).toBe("svc -> db")
  })

  it("flattens safely when cause contains a circular object", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    const fault = new ExampleFault().withMessage("top").withCause(circular)

    expect(() => fault.flatten()).not.toThrow()
    expect(fault.flatten()).toBe("top -> [object Object]")
  })

  it("flattens any chain to trimmed messages with no empties or consecutive duplicates", () => {
    const separator = " | "
    const messageArb = fc.string({ minLength: 1 }).filter((value) => !value.includes(separator))

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

        const parts = fault.flatten({ separator }).split(separator)
        const chainMessages = messages.toReversed().map((value) => value.trim())

        for (const [index, part] of parts.entries()) {
          expect(part).not.toBe("")
          expect(part).not.toBe(parts[index + 1])
          expect(chainMessages).toContain(part)
        }
      })
    )
  })

  it("excludes method keys from serialized payload", () => {
    const fault = new ExampleFault()
      .withDescription("message", "details")
      .withMeta({ key: "value" })

    const serialized = fault.toSerializable()
    const keys = Object.keys(serialized)

    expect(keys).not.toContain("withDescription")
    expect(keys).not.toContain("withMessage")
    expect(keys).not.toContain("withDetails")
    expect(keys).not.toContain("withCause")
    expect(keys).not.toContain("withMeta")
    expect(keys).not.toContain("getContext")
    expect(keys).not.toContain("getTags")
    expect(keys).not.toContain("flatten")
    expect(keys).not.toContain("unwrap")
    expect(keys).not.toContain("toSerializable")
    expect(keys).not.toContain("toJSON")
  })

  it("serializes through toJSON when stringified", () => {
    const fault = new ExampleFault()
      .withDescription("message", "details")
      .withMeta({ key: "value" })

    const json = JSON.stringify(fault)
    const parsed = JSON.parse(json) as Record<string, unknown>

    expect(parsed.__faultier).toBe(true)
    expect(parsed._tag).toBe("ExampleFault")
    expect(parsed.message).toBe("message")
    expect(parsed.details).toBe("details")
    expect(parsed.meta).toEqual({ key: "value" })
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
