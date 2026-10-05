// Compile-time checks only: `pnpm run check` and `pnpm run typecheck` enforce this file, and Vitest never runs it.
import { expectTypeOf } from "vitest"
import type {
  ByTag,
  FaultRegistry,
  FlattenField,
  FlattenOptions,
  SerializableCause,
  SerializableFault,
  SerializableValue,
  TagOf,
} from "../types"

import {
  type Fault,
  fromSerializable,
  matchTag,
  matchTags,
  merge,
  registry,
  Tagged,
} from "../index"

// ── Helpers ──────────────────────────────────────────────────────────────────
type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

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
// Gives Tagged instances the correct _tag literal type.
{
  const fault = new NotFoundError({ id: "123" })

  expectTypeOf(fault._tag).toEqualTypeOf<"NotFoundError">()
}

// Exposes Tagged fields as readonly properties.
{
  const fault = new NotFoundError({ id: "123" })

  expectTypeOf(fault.id).toEqualTypeOf<string>()
}

// Makes Tagged instances extend Fault.
{
  const fault = new NotFoundError({ id: "123" })

  expectTypeOf(fault).toExtend<Fault>()
}

// Exports public contracts from the types entrypoint.
{
  expectTypeOf(AppFault).toExtend<
    FaultRegistry<{
      NotFoundError: typeof NotFoundError
      TimeoutError: typeof TimeoutError
    }>
  >()
  expectTypeOf<FlattenField>().toEqualTypeOf<"details" | "message">()
  expectTypeOf<FlattenOptions["field"]>().toEqualTypeOf<FlattenField | undefined>()
  expectTypeOf<TagOf<AppError>>().toEqualTypeOf<"NotFoundError" | "PaymentError" | "TimeoutError">()
  expectTypeOf<ByTag<AppError, "PaymentError">>().toEqualTypeOf<PaymentError>()
  expectTypeOf<SerializableFault["__faultier"]>().toEqualTypeOf<true>()
  expectTypeOf<SerializableCause["kind"]>().toEqualTypeOf<"error" | "fault" | "thrown">()
  expectTypeOf<SerializableFault>().toExtend<JsonValue>()
  expectTypeOf<
    Extract<SerializableCause, { kind: "thrown" }>["value"]
  >().toEqualTypeOf<SerializableValue>()

  const value: SerializableValue = { nested: ["value", null] }
  void value
}

// Infers the correct registry.create instance type.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  expectTypeOf(fault).toEqualTypeOf<NotFoundError>()
  expectTypeOf(fault.id).toEqualTypeOf<string>()
}

// Infers the correct registry.wrap().as instance type.
{
  const fault = AppFault.wrap(new Error("root")).as("NotFoundError", { id: "123" })

  expectTypeOf(fault).toEqualTypeOf<NotFoundError>()
  expectTypeOf(fault.id).toEqualTypeOf<string>()
}

// Types registry guards, tags, and serialization contracts.
{
  const value: unknown = AppFault.create("TimeoutError")
  const tags = AppFault.tags
  const fault = AppFault.create("NotFoundError", { id: "123" })
  const serialized = fault.toSerializable()
  const registrySerialized = AppFault.toSerializable(fault)
  const generic = fromSerializable(serialized)
  const restored = AppFault.fromSerializable(serialized)

  if (AppFault.is(value)) {
    expectTypeOf(value).toEqualTypeOf<NotFoundError | TimeoutError>()
  }

  expectTypeOf(tags).toEqualTypeOf<ReadonlyArray<"NotFoundError" | "TimeoutError">>()
  expectTypeOf(serialized).toEqualTypeOf<SerializableFault>()
  expectTypeOf(registrySerialized).toEqualTypeOf<SerializableFault>()
  expectTypeOf(generic).toEqualTypeOf<Fault>()
  expectTypeOf(restored).toEqualTypeOf<Fault | NotFoundError | TimeoutError>()
}

