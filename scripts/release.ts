import { execFileSync } from "node:child_process"
import packageJson from "../package.json" with { type: "json" }

function run(command: string, arguments_: string[]): void {
  execFileSync(command, arguments_, { stdio: "inherit" })
}

const publishedVersion = execFileSync("npm", ["view", packageJson.name, "version"], {
  encoding: "utf8",
}).trim()

if (publishedVersion === packageJson.version) {
  console.info(`${packageJson.name}@${packageJson.version} is already published.`)
  process.exit(0)
}

run("npm", ["publish"])
run("changeset", ["tag"])
