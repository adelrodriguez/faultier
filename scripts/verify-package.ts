import { execFileSync } from "node:child_process"
import { existsSync, rmSync, writeFileSync } from "node:fs"
import type * as FaultierErrorsContract from "../src/errors"
import type * as FaultierContract from "../src/index"

const rootSpecifier = "faultier"
const errorsSpecifier = "faultier/errors"
const typesSpecifier = "faultier/types"

const Faultier = (await import(rootSpecifier)) as typeof FaultierContract
const FaultierErrors = (await import(errorsSpecifier)) as typeof FaultierErrorsContract
const FaultierTypes = (await import(typesSpecifier)) as object

function assertExports(namespace: object, expected: string[], entrypoint: string): void {
  const actual = Object.keys(namespace)
  const hasExpectedExports =
    actual.length === expected.length && expected.every((name) => Object.hasOwn(namespace, name))

  if (!hasExpectedExports) {
    throw new Error(`Unexpected ${entrypoint} exports: ${actual.join(", ")}`)
  }
}

assertExports(
  Faultier,
  ["Fault", "Tagged", "fromSerializable", "isFault", "matchTag", "matchTags", "merge", "registry"],
  "faultier"
)
assertExports(
  FaultierErrors,
  ["RegistryMergeConflictError", "RegistryTagMismatchError", "ReservedFieldError"],
  "faultier/errors"
)
assertExports(FaultierTypes, [], "faultier/types")

class InvalidFieldError extends Faultier.Tagged("InvalidFieldError")<{ message: string }>() {}

let thrown: unknown
try {
  const invalidFieldError = new InvalidFieldError({ message: "reserved" })
  void invalidFieldError
} catch (error) {
  thrown = error
}

if (!(thrown instanceof FaultierErrors.ReservedFieldError)) {
  throw new Error("Root behavior and faultier/errors do not share error constructor identity")
}

const outputPaths = [
  "dist/errors.d.ts",
  "dist/errors.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/types.d.ts",
  "dist/types.js",
] as const

for (const path of outputPaths) {
  if (!existsSync(path)) throw new Error(`Missing package output: ${path}`)
}

const consumerPath = "dist/node-next-consumer.ts"
writeFileSync(
  consumerPath,
  `import { Tagged, registry } from "faultier"
import { ReservedFieldError } from "faultier/errors"
import type { FaultRegistry, SerializableFault } from "faultier/types"

class ConsumerError extends Tagged("ConsumerError")() {}

const ConsumerFault = registry({ ConsumerError })
const registryContract: FaultRegistry<{ readonly ConsumerError: typeof ConsumerError }> = ConsumerFault
const serialized: SerializableFault = ConsumerFault.create("ConsumerError").toSerializable()

void registryContract
void serialized
void ReservedFieldError
`
)

try {
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "false",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ESNext",
      consumerPath,
    ],
    { stdio: "inherit" }
  )
} finally {
  rmSync(consumerPath, { force: true })
}