// Exposes the registry fault union as Type.
{
  const MergedFault = merge(AppFault, DbFault)

  expectTypeOf<typeof AppFault.Type>().toEqualTypeOf<NotFoundError | TimeoutError>()
  expectTypeOf<typeof DbFault.Type>().toEqualTypeOf<DatabaseError>()
  expectTypeOf<typeof MergedFault.Type>().toEqualTypeOf<
    NotFoundError | TimeoutError | DatabaseError
  >()
}

// Types the registry.matchTag handler instance.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  AppFault.matchTag(fault, "NotFoundError", (e) => {
    expectTypeOf(e).toEqualTypeOf<NotFoundError>()
    expectTypeOf(e.id).toEqualTypeOf<string>()
    return e.id
  })
}

// Types registry.matchTags handler instances.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  AppFault.matchTags(fault, {
    NotFoundError: (e) => {
      expectTypeOf(e).toEqualTypeOf<NotFoundError>()
      expectTypeOf(e.id).toEqualTypeOf<string>()
      return e.id
    },
    TimeoutError: (e) => {
      expectTypeOf(e).toEqualTypeOf<TimeoutError>()
      return "timeout"
    },
  })
}

// Narrows matchTag handler and return types.
{
  const err = new NotFoundError({ id: "123" }) as AppError

  const withoutFallback = matchTag(err, "NotFoundError", (e) => {
    expectTypeOf(e).toEqualTypeOf<NotFoundError>()
    return e.id
  })

  const withFallback = matchTag(
    err,
    "NotFoundError",
    (e) => {
      expectTypeOf(e).toEqualTypeOf<NotFoundError>()
      return e.id
    },
    (e) => {
      expectTypeOf(e).toEqualTypeOf<TimeoutError | PaymentError>()
      return e._tag
    }
  )

  const heterogeneousResult = matchTag(
    err,
    "NotFoundError",
    () => "found" as const,
    () => 404 as const
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<string | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<string>()
  expectTypeOf(heterogeneousResult).toEqualTypeOf<"found" | 404>()
}

// Narrows matchTags handlers and return type.
{
  const err = new TimeoutError() as AppError

  const withoutFallback = matchTags(err, {
    NotFoundError: (e) => {
      expectTypeOf(e).toEqualTypeOf<NotFoundError>()
      return e.id
    },
    TimeoutError: (e) => {
      expectTypeOf(e).toEqualTypeOf<TimeoutError>()
      return 408 as const
    },
  })

  const withFallback = matchTags(
    err,
    {
      NotFoundError: (e) => {
        expectTypeOf(e).toEqualTypeOf<NotFoundError>()
        return e.id
      },
    },
    (e) => {
      expectTypeOf(e).toEqualTypeOf<AppError>()
      return false as const
    }
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<string | 408 | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<string | false>()
}

// Returns R from an exhaustive matchTags map without fallback.
{
  const err = new TimeoutError() as AppError

  const result = matchTags(err, {
    NotFoundError: () => "not-found" as const,
    PaymentError: () => "payment" as const,
    TimeoutError: () => 408 as const,
  })

  expectTypeOf(result).toEqualTypeOf<"not-found" | "payment" | 408>()
}

// Returns R or undefined from a partial matchTags map without fallback.
{
  const err = new TimeoutError() as AppError

  const result = matchTags(err, {
    TimeoutError: () => 408 as const,
  })

  expectTypeOf(result).toEqualTypeOf<408 | undefined>()
}

// Keeps undefined for variable maps with optional handlers.
{
  const err = new TimeoutError() as AppError
  const handlers: Partial<{
    NotFoundError: (error: NotFoundError) => "not-found"
    PaymentError: (error: PaymentError) => "payment"
    TimeoutError: (error: TimeoutError) => 408
  }> = {
    TimeoutError: () => 408,
  }

  const result = matchTags(err, handlers)

  expectTypeOf(result).toEqualTypeOf<"not-found" | "payment" | 408 | undefined>()
}

// Keeps undefined when a required handler may be undefined.
{
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

  expectTypeOf(result).toEqualTypeOf<"not-found" | "payment" | 408 | undefined>()
}

// Narrows registry.matchTag return type with fallback.
{
  const fault = AppFault.create("NotFoundError", { id: "123" })

  const withoutFallback = AppFault.matchTag(fault, "NotFoundError", (e) => e.id)
  const withFallback = AppFault.matchTag(
    fault,
    "NotFoundError",
    () => "found" as const,
    (e) => {
      expectTypeOf(e).toEqualTypeOf<unknown>()
      return 404 as const
    }
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<string | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<"found" | 404>()
}

// Narrows registry.matchTags return type with fallback.
{
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
      expectTypeOf(e).toEqualTypeOf<unknown>()
      return false as const
    }
  )

  expectTypeOf(withoutFallback).toEqualTypeOf<"not-found" | 408 | undefined>()
  expectTypeOf(withFallback).toEqualTypeOf<"not-found" | false>()
}

// Preserves merge type inference across three or more modules.
{
  const MergedFault = merge(AppFault, DbFault, BillingFault)

  const nf = MergedFault.create("NotFoundError", { id: "123" })
  const db = MergedFault.create("DatabaseError", { query: "SELECT 1" })
  const pay = MergedFault.create("PaymentError", { invoiceId: "inv_1" })

  expectTypeOf(nf).toEqualTypeOf<NotFoundError>()
  expectTypeOf(db).toEqualTypeOf<DatabaseError>()
  expectTypeOf(pay).toEqualTypeOf<PaymentError>()
  expectTypeOf(nf.id).toEqualTypeOf<string>()
  expectTypeOf(db.query).toEqualTypeOf<string>()
  expectTypeOf(pay.invoiceId).toEqualTypeOf<string>()
}

// Preserves subclass type through fluent methods.
{
  const fault = new NotFoundError({ id: "123" })
    .withDescription("new message", "new details")
    .withMessage("gone")
    .withDetails("not here")
    .withMeta({ key: "val" })
    .withCause(new Error("root"))

  expectTypeOf(fault).toEqualTypeOf<NotFoundError>()
}

// ── Negative type tests ──────────────────────────────────────────────────────
// These verify that invalid usage produces compile-time errors.
// The function bodies never execute — only the type checker matters.

// ── Registered constructor contract (#66) ────────────────────────────────────
// registry.fromSerializable revives through `new Class(payloadFields)`, so a
// registered constructor must take the fields object as its only parameter.

class PositionalError extends Tagged("PositionalError")<{ id: string }>() {
  constructor(id: string) {
    super({ id })
  }
}

class ExtraParamError extends Tagged("ExtraParamError")<{ id: string }>() {
  constructor(fields: { id: string }, _retryable: boolean) {
    super(fields)
  }
}

class DerivedMessageError extends Tagged("DerivedMessageError")<{ id: string }>() {
  constructor(fields: { id: string }) {
    super(fields)
    this.message = `Missing ${fields.id}`
  }
}

class FieldlessDefaultsError extends Tagged("FieldlessDefaultsError")() {
  constructor() {
    super()
    this.message = "Timed out"
  }

  isRetryable(): boolean {
    return true
  }

  get summary(): string {
    return `${this._tag}: ${this.message}`
  }
}

function _registeredConstructorContract() {
  // @ts-expect-error -- positional constructors cannot be revived from payload fields
  registry({ PositionalError })

  // @ts-expect-error -- a second constructor parameter cannot be supplied on revive
  registry({ ExtraParamError })

  // @ts-expect-error -- one invalid entry rejects the call even next to valid ones
  registry({ DerivedMessageError, PositionalError })

  const Valid = registry({
    DerivedMessageError,
    FieldlessDefaultsError,
    NotFoundError,
    TimeoutError,
  })
  expectTypeOf<
    typeof Valid.create<"DerivedMessageError">
  >().returns.toEqualTypeOf<DerivedMessageError>()
}

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

  // @ts-expect-error -- metadata values must be JSON-safe SerializableValue values
  fault.withMeta({ createdAt: new Date() })

  // @ts-expect-error -- Tagged fields must contain only JSON-safe SerializableValue values
  class NonSerializableFieldsError extends Tagged("NonSerializableFieldsError")<{
    createdAt: Date
  }>() {}

  void NonSerializableFieldsError
}

// Suppress unused function warning — this exists only for type checking
void _negativeTypeTests
