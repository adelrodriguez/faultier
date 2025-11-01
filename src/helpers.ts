import Fault from "./core"

/**
 * Extracts all user-facing messages from the fault chain.
 *
 * @param fault - The fault to extract messages from
 * @returns Space-separated messages ending with periods
 *
 * @example
 * ```ts
 * getIssue(fault)
 * // "Service unavailable. Database connection failed."
 * ```
 */
export function getIssue(fault: Fault): string {
  return fault
    .unwrap()
    .filter(Fault.isFault)
    .map((err) => `${err.message}.`)
    .join(" ")
}

/**
 * Extracts all debug messages from the fault chain.
 *
 * @param fault - The fault to extract debug messages from
 * @returns Space-separated debug messages ending with periods
 *
 * @example
 * ```ts
 * getDebug(fault)
 * // "Service failed after 3 retries. DB timeout on port 5432."
 * ```
 */
export function getDebug(fault: Fault): string {
  return fault
    .unwrap()
    .filter(Fault.isFault)
    .map((err) => `${err.debug}.`)
    .join(" ")
}
