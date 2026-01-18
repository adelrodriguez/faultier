import { defineConfig } from "bunup"

export default defineConfig({
  clean: true,
  dts: {
    splitting: true,
  },
  entry: ["src/index.ts"],
  format: "esm",
  outDir: "dist",
  sourcemap: true,
  target: "node",
})
