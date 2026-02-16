import { ReservedFieldError } from "./errors"
import { Fault } from "./fault"
import { RESERVED_KEYS } from "./utils"

type TaggedArgs<Fields extends object> = keyof Fields extends never
  ? [fields?: Record<string, never>]
  : [fields: Fields]

export type TaggedInstance<Tag extends string, Fields extends object> = Fault &
  Readonly<Fields> & {
    readonly _tag: Tag
  }

export type TaggedClass<Tag extends string, Fields extends object> = abstract new (
  ...args: TaggedArgs<Fields>
) => TaggedInstance<Tag, Fields>

export function Tagged<const Tag extends string>(tag: Tag) {
  return function <Fields extends object = Record<never, never>>(): TaggedClass<Tag, Fields> {
    abstract class TaggedFault extends Fault {
      static readonly _tag: Tag = tag

      // Recommended convention: keep class name equal to `_tag` for readability.
      // This is not enforced at runtime.

      constructor(...args: TaggedArgs<Fields>) {
        super(tag)

        const fields = (args[0] ?? {}) as Record<string, unknown>

        for (const key of Object.keys(fields)) {
          if (RESERVED_KEYS.has(key)) {
            throw new ReservedFieldError({ field: key })
          }
        }

        Object.assign(this, fields)
      }
    }

    return TaggedFault as unknown as TaggedClass<Tag, Fields>
  }
}
