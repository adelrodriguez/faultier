import { describe, test } from "bun:test"

import type { Fault } from "../fault"
import { matchTag, matchTags } from "../match"
import { merge } from "../merge"
import { registry } from "../registry"
import { Tagged } from "../tagged"

// ── Helpers ──────────────────────────────────────────────────────────────────
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Expect<T extends true> = T

// ── Test fixtures ────────────────────────────────────────────────────────────
class NotFoundError extends Tagged("NotFoundError")<{ id: string }>() {}
class TimeoutError extends Tagged("TimeoutError")() {}
class DatabaseError extends Tagged("DatabaseError")<{ query: string }>() {}
class PaymentError extends Tagged("PaymentError")<{ invoiceId: string }>() {}

const AppFault = registry({ NotFoundError, TimeoutError })
const DbFault = registry({ DatabaseError })
const BillingFault = registry({ PaymentError })
type AppError = NotFoundError | TimeoutError | PaymentError

// ── Positive type-level tests ────────────────────────────────────────────────
describe("type-level inference", () => {
  test("Tagged instance should have correct _tag literal type", () => {
    const fault = new NotFoundError({ id: "123" })

    type _TagIsLiteral = Expect<Equal<typeof fault._tag, "NotFoundError">>
  })

  test("Tagged instance should expose fields as readonly properties", () => {
    const fault = new NotFoundError({ id: "123" })

    type _IdIsString = Expect<Equal<typeof fault.id, string>>
  })

  test("Tagged instance should extend Fault", () => {
    const fault = new NotFoundError({ id: "123" })

    type _ExtendsFault = Expect<Equal<typeof fault extends Fault ? true : false, true>>
  })

  test("registry.create should infer correct instance type", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    type _IsNotFound = Expect<Equal<typeof fault, NotFoundError>>
    type _HasId = Expect<Equal<typeof fault.id, string>>
  })

  test("registry.wrap().as should infer correct instance type", () => {
    const fault = AppFault.wrap(new Error("root")).as("NotFoundError", { id: "123" })

    type _IsNotFound = Expect<Equal<typeof fault, NotFoundError>>
    type _HasId = Expect<Equal<typeof fault.id, string>>
  })

  test("registry.matchTag handler should receive correctly typed instance", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    AppFault.matchTag(fault, "NotFoundError", (e) => {
      type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
      type _HasId = Expect<Equal<typeof e.id, string>>
      return e.id
    })
  })

  test("registry.matchTags handlers should receive correctly typed instances", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    AppFault.matchTags(fault, {
      NotFoundError: (e) => {
        type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
        type _HasId = Expect<Equal<typeof e.id, string>>
        return e.id
      },
      TimeoutError: (e) => {
        type _IsTimeout = Expect<Equal<typeof e, TimeoutError>>
        return "timeout"
      },
    })
  })

  test("matchTag should narrow handler parameter and return type", () => {
    const err = new NotFoundError({ id: "123" }) as AppError

    const withoutFallback = matchTag(err, "NotFoundError", (e) => {
      type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
      return e.id
    })

    const withFallback = matchTag(
      err,
      "NotFoundError",
      (e) => {
        type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
        return e.id
      },
      (e) => {
        type _IsExclude = Expect<Equal<typeof e, TimeoutError | PaymentError>>
        return e._tag
      }
    )

    type _WithoutFallback = Expect<Equal<typeof withoutFallback, string | undefined>>
    type _WithFallback = Expect<Equal<typeof withFallback, string>>
  })

  test("matchTags should narrow handlers and return type", () => {
    const err = new TimeoutError() as AppError

    const withoutFallback = matchTags(err, {
      NotFoundError: (e) => {
        type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
        return e.id
      },
      TimeoutError: (e) => {
        type _IsTimeout = Expect<Equal<typeof e, TimeoutError>>
        return "timeout"
      },
    })

    const withFallback = matchTags(
      err,
      {
        NotFoundError: (e) => {
          type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
          return e.id
        },
      },
      (e) => {
        type _IsAppError = Expect<Equal<typeof e, AppError>>
        return "fallback"
      }
    )

    // HandlerResult<H> infers R from the handler map values.
    // The result is structurally equivalent to `string` but not nominally
    // identical, so Equal<> fails. Two-way extends checks equivalence instead.
    type _WithoutFallbackA = Expect<typeof withoutFallback extends string | undefined ? true : false>
    type _WithoutFallbackB = Expect<string | undefined extends typeof withoutFallback ? true : false>
    type _WithFallbackA = Expect<typeof withFallback extends string ? true : false>
    type _WithFallbackB = Expect<string extends typeof withFallback ? true : false>
  })

  test("matchTags exhaustive map should return R without fallback", () => {
    const err = new TimeoutError() as AppError

    const result = matchTags(err, {
      NotFoundError: (e) => e.id,
      PaymentError: (e) => e.invoiceId,
      TimeoutError: () => "timeout",
    })

    type _ResultA = Expect<typeof result extends string ? true : false>
    type _ResultB = Expect<string extends typeof result ? true : false>
  })

  test("matchTags partial map should return R | undefined without fallback", () => {
    const err = new TimeoutError() as AppError

    const result = matchTags(err, {
      TimeoutError: () => "timeout",
    })

    type _ResultA = Expect<typeof result extends string | undefined ? true : false>
    type _ResultB = Expect<string | undefined extends typeof result ? true : false>
  })

  test("registry.matchTag return type should narrow with fallback", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    const withoutFallback = AppFault.matchTag(fault, "NotFoundError", (e) => e.id)
    const withFallback = AppFault.matchTag(
      fault,
      "NotFoundError",
      (e) => e.id,
      () => "fallback"
    )

    type _WithoutFallback = Expect<Equal<typeof withoutFallback, string | undefined>>
    type _WithFallback = Expect<Equal<typeof withFallback, string>>
  })

  test("registry.matchTags return type should narrow with fallback", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    const withoutFallback = AppFault.matchTags(fault, {
      NotFoundError: (e) => e.id,
    })
    const withFallback = AppFault.matchTags(
      fault,
      {
        NotFoundError: (e) => e.id,
      },
      () => "fallback"
    )

    type _WithoutFallback = Expect<Equal<typeof withoutFallback, string | undefined>>
    type _WithFallback = Expect<Equal<typeof withFallback, string>>
  })

  test("merge should preserve type inference across 3+ modules", () => {
    const MergedFault = merge(AppFault, DbFault, BillingFault)

    const nf = MergedFault.create("NotFoundError", { id: "123" })
    const db = MergedFault.create("DatabaseError", { query: "SELECT 1" })
    const pay = MergedFault.create("PaymentError", { invoiceId: "inv_1" })

    type _NfIsNotFound = Expect<Equal<typeof nf, NotFoundError>>
    type _DbIsDatabase = Expect<Equal<typeof db, DatabaseError>>
    type _PayIsPayment = Expect<Equal<typeof pay, PaymentError>>
    type _NfHasId = Expect<Equal<typeof nf.id, string>>
    type _DbHasQuery = Expect<Equal<typeof db.query, string>>
    type _PayHasInvoiceId = Expect<Equal<typeof pay.invoiceId, string>>
  })

  test("fluent methods should preserve subclass type", () => {
    const fault = new NotFoundError({ id: "123" })
      .withDescription("new message", "new details")
      .withMessage("gone")
      .withDetails("not here")
      .withMeta({ key: "val" })
      .withCause(new Error("root"))

    type _StillNotFound = Expect<Equal<typeof fault, NotFoundError>>
  })
})

