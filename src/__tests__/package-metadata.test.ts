import { describe, expect, it } from "bun:test"

describe("package metadata", () => {
  it("publishes the root, errors, and types entrypoints", async () => {
    const packageJson: unknown = await Bun.file(
      new URL("../../package.json", import.meta.url)
    ).json()

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
