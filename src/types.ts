/**
 * Registry interface for module augmentation. Extend this interface in your
 * application to define fault tags and their associated context schemas.
 *
 * @example
 * ```ts
 * declare module "faultier" {
 *   interface FaultRegistry {
 *     tags: "DATABASE_ERROR" | "AUTH_ERROR" | "NOT_FOUND"
 *     context: {
 *       DATABASE_ERROR: { query: string; host: string }
 *       AUTH_ERROR: { userId: string; reason: string }
 *       NOT_FOUND: { path: string }
 *     }
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: Module augmentation
export interface FaultRegistry {
  // tags
  // context
}

/**
 * Extracts tag keys from FaultRegistry.tags.
 */
export type FaultTag = FaultRegistry extends { tags: infer Tags }
  ? Tags
  : string

/**
 * Extracts context schema from FaultRegistry.context.
 */
export type FaultContextSchema = FaultRegistry extends { context: infer Schema }
  ? Schema
  : Record<string, unknown>

/**
 * Gets the context type for a specific tag.
 */
export type ContextForTag<TTag extends string> =
  TTag extends keyof FaultContextSchema
    ? FaultContextSchema[TTag]
    : Record<string, unknown>

/**
 * Options for formatting fault chain messages in methods like getIssue, getDebug, and flatten.
 */
export type ChainFormattingOptions = {
  /** Separator used to join messages from the fault chain */
  separator: string
  /** Function to format each message before joining */
  formatter: (message: string) => string
}

export type FaultJSON<
  TTag extends string = string,
  TContext extends ContextForTag<TTag> = ContextForTag<TTag>,
> = {
  name: string
  tag: TTag
  message: string
  debug?: string
  context: TContext
  cause?: string
}

/**
 * Serialized representation of a plain Error (non-Fault).
 */
export interface SerializableError {
  name: string
  message: string
}

/**
 * Serialized representation of a Fault with full error chain support.
 * Unlike FaultJSON, this preserves the entire cause chain as nested objects.
 */
export interface SerializableFault {
  name: string
  tag: string
  message: string
  debug?: string
  context: Record<string, unknown>
  cause?: SerializableFault | SerializableError
}
