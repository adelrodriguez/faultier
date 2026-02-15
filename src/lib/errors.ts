import { Fault } from "./fault"

export class ReservedFieldError extends Fault {
  static readonly _tag = "ReservedFieldError"
  readonly field: string

  constructor(args: { field: string }) {
    super(ReservedFieldError._tag, `Reserved field key: ${args.field}`)
    this.field = args.field
  }
}

export class RegistryTagMismatchError extends Fault {
  static readonly _tag = "RegistryTagMismatchError"
  readonly ctorTag: string
  readonly registryKey: string

  constructor(args: { registryKey: string; ctorTag: string }) {
    super(
      RegistryTagMismatchError._tag,
      `Registry key '${args.registryKey}' does not match constructor tag '${args.ctorTag}'.`
    )
    this.registryKey = args.registryKey
    this.ctorTag = args.ctorTag
  }
}

export class RegistryMergeConflictError extends Fault {
  static readonly _tag = "RegistryMergeConflictError"
  readonly conflictingTag: string

  constructor(args: { conflictingTag: string }) {
    super(
      RegistryMergeConflictError._tag,
      `Registry merge conflict for tag '${args.conflictingTag}'.`
    )
    this.conflictingTag = args.conflictingTag
  }
}
