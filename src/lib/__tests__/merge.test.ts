import { describe, expect, test } from "bun:test"

import { RegistryMergeConflictError } from "../errors"
import { merge } from "../merge"
import { registry } from "../registry"
import { Tagged } from "../tagged"

class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}
class DatabaseError extends Tagged("DatabaseError")<{ query: string }>() {}
class PaymentError extends Tagged("PaymentError")<{ invoiceId: string }>() {}
class TimeoutConflictError extends Tagged("TimeoutError")<{ retryable: boolean }>() {}

describe("merge", () => {
  test("should throw for conflicting duplicate tags", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const DbFault = registry({
      DatabaseError,
      TimeoutError: TimeoutConflictError,
    })

    expect(() => merge(AppFault, DbFault)).toThrow(RegistryMergeConflictError)
  })

  test("should allow duplicate tags when constructor reference is identical", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const SharedFault = registry({ TimeoutError })

    const MergedFault = merge(AppFault, SharedFault)

    expect(MergedFault.tags).toEqual(["NotFoundError", "TimeoutError"])
  })

  test("should preserve deterministic tag order", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const DbFault = registry({ DatabaseError, TimeoutError })

    const MergedFault = merge(AppFault, DbFault)

    expect(MergedFault.tags).toEqual(["NotFoundError", "TimeoutError", "DatabaseError"])
  })

  test("should behave like a normal registry", () => {
    const AppFault = registry({ NotFoundError })
    const DbFault = registry({ DatabaseError, TimeoutError })
    const MergedFault = merge(AppFault, DbFault)

    const created = MergedFault.create("DatabaseError", { query: "SELECT 1" })
    expect(created.query).toBe("SELECT 1")

    const wrapped = MergedFault.wrap(new Error("root")).as("TimeoutError")
    expect(wrapped._tag).toBe("TimeoutError")

    const matched = MergedFault.matchTag(created, "DatabaseError", (fault) => fault.query)
    expect(matched).toBe("SELECT 1")

    const serialized = MergedFault.toSerializable(created)
    const restored = MergedFault.fromSerializable(serialized)
    expect(restored).toBeInstanceOf(DatabaseError)
  })

  test("should keep type-safe create inference for 3+ merged modules", () => {
    const AppFault = registry({ NotFoundError, TimeoutError })
    const DbFault = registry({ DatabaseError })
    const BillingFault = registry({ PaymentError })

    const MergedFault = merge(AppFault, DbFault, BillingFault)

    const paymentFault = MergedFault.create("PaymentError", { invoiceId: "inv_123" })
    expect(paymentFault.invoiceId).toBe("inv_123")

    const dbFault = MergedFault.create("DatabaseError", { query: "SELECT 1" })
    expect(dbFault.query).toBe("SELECT 1")

    const appFault = MergedFault.create("NotFoundError", { id: "123" })
    expect(appFault.id).toBe("123")
  })
})
