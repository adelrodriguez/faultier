import { describe, expect, it } from "vitest"

import { fromSerializable, registry, Tagged } from "../index"

class ServiceError extends Tagged("ServiceError")() {}
class DatabaseError extends Tagged("DatabaseError")() {}

describe("#64 getContext keeps meta keys that exist on Object.prototype", () => {
  it("keeps constructor and toString meta keys", () => {
    const fault = new ServiceError().withMeta({ constructor: "x", ok: 1, toString: "y" })

    expect(fault.getContext()).toStrictEqual({ constructor: "x", ok: 1, toString: "y" })
  })

  it("keeps an inherited-name key set only on a cause", () => {
    const leaf = new DatabaseError().withMeta({ valueOf: "leaf" })
    const head = new ServiceError().withMeta({ requestId: "r1" }).withCause(leaf)

    expect(head.getContext()).toStrictEqual({ requestId: "r1", valueOf: "leaf" })
  })

  it("keeps an own __proto__ meta key without touching the result's prototype", () => {
    const meta = JSON.parse('{"__proto__":"x"}') as Record<string, string>
    const context = new ServiceError().withMeta(meta).getContext()

    expect(Object.getPrototypeOf(context)).toBe(Object.prototype)
    expect(Object.entries(context)).toStrictEqual([["__proto__", "x"]])
  })
})

describe("#65 native Error.cause chains survive traversal and transport", () => {
  function wrapNativeChain() {
    const root = new Error("root")
    const mid = new Error("mid", { cause: root })
    return { fault: new ServiceError().withMessage("svc").withCause(mid), mid, root }
  }

  it("unwraps through native Error causes to the root", () => {
    const { fault, mid, root } = wrapNativeChain()

    expect(fault.unwrap()).toStrictEqual([fault, mid, root])
  })

  it("flattens messages through native Error causes", () => {
    const { fault } = wrapNativeChain()

    expect(fault.flatten()).toBe("svc -> mid -> root")
  })

  it("finds faults that sit below a native Error in the chain", () => {
    const leaf = new DatabaseError().withMeta({ table: "users" })
    const mid = new Error("mid", { cause: leaf })
    const head = new ServiceError().withCause(mid)

    expect(head.getTags()).toStrictEqual(["ServiceError", "DatabaseError"])
    expect(head.getContext()).toStrictEqual({ table: "users" })
  })

  it("keeps the root cause across a serialization round trip", () => {
    const { fault } = wrapNativeChain()

    expect(fault.toSerializable()).toMatchObject({
      cause: { cause: { kind: "error", message: "root" } },
    })
    expect(fromSerializable(fault.toSerializable()).flatten()).toBe("svc -> mid -> root")
  })

  it("keeps nested native causes when a registry serializes a plain Error", () => {
    const { mid } = wrapNativeChain()

    expect(registry({ ServiceError }).toSerializable(mid)).toMatchObject({
      _tag: "UnknownError",
      cause: { cause: { kind: "error", message: "root" }, kind: "error", message: "mid" },
    })
  })

  it("stays bounded for circular native cause chains", () => {
    const loop = new Error("loop")
    loop.cause = loop
    const fault = new ServiceError().withCause(loop)

    expect(fault.unwrap()).toHaveLength(101)
    expect(() => fromSerializable(fault.toSerializable())).not.toThrow()
  })
})
