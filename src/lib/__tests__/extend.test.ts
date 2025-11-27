import { describe, expect, it } from "bun:test"
import { extend } from "../extend"
import Fault, { BaseFault } from "../index"

describe("extend", () => {
  describe("basic extension", () => {
    it("should extend a custom Error class and preserve instanceof checks", () => {
      class LibraryError extends Error {
        code: number

        constructor(message: string, code: number) {
          super(message)
          this.name = "FrameworkError"
          this.code = code
        }
      }

      const LibraryFault = extend(LibraryError)

      const libraryFault = LibraryFault.create("My test message", 404).withTag(
        "LAYER_1"
      )

      expect(libraryFault instanceof LibraryError).toBe(true)
      expect(libraryFault instanceof LibraryFault).toBe(true)
      expect(Fault.isFault(libraryFault)).toBe(true)
      expect(libraryFault.message).toBe("My test message")
      expect(libraryFault.code).toBe(404)
    })
  })

  describe("constructor arguments", () => {
    it("should support multiple constructor arguments from the original error class", () => {
      class EmailError extends Error {
        email: string
        level: 1 | 2 | 3 | 4 | 5

        constructor(message: string, email: string, level: 1 | 2 | 3 | 4 | 5) {
          super(message)
          this.email = email
          this.level = level
        }
      }

      const EmailFault = extend(EmailError)

      const emailFault = EmailFault.create(
        "Failed to send email",
        "test@example.com",
        1
      )
        .withTag("LAYER_1")
        .withContext({ host: "smtp.example.com", port: 587, retries: 3 })

      expect(emailFault instanceof EmailError).toBe(true)
      expect(Fault.isFault(emailFault)).toBe(true)
      expect(emailFault.message).toBe("Failed to send email")
      expect(emailFault.email).toBe("test@example.com")
      expect(emailFault.level).toBe(1)
      expect(emailFault.context).toEqual({
        host: "smtp.example.com",
        port: 587,
        retries: 3,
      })
    })

    it("should allow message override while preserving other constructor arguments", () => {
      class CustomError extends Error {
        level: 1 | 2 | 3 | 4 | 5

        constructor(message: string, level: 1 | 2 | 3 | 4 | 5) {
          super(message)
          this.level = level
        }
      }

      const CustomFault = extend(CustomError)

      const fault = CustomFault.create("Original message", 1).withDescription(
        "Debug info",
        "Overridden message"
      )

      expect(fault.debug).toBe("Debug info")
      expect(fault.message).toBe("Overridden message")
      expect(fault.level).toBe(1)
    })

    it("should allow withDebug to set debug while preserving other properties", () => {
      class CustomError extends Error {
        level: 1 | 2 | 3 | 4 | 5

        constructor(message: string, level: 1 | 2 | 3 | 4 | 5) {
          super(message)
          this.level = level
        }
      }

      const CustomFault = extend(CustomError)

      const fault = CustomFault.create("Original message", 2).withDebug(
        "Debug information"
      )

      expect(fault.debug).toBe("Debug information")
      expect(fault.message).toBe("Original message")
      expect(fault.level).toBe(2)
    })

    it("should allow withMessage to set message while preserving other properties", () => {
      class CustomError extends Error {
        level: 1 | 2 | 3 | 4 | 5

        constructor(message: string, level: 1 | 2 | 3 | 4 | 5) {
          super(message)
          this.level = level
        }
      }

      const CustomFault = extend(CustomError)

      const fault = CustomFault.create("Original message", 3)
        .withDescription("Debug info")
        .withMessage("New user message")

      expect(fault.message).toBe("New user message")
      expect(fault.debug).toBe("Debug info")
      expect(fault.level).toBe(3)
    })
  })

  describe("tags and defaults", () => {
    it("should use default tag when no tag is provided", () => {
      class CustomError extends Error {}

      const CustomFault = extend(CustomError)

      const fault =
        CustomFault.create("Test message").withDescription("Debug info")

      expect(fault.tag).toBe("No fault tag set")
    })
  })

  describe("serialization", () => {
    it("should serialize extended fault to JSON with all properties", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.name = "HttpError"
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const httpFault = HttpFault.create("Not Found", 404)
        .withTag("LAYER_3")
        .withDescription(
          "Resource not found in database",
          "The requested resource was not found"
        )
        .withContext({ endpoint: "/api/users/123", method: "GET" })

      const json = httpFault.toJSON()

      expect(json).toEqual({
        name: "HttpError",
        tag: "LAYER_3",
        message: "The requested resource was not found.",
        debug: "Resource not found in database.",
        context: { endpoint: "/api/users/123", method: "GET" },
        cause: undefined,
      })
    })

    it("should serialize extended fault to JSON with default values for optional properties", () => {
      class SimpleError extends Error {
        constructor(message: string) {
          super(message)
          this.name = "SimpleError"
        }
      }

      const SimpleFault = extend(SimpleError)
      const simpleFault = SimpleFault.create("Something failed")

      const json = simpleFault.toJSON()

      expect(json).toEqual({
        name: "SimpleError",
        tag: "No fault tag set",
        message: "Something failed.",
        debug: "",
        context: {},
        cause: undefined,
      })
    })

    it("should aggregate messages from extended fault chain", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.name = "HttpError"
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout", "Failed to connect to database")
      const httpFault = HttpFault.create("Request failed", 500)
        .withTag("LAYER_2")
        .withDescription("Service failed", "Authentication service unavailable")
      httpFault.cause = fault1

      const json = JSON.parse(JSON.stringify(httpFault))

      expect(json.message).toBe(
        "Authentication service unavailable. → Failed to connect to database."
      )
      expect(json.debug).toBe("Service failed. → DB timeout.")
    })
  })

  describe("unwrapping", () => {
    it("should unwrap extended fault with cause chain", () => {
      class ServiceError extends Error {
        service: string

        constructor(message: string, service: string) {
          super(message)
          this.name = "ServiceError"
          this.service = service
        }
      }

      const ServiceFault = extend(ServiceError)

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
        .withTag("LAYER_2")
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

      const ApiFault = extend(ApiError)
      const apiFault = ApiFault.create(
        "API rate limit exceeded",
        "/api/v1/users"
      ).withTag("LAYER_1")

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

      const NetworkFault = extend(NetworkError)

      // Create a complex chain: rootError -> fault1 -> networkFault -> fault2
      const rootError = new Error("Connection reset")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const networkFault = NetworkFault.create(
        "Request timeout",
        30_000
      ).withTag("LAYER_2")
      networkFault.cause = fault1

      const fault2 = Fault.wrap(networkFault).withTag("LAYER_3")

      const chain = fault2.unwrap()

      expect(chain).toHaveLength(4)
      expect(chain[0]).toBe(fault2)
      expect(chain[1]).toBe(networkFault)
      expect(chain[2]).toBe(fault1)
      expect(chain[3]).toBe(rootError)

      // Verify IS_FAULT symbol works with extended faults
      const faults = chain.filter(Fault.isFault)
      expect(faults).toHaveLength(3)
      // @ts-expect-error - FaultWithContext is not assignable to FaultWithTag
      expect(faults[0]).toBe(fault2)
      // @ts-expect-error - FaultWithContext is not assignable to FaultWithTag
      expect(faults[1]).toBe(networkFault)
      // @ts-expect-error - FaultWithContext is not assignable to FaultWithTag
      expect(faults[2]).toBe(fault1)
    })
  })

  describe("context management", () => {
    it("should merge context when calling withContext multiple times", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const httpFault = HttpFault.create("Not found", 404)
        .withTag("LAYER_1")
        .withContext({
          host: "localhost",
          port: 5432,
          database: "users",
          timeout: 30_000,
        })

      expect(httpFault.context).toEqual({
        host: "localhost",
        port: 5432,
        database: "users",
        timeout: 30_000,
      })
    })

    it("should default to empty object when no context is provided", () => {
      class CustomError extends Error {}
      const CustomFault = extend(CustomError)

      const fault = CustomFault.create("Test")

      expect(fault.context).toEqual({})
    })

    it("should clear context when clearContext is called", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const httpFault = HttpFault.create("Not found", 404)
        .withTag("LAYER_1")
        .withContext({ host: "localhost", port: 5432 })
        .clearContext()

      expect(httpFault.context).toEqual({})
    })

    it("should get merged context from full error chain", () => {
      class HttpError extends Error {
        statusCode: number
        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const fault1 = Fault.wrap(new Error("test"))
        .withTag("LAYER_1")
        .withContext({
          host: "localhost",
        })
      const httpFault = HttpFault.create("Request failed", 500)
        .withTag("LAYER_2")
        .withContext({
          service: "api",
          method: "GET",
        })
      httpFault.cause = fault1

      expect(httpFault.getFullContext()).toEqual({
        host: "localhost",
        service: "api",
        method: "GET",
      })
    })
  })

  describe("method chaining", () => {
    it("should support chaining multiple modifiers", () => {
      class ValidationError extends Error {
        field: string

        constructor(message: string, field: string) {
          super(message)
          this.name = "ValidationError"
          this.field = field
        }
      }

      const ValidationFault = extend(ValidationError)

      const validationFault = ValidationFault.create("Invalid input", "email")
        .withTag("LAYER_1")
        .withContext({ host: "localhost", database: "users" })
        .withDescription(
          "Email format is invalid",
          "Please enter a valid email address"
        )

      expect(validationFault.tag).toBe("LAYER_1")
      expect(validationFault.debug).toBe("Email format is invalid")
      expect(validationFault.message).toBe("Please enter a valid email address")
      expect(validationFault.context).toEqual({
        host: "localhost",
        database: "users",
      })
      expect(validationFault.field).toBe("email")
    })
  })

  describe("utility methods", () => {
    it("should get all tags from extended fault chain", () => {
      class HttpError extends Error {
        statusCode: number
        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError).withTag("LAYER_1")
      const httpFault = HttpFault.create("Request failed", 500).withTag(
        "LAYER_2"
      )
      httpFault.cause = fault1

      expect(httpFault.getTags()).toEqual(["LAYER_2", "LAYER_1"])
    })

    it("should flatten messages from extended fault chain", () => {
      class HttpError extends Error {
        statusCode: number
        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const rootError = new Error("Network timeout")
      const httpFault = HttpFault.create("Request failed", 500)
      httpFault.cause = rootError

      expect(httpFault.flatten()).toBe("Request failed -> Network timeout")
    })

    it("should get debug messages from extended fault chain", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Connection timeout after 30s")
      const httpFault = HttpFault.create("Request failed", 500)
        .withTag("LAYER_2")
        .withDescription("HTTP 500 error from upstream")
      httpFault.cause = fault1

      expect(BaseFault.getDebug(httpFault)).toBe(
        "HTTP 500 error from upstream. Connection timeout after 30s."
      )
    })

    it("should get issue messages from extended fault chain", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Network issue", "Connection timeout")
      const httpFault = HttpFault.create("Request failed", 500)
        .withTag("LAYER_2")
        .withDescription("HTTP error", "Service unavailable")
      httpFault.cause = fault1

      expect(BaseFault.getIssue(httpFault)).toBe(
        "Service unavailable. Connection timeout."
      )
    })
  })
})
