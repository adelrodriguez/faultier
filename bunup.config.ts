import { defineConfig } from "bunup"

export default defineConfig({
  clean: true,
  dts: {
    splitting: true,
  },
  entry: ["src/index.ts", "src/extend.ts"],
  format: "esm",
  outDir: "dist",
  sourcemap: true,
  target: "node",
})
