import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/errors.ts", "src/types.ts"],
  fixedExtension: false,
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  target: "node18",
  tsconfig: "tsconfig.build.json",
})
