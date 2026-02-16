import { describe, expect, test } from "bun:test"

import { isFault } from "../../index"
import { Fault } from "../fault"
import { Tagged } from "../tagged"

class ExampleFault extends Fault {
  constructor(message?: string) {
    super("ExampleFault", message)
  }
}

describe("Fault", () => {
  test("should default message to tag", () => {
    const fault = new ExampleFault()
    expect(fault.message).toBe("ExampleFault")
    expect(fault.name).toBe("ExampleFault")
    expect(fault._tag).toBe("ExampleFault")
  })

  test("should set cause through withCause", () => {
    const cause = new Error("root")
    const fault = new ExampleFault().withCause(cause)

    expect(fault.cause).toBe(cause)
    expect(fault.unwrap().length).toBe(2)
  })

  test("should append an indented caused-by stack", () => {
    const cause = new Error("root")
    cause.stack = "RootError: root\nline-1\nline-2"

    const fault = new ExampleFault().withCause(cause)

    expect(fault.stack).toContain("Caused by: RootError: root")
    expect(fault.stack).toContain("\n  line-1")
    expect(fault.stack).toContain("\n  line-2")
  })

  test("should rebuild stack correctly when withCause is called multiple times", () => {
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

  test("should restore original stack when cause has no stack", () => {
    const cause = new Error("root")
    cause.stack = "Error: root\nroot-line"

    const fault = new ExampleFault().withCause(cause)
    expect(fault.stack).toContain("Caused by:")

    fault.withCause("not an error")
    expect(fault.stack).not.toContain("Caused by:")
  })

  test("should return unwrap chain in head-to-leaf order", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withMessage("db")
    const head = new ServiceError().withMessage("svc").withCause(leaf)
    const chain = head.unwrap()

    expect(chain[0]).toBe(head)
    expect(chain[1]).toBe(leaf)
  })

  test("should return full unwrap chain from latest fault to root cause", () => {
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

  test("should stop unwrap traversal when cause depth exceeds max", () => {
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

  test("should stop unwrap traversal for circular cause chains", () => {
    const fault = new ExampleFault().withMessage("loop")
    fault.withCause(fault)

    const chain = fault.unwrap()

    expect(chain.length).toBe(101)
    expect(chain[0]).toBe(fault)
    expect(chain[1]).toBe(fault)
  })

  test("should not stack overflow when serializing circular cause chains", () => {
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

  test("should merge context with head precedence", () => {
    const leaf = new ExampleFault().withMeta({ a: 1, b: 1 })
    const head = new ExampleFault().withMeta({ b: 2 }).withCause(leaf)

    expect(head.getContext()).toEqual({ a: 1, b: 2 })
  })

  test("should merge full context in head-to-leaf order with head precedence", () => {
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

  test("should set message only with withDescription when details is omitted", () => {
    const fault = new ExampleFault().withDetails("existing details")

    fault.withDescription("updated message")

    expect(fault.message).toBe("updated message")
    expect(fault.details).toBe("existing details")
  })

  test("should set both message and details with withDescription", () => {
    const fault = new ExampleFault().withDescription("user message", "dev details")

    expect(fault.message).toBe("user message")
    expect(fault.details).toBe("dev details")
  })

  test("should overwrite existing message and details with withDescription", () => {
    const fault = new ExampleFault().withMessage("old message").withDetails("old details")

    fault.withDescription("new message", "new details")

    expect(fault.message).toBe("new message")
    expect(fault.details).toBe("new details")
  })

  test("should preserve fluent chaining subclass type with withDescription", () => {
    class AppError extends Tagged("AppError")() {}

    const fault = new AppError().withDescription("message", "details").withMeta({ code: "x" })

    expect(fault).toBeInstanceOf(AppError)
    expect(fault.message).toBe("message")
  })

  test("should accumulate meta across multiple withMeta calls", () => {
    const fault = new ExampleFault()
      .withMeta({ requestId: "req-1" })
      .withMeta({ traceId: "trace-1" })
      .withMeta({ requestId: "req-2" })

    expect(fault.meta).toEqual({
      requestId: "req-2",
      traceId: "trace-1",
    })
  })

  test("should return tags from fault nodes in chain order", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withCause("raw")
    const head = new ServiceError().withCause(leaf)

    expect(head.getTags()).toEqual(["ServiceError", "DatabaseError"])
  })

  test("should flatten and deduplicate consecutive messages", () => {
    class InnerError extends Tagged("InnerError")() {}
    class OuterError extends Tagged("OuterError")() {}

    const leaf = new InnerError().withMessage("same")
    const head = new OuterError().withMessage("same").withCause(leaf)

    expect(head.flatten()).toBe("same")
  })

  test("should flatten in head-to-leaf order", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withMessage("db")
    const head = new ServiceError().withMessage("svc").withCause(leaf)

    expect(head.flatten()).toBe("svc -> db")
  })

  test("should skip empty values in message flatten path", () => {
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

  test("should flatten details when field is details", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withDetails("db details")
    const head = new ServiceError().withDetails("service details").withCause(leaf)

    expect(head.flatten({ field: "details" })).toBe("service details -> db details")
  })

  test("should skip faults without details when flattening details", () => {
    class DatabaseError extends Tagged("DatabaseError")() {}
    class ServiceError extends Tagged("ServiceError")() {}

    const leaf = new DatabaseError().withDetails("db details")
    const head = new ServiceError().withCause(leaf)

    expect(head.flatten({ field: "details" })).toBe("db details")
  })

  test("should flatten chains with non-fault Error causes", () => {
    const fault = new ExampleFault().withMessage("svc").withCause(new Error("db"))

    expect(fault.flatten()).toBe("svc -> db")
  })

  test("should flatten safely when cause contains a circular object", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    const fault = new ExampleFault().withMessage("top").withCause(circular)

    expect(() => fault.flatten()).not.toThrow()
    expect(fault.flatten()).toBe("top -> [object Object]")
  })

  test("should not include method keys in serialized payload", () => {
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
  })
})

describe("isFault", () => {
  test("should return true for Fault instances", () => {
    expect(isFault(new ExampleFault())).toBe(true)
  })

  test("should return false for non-Fault values", () => {
    expect(isFault(new Error("plain"))).toBe(false)
    expect(isFault("error")).toBe(false)
    expect(isFault(null)).toBe(false)
  })
})
