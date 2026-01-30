import Faultier from "./lib/index.ts"

export { define, IS_FAULT, NO_FAULT_TAG, UNKNOWN } from "./lib/index.ts"
export type {
  ChainFormattingOptions,
  FaultContext,
  SerializableError,
  SerializableFault,
  TaggedFault,
  TagsOf,
} from "./lib/types.ts"

export default Faultier
