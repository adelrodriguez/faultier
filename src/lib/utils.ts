export const HAS_PUNCTUATION = /[.!?]$/

export const IS_FAULT: unique symbol = Symbol("IS_FAULT")
export const UNKNOWN: unique symbol = Symbol("UNKNOWN")
export const NO_TAG = "No fault tag set" as const

export function formatFaultName(constructorName: string, tag: string): string {
  const baseName = constructorName === "FaultBase" ? "Fault" : constructorName
  return tag === NO_TAG ? baseName : `${baseName}[${tag}]`
}

export function defaultTrimFormatter(msg: string): string {
  return msg.trim()
}

export function defaultIssueFormatter(msg: string): string {
  const trimmed = msg.trim()
  if (!trimmed) return ""
  return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
}

export function defaultDetailFormatter(msg: string): string {
  const trimmed = msg.trim()
  return HAS_PUNCTUATION.test(trimmed) ? trimmed : `${trimmed}.`
}
