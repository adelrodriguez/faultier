export const HAS_PUNCTUATION = /[.!?]$/

/**
 * Default formatter that trims whitespace from messages.
 */
export const defaultTrimFormatter = (msg: string) => msg.trim()

/**
 * Formatter for issue messages that trims and adds punctuation if missing.
 * Returns empty string if the trimmed message is empty.
 */
export const defaultIssueFormatter = (msg: string) => {
  const trimmed = msg.trim()
  if (!trimmed) return ""
  return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
}

/**
 * Formatter for details messages that trims and adds punctuation if missing.
 */
export const defaultDetailsFormatter = (msg: string) => {
  const trimmed = msg.trim()
  return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
}
