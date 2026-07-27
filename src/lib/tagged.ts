import { ReservedFieldError } from "./errors"
import { Fault } from "./fault"
import { RESERVED_KEYS, type SerializableValue } from "./wire"

type TaggedArgs<Fields extends Record<string, SerializableValue>> = keyof Fields extends never
  ? [fields?: Record<string, never>]
  : [fields: Fields]

export type TaggedInstance<
  Tag extends string,
  Fields extends Record<string, SerializableValue>,
> = Fault &
  Readonly<Fields> & {
    readonly _tag: Tag
  }

export type TaggedClass<
  Tag extends string,
  Fields extends Record<string, SerializableValue>,
> = abstract new (...args: TaggedArgs<Fields>) => TaggedInstance<Tag, Fields>

export function Tagged<const Tag extends string>(tag: Tag) {
  // Interface-declared fields need an explicit index signature; use a type alias or inline type.
  return function <
    Fields extends Record<string, SerializableValue> = Record<never, never>,
  >(): TaggedClass<Tag, Fields> {
    abstract class TaggedFault extends Fault {
      static readonly _tag: Tag = tag

      // Recommended convention: keep class name equal to `_tag` for readability.
      // This is not enforced at runtime.

      constructor(...args: TaggedArgs<Fields>) {
        super(tag)

        const fields = (args[0] ?? {}) as Record<string, SerializableValue>

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
