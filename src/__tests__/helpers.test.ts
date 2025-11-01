import { describe, expect, it } from "bun:test"
import Fault from "../core"
import { getDebug, getIssue } from "../helpers"

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

describe("helpers", () => {
  describe("getIssue", () => {
    it("should extract message from single fault", () => {
      const fault = Fault.wrap(new Error("Something happened"))
        .withTag("MY_TAG")
        .withDescription("Debug info", "User-facing message")

      expect(getIssue(fault)).toBe("User-facing message.")
    })

    it("should extract messages from all faults in chain", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout", "Failed to connect to database")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Service failed", "Authentication service unavailable")
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withDescription("API failed", "User login failed")

      expect(getIssue(fault3)).toBe(
        "User login failed. Authentication service unavailable. Failed to connect to database."
      )
    })

    it("should exclude raw error messages, only fault messages", () => {
      const originalError = new Error("Raw error message")
      const fault1 = Fault.wrap(originalError)
        .withTag("LAYER_1")
        .withDescription("Debug info", "Fault message 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("More debug", "Fault message 2")

      // Should only include fault messages, not the raw error message
      expect(getIssue(fault2)).toBe("Fault message 2. Fault message 1.")
    })

    it("should use original error message when no user message provided", () => {
      const originalError = new Error("Original error message")
      const fault = Fault.wrap(originalError)
        .withTag("MY_TAG")
        .withDescription("Debug info")

      expect(getIssue(fault)).toBe("Original error message.")
    })

    it("should add periods and join with spaces", () => {
      const fault1 = Fault.wrap(new Error("Error 1"))
        .withTag("LAYER_1")
        .withDescription("Debug", "Message 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug", "Message 2")

      const result = getIssue(fault2)
      expect(result).toBe("Message 2. Message 1.")
      expect(result.split(" ")).toHaveLength(4) // "Message 2. Message 1."
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Token validation", "Token expired")
      const fault2 = Fault.wrap(fault1)
        .withTag("AUTH_ERROR")
        .withDescription("Auth failed", "Authentication failed")

      expect(getIssue(fault2)).toBe("Authentication failed. Token expired.")
    })

    it("should work with extended faults", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("NETWORK_ERROR")
        .withDescription("Network issue", "Connection timeout")
      const httpFault = HttpFault.create("Request failed", 500)
        .withTag("HTTP_ERROR")
        .withDescription("HTTP error", "Service unavailable")
      httpFault.cause = fault1

      expect(getIssue(httpFault)).toBe(
        "Service unavailable. Connection timeout."
      )
    })

    it("should handle empty message strings", () => {
      // biome-ignore lint/suspicious/useErrorMessage: we want to test the empty string case
      const fault = Fault.wrap(new Error("")).withTag("TEST")

      expect(getIssue(fault)).toBe(".")
    })

    it("should work with single fault without description", () => {
      const fault = Fault.wrap(new Error("Original message")).withTag("MY_TAG")

      expect(getIssue(fault)).toBe("Original message.")
    })
  })

  describe("getDebug", () => {
    it("should extract debug message from single fault", () => {
      const fault = Fault.wrap(new Error("Something happened"))
        .withTag("MY_TAG")
        .withDescription("Debug message here")

      expect(getDebug(fault)).toBe("Debug message here.")
    })

    it("should extract debug messages from all faults in chain", () => {
      const rootError = new Error("Database connection failed")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("DB timeout on port 5432", "Failed to connect")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription(
          "Service failed after 3 retries",
          "Service unavailable"
        )
      const fault3 = Fault.wrap(fault2)
        .withTag("LAYER_3")
        .withDescription("API call timeout", "API failed")

      expect(getDebug(fault3)).toBe(
        "API call timeout. Service failed after 3 retries. DB timeout on port 5432."
      )
    })

    it("should exclude raw errors, only fault debug messages", () => {
      const originalError = new Error("Raw error message")
      const fault1 = Fault.wrap(originalError)
        .withTag("LAYER_1")
        .withDescription("Debug info 1", "Message 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug info 2", "Message 2")

      // Should only include fault debug messages, not the raw error message
      expect(getDebug(fault2)).toBe("Debug info 2. Debug info 1.")
    })

    it("should add periods and join with spaces", () => {
      const fault1 = Fault.wrap(new Error("Error 1"))
        .withTag("LAYER_1")
        .withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1)
        .withTag("LAYER_2")
        .withDescription("Debug 2")

      const result = getDebug(fault2)
      expect(result).toBe("Debug 2. Debug 1.")
      expect(result.split(" ")).toHaveLength(4) // "Debug 2. Debug 1."
    })

    it("should work with registry-typed faults", () => {
      const rootError = new Error("Invalid token")
      const fault1 = Fault.wrap(rootError)
        .withTag("LAYER_1")
        .withDescription("Token validation failed")
      const fault2 = Fault.wrap(fault1)
        .withTag("AUTH_ERROR")
        .withDescription("Auth service returned 401")

      expect(getDebug(fault2)).toBe(
        "Auth service returned 401. Token validation failed."
      )
    })

    it("should work with extended faults", () => {
      class HttpError extends Error {
        statusCode: number

        constructor(message: string, statusCode: number) {
          super(message)
          this.statusCode = statusCode
        }
      }

      const HttpFault = Fault.extend(HttpError)

      const rootError = new Error("Network timeout")
      const fault1 = Fault.wrap(rootError)
        .withTag("NETWORK_ERROR")
        .withDescription("Connection timeout after 30s")
      const httpFault = HttpFault.create("Request failed", 500)
        .withTag("HTTP_ERROR")
        .withDescription("HTTP 500 error from upstream")
      httpFault.cause = fault1

      expect(getDebug(httpFault)).toBe(
        "HTTP 500 error from upstream. Connection timeout after 30s."
      )
    })

    it("should handle undefined debug messages", () => {
      const fault = Fault.wrap(new Error("Something happened")).withTag("TEST")

      // When debug is undefined, it will map to "undefined."
      expect(getDebug(fault)).toBe("undefined.")
    })

    it("should handle empty debug strings", () => {
      const fault = Fault.wrap(new Error("Error"))
        .withTag("TEST")
        .withDescription("")

      expect(getDebug(fault)).toBe(".")
    })

    it("should work with mixed debug and non-debug faults", () => {
      const fault1 = Fault.wrap(new Error("Error 1"))
        .withTag("LAYER_1")
        .withDescription("Debug 1")
      const fault2 = Fault.wrap(fault1).withTag("LAYER_2")
      // No debug description

      expect(getDebug(fault2)).toBe("undefined. Debug 1.")
    })
  })
})
