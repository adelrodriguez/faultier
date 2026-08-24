import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

const config: KnipConfig = {
  ...analyze,
  entry: ["scripts/*.ts"],
}

export default config
