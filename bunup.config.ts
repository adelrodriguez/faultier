import { defineConfig } from "bunup"

export default defineConfig({
  clean: true,
  dts: {
    splitting: false,
  },
  entry: ["src/index.ts", "src/errors.ts", "src/types.ts"],
  format: "esm",
  outDir: "dist",
  sourcemap: true,
  splitting: true,
  target: "node",
})
