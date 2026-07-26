// Type assertions are enforced by `bun run check` and `bun run typecheck`, not `bun test`.
import { describe, it } from "bun:test"

import type {
  ByTag,
  FaultRegistry,
  FlattenField,
  FlattenOptions,
  SerializableCause,
  SerializableFault,
  TagOf,
} from "../types"
import { type Fault, matchTag, matchTags, merge, registry, Tagged } from "../index"

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
  it("gives Tagged instances the correct _tag literal type", () => {
    const fault = new NotFoundError({ id: "123" })

    type _TagIsLiteral = Expect<Equal<typeof fault._tag, "NotFoundError">>
  })

  it("exposes Tagged fields as readonly properties", () => {
    const fault = new NotFoundError({ id: "123" })

    type _IdIsString = Expect<Equal<typeof fault.id, string>>
  })

  it("makes Tagged instances extend Fault", () => {
    const fault = new NotFoundError({ id: "123" })

    type _ExtendsFault = Expect<Equal<typeof fault extends Fault ? true : false, true>>
  })

  it("exports public contracts from the types entrypoint", () => {
    type _Registry = Expect<
      typeof AppFault extends FaultRegistry<{
        NotFoundError: typeof NotFoundError
        TimeoutError: typeof TimeoutError
      }>
        ? true
        : false
    >
    type _FlattenField = Expect<Equal<FlattenField, "details" | "message">>
    type _FlattenOptions = Expect<Equal<FlattenOptions["field"], FlattenField | undefined>>
    type _Tags = Expect<Equal<TagOf<AppError>, "NotFoundError" | "PaymentError" | "TimeoutError">>
    type _ByTag = Expect<Equal<ByTag<AppError, "PaymentError">, PaymentError>>
    type _SerializableMarker = Expect<Equal<SerializableFault["__faultier"], true>>
    type _CauseKinds = Expect<Equal<SerializableCause["kind"], "error" | "fault" | "thrown">>
  })

  it("infers the correct registry.create instance type", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    type _IsNotFound = Expect<Equal<typeof fault, NotFoundError>>
    type _HasId = Expect<Equal<typeof fault.id, string>>
  })

  it("infers the correct registry.wrap().as instance type", () => {
    const fault = AppFault.wrap(new Error("root")).as("NotFoundError", { id: "123" })

    type _IsNotFound = Expect<Equal<typeof fault, NotFoundError>>
    type _HasId = Expect<Equal<typeof fault.id, string>>
  })

  it("types the registry.matchTag handler instance", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    AppFault.matchTag(fault, "NotFoundError", (e) => {
      type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
      type _HasId = Expect<Equal<typeof e.id, string>>
      return e.id
    })
  })

  it("types registry.matchTags handler instances", () => {
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

  it("narrows matchTag handler and return types", () => {
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

    const heterogeneousResult = matchTag(
      err,
      "NotFoundError",
      () => "found" as const,
      () => 404 as const
    )

    type _WithoutFallback = Expect<Equal<typeof withoutFallback, string | undefined>>
    type _WithFallback = Expect<Equal<typeof withFallback, string>>
    type _HeterogeneousResult = Expect<Equal<typeof heterogeneousResult, "found" | 404>>
  })

  it("narrows matchTags handlers and return type", () => {
    const err = new TimeoutError() as AppError

    const withoutFallback = matchTags(err, {
      NotFoundError: (e) => {
        type _IsNotFound = Expect<Equal<typeof e, NotFoundError>>
        return e.id
      },
      TimeoutError: (e) => {
        type _IsTimeout = Expect<Equal<typeof e, TimeoutError>>
        return 408 as const
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
        return false as const
      }
    )

    type _WithoutFallback = Expect<Equal<typeof withoutFallback, string | 408 | undefined>>
    type _WithFallback = Expect<Equal<typeof withFallback, string | false>>
  })

  it("returns R from an exhaustive matchTags map without fallback", () => {
    const err = new TimeoutError() as AppError

    const result = matchTags(err, {
      NotFoundError: () => "not-found" as const,
      PaymentError: () => "payment" as const,
      TimeoutError: () => 408 as const,
    })

    type _Result = Expect<Equal<typeof result, "not-found" | "payment" | 408>>
  })

  it("returns R or undefined from a partial matchTags map without fallback", () => {
    const err = new TimeoutError() as AppError

    const result = matchTags(err, {
      TimeoutError: () => 408 as const,
    })

    type _Result = Expect<Equal<typeof result, 408 | undefined>>
  })

  it("keeps undefined for variable maps with optional handlers", () => {
    const err = new TimeoutError() as AppError
    const handlers: Partial<{
      NotFoundError: (error: NotFoundError) => "not-found"
      PaymentError: (error: PaymentError) => "payment"
      TimeoutError: (error: TimeoutError) => 408
    }> = {
      TimeoutError: () => 408,
    }

    const result = matchTags(err, handlers)

    type _Result = Expect<Equal<typeof result, "not-found" | "payment" | 408 | undefined>>
  })

  it("keeps undefined when a required handler may be undefined", () => {
    const err = new TimeoutError() as AppError
    const handlers: {
      NotFoundError: ((error: NotFoundError) => "not-found") | undefined
      PaymentError: (error: PaymentError) => "payment"
      TimeoutError: (error: TimeoutError) => 408
    } = {
      NotFoundError: undefined,
      PaymentError: () => "payment",
      TimeoutError: () => 408,
    }

    const result = matchTags(err, handlers)

    type _Result = Expect<Equal<typeof result, "not-found" | "payment" | 408 | undefined>>
  })

  it("narrows registry.matchTag return type with fallback", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    const withoutFallback = AppFault.matchTag(fault, "NotFoundError", (e) => e.id)
    const withFallback = AppFault.matchTag(
      fault,
      "NotFoundError",
      () => "found" as const,
      (e) => {
        type _IsUnknown = Expect<Equal<typeof e, unknown>>
        return 404 as const
      }
    )

    type _WithoutFallback = Expect<Equal<typeof withoutFallback, string | undefined>>
    type _WithFallback = Expect<Equal<typeof withFallback, "found" | 404>>
  })

  it("narrows registry.matchTags return type with fallback", () => {
    const fault = AppFault.create("NotFoundError", { id: "123" })

    const withoutFallback = AppFault.matchTags(fault, {
      NotFoundError: () => "not-found" as const,
      TimeoutError: () => 408 as const,
    })
    const withFallback = AppFault.matchTags(
      fault,
      {
        NotFoundError: () => "not-found" as const,
      },
      (e) => {
        type _IsUnknown = Expect<Equal<typeof e, unknown>>
        return false as const
      }
    )

    type _WithoutFallback = Expect<Equal<typeof withoutFallback, "not-found" | 408 | undefined>>
    type _WithFallback = Expect<Equal<typeof withFallback, "not-found" | false>>
  })

  it("preserves merge type inference across three or more modules", () => {
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

  it("preserves subclass type through fluent methods", () => {
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
  // @ts-expect-error -- registry state is internal
  void AppFault.__faultier

  // @ts-expect-error -- "BadTag" is not a registered tag
  AppFault.create("BadTag", {})

  // @ts-expect-error -- id should be string, not number
  AppFault.create("NotFoundError", { id: 123 })

  // @ts-expect-error -- NotFoundError requires { id: string }
  AppFault.create("NotFoundError")

  // @ts-expect-error -- "BadTag" is not a registered tag
  AppFault.wrap(new Error("root")).as("BadTag", {})

  // @ts-expect-error -- "BadTag" is not a registered tag
  AppFault.matchTag({}, "BadTag", () => "nope")

  // @ts-expect-error -- "BadTag" is not in AppError union
  matchTag(new TimeoutError() as AppError, "BadTag", () => "nope")

  AppFault.matchTags(
    {},
    {
      // @ts-expect-error -- "BadTag" is not a registered tag
      BadTag: () => "nope",
    }
  )

  matchTags(new TimeoutError() as AppError, {
    // @ts-expect-error -- "BadTag" is not in AppError union
    BadTag: () => "nope",
  })

  const MergedFault = merge(AppFault, DbFault)

  // @ts-expect-error -- "BadTag" is not in any merged registry
  MergedFault.create("BadTag", {})

  const fault = AppFault.create("TimeoutError")

  // @ts-expect-error -- flatten field must be "message" | "details"
  fault.flatten({ field: "bad-field" })
}

// Suppress unused function warning — this exists only for type checking
void _negativeTypeTests