// ── Negative type tests ──────────────────────────────────────────────────────
// These verify that invalid usage produces compile-time errors.
// The function bodies never execute — only the type checker matters.

function _negativeTypeTests() {
  // @ts-expect-error — "BadTag" is not a registered tag
  AppFault.create("BadTag", {})

  // @ts-expect-error — id should be string, not number
  AppFault.create("NotFoundError", { id: 123 })

  // @ts-expect-error — NotFoundError requires { id: string }
  AppFault.create("NotFoundError")

  // @ts-expect-error — "BadTag" is not a registered tag
  AppFault.wrap(new Error("root")).as("BadTag", {})

  // @ts-expect-error — "BadTag" is not a registered tag
  AppFault.matchTag({}, "BadTag", () => "nope")

  // @ts-expect-error — "BadTag" is not in AppError union
  matchTag(new TimeoutError() as AppError, "BadTag", () => "nope")

  AppFault.matchTags(
    {},
    {
      // @ts-expect-error — "BadTag" is not a registered tag
      BadTag: () => "nope",
    }
  )

  matchTags(new TimeoutError() as AppError, {
    // @ts-expect-error — "BadTag" is not in AppError union
    BadTag: () => "nope",
  })

  const MergedFault = merge(AppFault, DbFault)

  // @ts-expect-error — "BadTag" is not in any merged registry
  MergedFault.create("BadTag", {})

  const fault = AppFault.create("TimeoutError")

  // @ts-expect-error — flatten field must be "message" | "details"
  fault.flatten({ field: "bad-field" })
}

// Suppress unused function warning — this exists only for type checking
void _negativeTypeTests
