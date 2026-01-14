/**
 * Registry interface for module augmentation. Extend this interface in your
 * application to define fault tags and their associated context schemas.
 *
 * @example
 * ```ts
 * declare module "faultier" {
 *   interface FaultRegistry {
 *     DATABASE_ERROR: { query: string; host: string }
 *     AUTH_ERROR: { userId: string; reason: string }
 *     NOT_FOUND: { path: string }
 *     GENERIC_ERROR: never  // no context allowed - withContext will error
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line typescript/no-empty-object-type
export interface FaultRegistry {}

/**
 * Extracts tag keys from FaultRegistry.
 */
export type FaultTag = keyof FaultRegistry extends never ? string : keyof FaultRegistry

/**
 * Gets the context type for a specific tag.
 * Returns never for tags without context (undefined or never), preventing withContext from being called.
 * Returns Record<string, unknown> for unknown tags.
 */
export type ContextForTag<TTag extends string> = TTag extends keyof FaultRegistry
  ? FaultRegistry[TTag] extends undefined
    ? never
    : FaultRegistry[TTag]
  : Record<string, unknown>

/**
 * Gets the partial context type for a specific tag.
 * Used when reading context (e.g., after isFault()) since context may not have been provided.
 */
export type PartialContextForTag<TTag extends string> = TTag extends keyof FaultRegistry
  ? FaultRegistry[TTag] extends undefined
    ? never
    : Partial<FaultRegistry[TTag]>
  : Record<string, unknown>

/**
 * Options for formatting fault chain messages in methods like getIssue, getDebug, and flatten.
 */
export type ChainFormattingOptions = {
  /** Separator used to join messages from the fault chain */
  separator?: string
  /** Function to format each message before joining */
  formatter?: (message: string) => string
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
