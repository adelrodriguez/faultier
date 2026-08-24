import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/errors.ts", "src/types.ts"],
  fixedExtension: false,
  minify: true,
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  tsconfig: "tsconfig.build.json",
})
