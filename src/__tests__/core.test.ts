import { describe, expect, it } from "bun:test"
import BaseFault from "../base"
import Fault from "../core"

type TestErrorCode =
  | "AUTH_ERROR"
  | "DATABASE_ERROR"
  | "FAULT"
  | "HTTP_ERROR"
  | "INPUT_ERROR"
  | "LAYER_1"
  | "LAYER_2"
  | "LAYER_3"
  | "MY_ERROR_TAG"
  | "MY_TAG"
  | "NETWORK_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "REQUEST_FAILED"
  | "SERVICE_ERROR"
  | "VALIDATION_ERROR"
  | "TEST"

interface TestContext extends Record<TestErrorCode, Record<string, unknown>> {
  FAULT: Record<string, unknown>
  MY_TAG: { requestId: string }
  MY_ERROR_TAG: { errorCode: number }
  LAYER_1: { host: string; port: number }
  LAYER_2: { service: string }
  LAYER_3: { endpoint: string }
}

declare module "../index" {
  interface FaultRegistry {
    tags: TestErrorCode
    context: TestContext
  }
}

describe("Fault", () => {
  describe("wrap", () => {
    it("should create a fault", () => {
      const myErr = new Error("Something happened")

      const fault = Fault.wrap(myErr)
        .withTag("TEST")
        .withDescription(myErr.message, "Something went really wrong")
        .withContext({ my: "meta", a: 1 })

      expect(fault.tag).toBe("TEST")
      expect(fault.debug).toBe(myErr.message)
      expect(fault.context).toEqual({ my: "meta", a: 1 })
    })

    it("should support type-safe tags from registry", () => {
      const fault = Fault.wrap(new Error("test"))
        .withTag("DATABASE_ERROR")
        .withDescription("Failed to connect to database")

      expect(fault.tag).toBe("DATABASE_ERROR")
    })

    it("should keep the original error message", () => {
      const myErr = new Error("Something happened")

      const fault = Fault.wrap(myErr)
        .withTag("MY_TAG")
        .withDescription("Testing error message")

      expect(fault.message).toBe(myErr.message)
    })

    it("should set the cause to the wrapped error", () => {
      const originalError = new Error("Database connection failed")
      const fault = Fault.wrap(originalError)
        .withTag("DATABASE_ERROR")
        .withDescription("Connection timeout after 30s")

      expect(fault.cause).toBe(originalError)
      expect(fault.cause?.message).toBe("Database connection failed")
    })

    it("should use default tag when no tag modifier is provided", () => {
      const originalError = new Error("Something went wrong")
      const fault = Fault.wrap(originalError)
        .withDescription("Debug message")
        .withContext({ foo: "bar" })

      expect(fault.tag).toBe("FAULT")
      expect(fault.debug).toBe("Debug message")
      expect(fault.context).toEqual({ foo: "bar" })
    })

    it("should use default tag when no modifiers provided", () => {
      const originalError = new Error("Something went wrong")
      const fault = Fault.wrap(originalError)

      expect(fault.tag).toBe("FAULT")
      expect(fault.cause).toBe(originalError)
    })
  })

  describe("extend", () => {
    it("should extend a custom Error class", () => {
      class LibraryError extends Error {
        code: number

        constructor(message: string, code: number) {
          super(message)
          this.name = "FrameworkError"
          this.code = code
        }
      }

      const LibraryFault = Fault.extend(LibraryError)

      const libraryFault = LibraryFault.create("My test message", 404)

      expect(libraryFault instanceof LibraryError).toBe(true)
      expect(libraryFault instanceof LibraryFault).toBe(true)
      expect(Fault.isFault(libraryFault)).toBe(true)
      expect(libraryFault.message).toBe("My test message")
      expect(libraryFault.code).toBe(404)
    })

    it("should support the arguments of the original error class", () => {
      class EmailError extends Error {
        email: string
        level: 1 | 2 | 3 | 4 | 5

        constructor(message: string, email: string, level: 1 | 2 | 3 | 4 | 5) {
          super(message)
          this.email = email
          this.level = level
        }
      }

      const EmailFault = Fault.extend(EmailError)

      const emailFault = EmailFault.create(
        "Failed to send email",
        "test@example.com",
        1
      ).withContext({ server: "smtp.example.com", port: 587 })

      expect(emailFault instanceof EmailError).toBe(true)
      expect(Fault.isFault(emailFault)).toBe(true)
      expect(emailFault.message).toBe("Failed to send email")
      expect(emailFault.email).toBe("test@example.com")
      expect(emailFault.level).toBe(1)
      expect(emailFault.context).toEqual({
        server: "smtp.example.com",
        port: 587,
      })
    })

    it("should allow the arguments of the original error class to be overridden", () => {
      class CustomError extends Error {
        level: 1 | 2 | 3 | 4 | 5

        constructor(message: string, level: 1 | 2 | 3 | 4 | 5) {
          super(message)
          this.level = level
        }
      }

      const CustomFault = Fault.extend(CustomError)

      const fault = CustomFault.create("Original message", 1).withDescription(
        "Debug info",
        "Overridden message"
      )

      expect(fault.debug).toBe("Debug info")
      expect(fault.message).toBe("Overridden message")
      expect(fault.level).toBe(1)
    })

    it("should use default tag when no tag is provided", () => {
      class CustomError extends Error {}

      const CustomFault = Fault.extend(CustomError)

      const fault =
        CustomFault.create("Test message").withDescription("Debug info")

      expect(fault.tag).toBe("FAULT")
    })

    it("should serialize extended fault to JSON", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.name = "HttpError"
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const httpFault = HttpFault.create("Not Found", 404)
        .withTag("HTTP_NOT_FOUND")
        .withDescription(
          "Resource not found in database",
          "The requested resource was not found"
        )
        .withContext({ path: "/api/users/123", method: "GET" })

      const json = httpFault.toJSON()

      expect(json).toEqual({
        name: "HttpError",
        tag: "HTTP_NOT_FOUND",
        message: "The requested resource was not found",
        debug: "Resource not found in database",
        context: { path: "/api/users/123", method: "GET" },
      })
    })

    it("should serialize extended fault to JSON without optional properties", () => {
      class SimpleError extends Error {
        constructor(message: string) {
          super(message)
          this.name = "SimpleError"
        }
      }

      const SimpleFault = Fault.extend(SimpleError)
      const simpleFault = SimpleFault.create("Something failed")

      const json = simpleFault.toJSON()

      expect(json).toEqual({
        name: "SimpleError",
        tag: "FAULT",
        message: "Something failed",
        debug: undefined,
        context: {},
      })
    })

    it("should unwrap extended fault with cause", () => {
      class ServiceError extends Error {
        service: string

        constructor(message: string, service: string) {
          super(message)
          this.name = "ServiceError"
          this.service = service
        }
      }

      const ServiceFault = Fault.extend(ServiceError)

      // Create a chain: originalError -> serviceFault
      const originalError = new Error("Database connection failed")
      const dbFault = Fault.wrap(originalError)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })

      // Manually set the cause on the ServiceFault
      const serviceFault = ServiceFault.create(
        "Service unavailable",
        "auth-service"
      )
        .withTag("SERVICE_ERROR")
        .withContext({ service: "auth" })
      serviceFault.cause = dbFault

      const chain = serviceFault.unwrap()

      expect(chain).toHaveLength(3)
      expect(chain[0]).toBe(serviceFault)
      expect(chain[1]).toBe(dbFault)
      expect(chain[2]).toBe(originalError)
      expect(chain[2]?.message).toBe("Database connection failed")
    })

    it("should unwrap extended fault without cause", () => {
      class ApiError extends Error {
        endpoint: string

        constructor(message: string, endpoint: string) {
          super(message)
          this.name = "ApiError"
          this.endpoint = endpoint
        }
      }

      const ApiFault = Fault.extend(ApiError)
      const apiFault = ApiFault.create(
        "API rate limit exceeded",
        "/api/v1/users"
      ).withTag("RATE_LIMIT")

      const chain = apiFault.unwrap()

      expect(chain).toHaveLength(1)
      expect(chain[0]).toBe(apiFault)
    })

    it("should unwrap mixed chain of extended and regular faults", () => {
      class NetworkError extends Error {
        timeout: number

        constructor(message: string, timeout: number) {
          super(message)
          this.name = "NetworkError"
          this.timeout = timeout
        }
      }

      const NetworkFault = Fault.extend(NetworkError)

      // Create a complex chain: rootError -> fault1 -> networkFault -> fault2
      const rootError = new Error("Connection reset")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const networkFault = NetworkFault.create(
        "Request timeout",
        30_000
      ).withTag("NETWORK_TIMEOUT")
      networkFault.cause = fault1

      const fault2 = Fault.wrap(networkFault).withTag("REQUEST_FAILED")

      const chain = fault2.unwrap()

      expect(chain).toHaveLength(4)
      expect(chain[0]).toBe(fault2)
      expect(chain[1]).toBe(networkFault)
      expect(chain[2]).toBe(fault1)
      expect(chain[3]).toBe(rootError)

      // Verify IS_FAULT symbol works with extended faults
      const faults = chain.filter(Fault.isFault)
      expect(faults).toHaveLength(3)
      expect(faults[0]).toBe(fault2)
      expect(faults[1]).toBe(networkFault)
      expect(faults[2]).toBe(fault1)
    })

    it("should support chaining modifiers on extended faults", () => {
      class ValidationError extends Error {
        field: string

        constructor(message: string, field: string) {
          super(message)
          this.name = "ValidationError"
          this.field = field
        }
      }

      const ValidationFault = Fault.extend(ValidationError)

      const validationFault = ValidationFault.create("Invalid input", "email")
        .withTag("VALIDATION_ERROR")
        .withDescription(
          "Email format is invalid",
          "Please enter a valid email address"
        )
        .withContext({ field: "email", value: "not-an-email" })
        .withTag("INPUT_ERROR") // Should override previous tag
        .withContext({ attempt: 1 }) // Should merge with previous context

      expect(validationFault.tag).toBe("INPUT_ERROR")
      expect(validationFault.debug).toBe("Email format is invalid")
      expect(validationFault.message).toBe("Please enter a valid email address")
      expect(validationFault.context).toEqual({
        field: "email",
        value: "not-an-email",
        attempt: 1,
      })
      expect(validationFault.field).toBe("email")
    })

    it("should merge context in extended faults", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const httpFault = HttpFault.create("Not found", 404)
        .withContext({ path: "/api/users" })
        .withContext({ method: "GET" })
        .withContext({ userId: "123" })

      expect(httpFault.context).toEqual({
        path: "/api/users",
        method: "GET",
        userId: "123",
      })
    })

    it("should default to empty object in extended faults", () => {
      class CustomError extends Error {}
      const CustomFault = Fault.extend(CustomError)

      const fault = CustomFault.create("Test")

      expect(fault.context).toEqual({})
    })

    it("should clear context in extended faults", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const httpFault = HttpFault.create("Not found", 404)
        .withContext({ path: "/api/users", method: "GET" })
        .clearContext()

      expect(httpFault.context).toEqual({})
    })
  })

  describe("fromSerializable", () => {
    it("should deserialize a single fault", () => {
      const serialized = {
        name: "Fault",
        tag: "DATABASE_ERROR" as const,
        message: "Database unavailable",
        debug: "Failed to connect",
        context: { host: "localhost", port: 5432 },
      }

      const fault = Fault.fromSerializable(serialized)

      expect(fault.name).toBe("Fault")
      expect(fault.tag).toBe("DATABASE_ERROR")
      expect(fault.message).toBe("Database unavailable")
      expect(fault.debug).toBe("Failed to connect")
      expect(fault.context).toEqual({ host: "localhost", port: 5432 })
      expect(fault.cause).toBeUndefined()
    })

    it("should deserialize a fault without debug message", () => {
      const serialized = {
        name: "Fault",
        tag: "AUTH_ERROR" as const,
        message: "Unauthorized",
        context: { userId: "123" },
      }

      const fault = Fault.fromSerializable(serialized)

      expect(fault.tag).toBe("AUTH_ERROR")
      expect(fault.debug).toBeUndefined()
    })

    it("should deserialize a fault chain", () => {
      const serialized = {
        name: "Fault",
        tag: "LAYER_3" as const,
        message: "Connection timeout",
        context: { endpoint: "/api/users" },
        cause: {
          name: "Fault",
          tag: "LAYER_2" as const,
          message: "Connection timeout",
          context: { service: "database" },
          cause: {
            name: "Fault",
            tag: "LAYER_1" as const,
            message: "Connection timeout",
            context: { host: "localhost", port: 5432 },
            cause: {
              name: "Error",
              message: "Connection timeout",
            },
          },
        },
      }

      const fault = Fault.fromSerializable(serialized)
      const chain = fault.unwrap()

      expect(chain).toHaveLength(4)
      expect(Fault.isFault(chain[0]) && chain[0].tag).toBe("LAYER_3")
      expect(Fault.isFault(chain[1]) && chain[1].tag).toBe("LAYER_2")
      expect(Fault.isFault(chain[2]) && chain[2].tag).toBe("LAYER_1")
      expect(chain[3]?.message).toBe("Connection timeout")
      expect(Fault.isFault(chain[3])).toBe(false)
    })

    it("should deserialize a fault ending in plain Error", () => {
      const serialized = {
        name: "Fault",
        tag: "NETWORK_ERROR" as const,
        message: "Network failure",
        debug: "Connection failed",
        context: {},
        cause: {
          name: "Error",
          message: "Network failure",
        },
      }

      const fault = Fault.fromSerializable(serialized)
      const chain = fault.unwrap()

      expect(chain).toHaveLength(2)
      expect(Fault.isFault(chain[0])).toBe(true)
      expect(Fault.isFault(chain[1])).toBe(false)
      expect(chain[1]?.message).toBe("Network failure")
    })

    it("should throw when deserializing plain Error as Fault", () => {
      const serialized = {
        name: "Error",
        message: "Something went wrong",
      }

      expect(() => Fault.fromSerializable(serialized)).toThrow(
        "Cannot deserialize SerializableError as Fault"
      )
    })
  })

  describe("round-trip serialization", () => {
    it("should preserve single fault data through round trip", () => {
      const original = Fault.create("DATABASE_ERROR")
        .withDescription("Connection failed", "Database unavailable")
        .withContext({ host: "localhost", port: 5432 })

      const serialized = BaseFault.toSerializable(original)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      expect(restored.tag).toBe(original.tag)
      expect(restored.message).toBe(original.message)
      expect(restored.debug).toBe(original.debug)
      expect(restored.context).toEqual(original.context)
      expect(restored.name).toBe(original.name)
    })

    it("should preserve fault chain through round trip", () => {
      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })

      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withContext({ service: "database" })

      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withContext({ endpoint: "/api/users" })

      const serialized = BaseFault.toSerializable(fault3)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      const originalChain = fault3.unwrap()
      const restoredChain = restored.unwrap()

      expect(restoredChain).toHaveLength(originalChain.length)

      for (let i = 0; i < originalChain.length; i++) {
        const orig = originalChain[i]
        const rest = restoredChain[i]

        expect(rest?.message).toBe(orig?.message)

        if (Fault.isFault(orig)) {
          expect(Fault.isFault(rest)).toBe(true)
          if (Fault.isFault(rest)) {
            expect(rest.tag).toBe(orig.tag)
            expect(rest.context).toEqual(orig.context)
            expect(rest.debug).toBe(orig.debug)
          }
        }
      }
    })

    it("should preserve empty context through round trip", () => {
      const original = Fault.create("TEST") as Fault

      const serialized = BaseFault.toSerializable(original)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      expect(restored.context).toEqual({})
    })

    it("should preserve tags and contexts in chain", () => {
      const root = new Error("Root cause")
      const fault1 = Fault.wrap(root)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })
        .withDescription("Layer 1 debug")

      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withContext({ service: "database" })
        .withDescription("Layer 2 debug", "Layer 2 message")

      const serialized = BaseFault.toSerializable(fault2)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = Fault.fromSerializable(parsed)

      expect(restored.getTags()).toEqual(["LAYER_2", "LAYER_1"])
      expect(restored.tag).toBe("LAYER_2")
      expect(restored.message).toBe("Layer 2 message")
      expect(restored.debug).toBe("Layer 2 debug")

      const chain = restored.unwrap()
      if (Fault.isFault(chain[1])) {
        expect(chain[1].tag).toBe("LAYER_1")
        expect(chain[1].debug).toBe("Layer 1 debug")
      }
    })
  })
})
