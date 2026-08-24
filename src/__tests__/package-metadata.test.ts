import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("package metadata", () => {
  it("publishes the root, errors, and types entrypoints", async () => {
    const packageJson: unknown = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    )

    expect(packageJson).toHaveProperty("exports", {
      ".": {
        import: "./dist/index.js",
        types: "./dist/index.d.ts",
      },
      "./errors": {
        import: "./dist/errors.js",
        types: "./dist/errors.d.ts",
      },
      "./types": {
        import: "./dist/types.js",
        types: "./dist/types.d.ts",
      },
    })
    expect(packageJson).toHaveProperty("files", ["dist"])
  })
})
