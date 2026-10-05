import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

const config: KnipConfig = {
  ...analyze,
  entry: ["src/*.ts", "src/**/*.test-d.ts", "scripts/*.ts"],
}

export default config
