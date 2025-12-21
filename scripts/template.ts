import Bun from "bun"
import { cancel, intro, isCancel, log, outro, spinner, text } from "@clack/prompts"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { defineCommand } from "./utils"

const TEMPLATE_NAME = "pastry"
const TEMPLATE_AUTHOR = "Adel Rodríguez <hey@adel.do>"
const TEMPLATE_GITHUB_USER = "adelrodriguez"
const TEMPLATE_DESCRIPTION = "A simple template to build libraries with Bun"

const init = defineCommand({
  command: "init",
  describe: "Initialize a new project",
  handler: async () => {
    intro("🥐 Pastry")

    const name = await text({
      message: "What is the name of the project?",
      placeholder: TEMPLATE_NAME,
      validate: (value) => {
        if (value.length === 0) {
          return "Project name is required"
        }
      },
    })

    if (isCancel(name)) {
      cancel("Operation cancelled")
      return
    }

    const author = await text({
      message: "What is the author of the project?",
      placeholder: TEMPLATE_AUTHOR,
      defaultValue: TEMPLATE_AUTHOR,
    })

    if (isCancel(author)) {
      cancel("Operation cancelled")
      return
    }

    const githubUser = await text({
      message: "What is the GitHub user of the project?",
      placeholder: TEMPLATE_GITHUB_USER,
      defaultValue: TEMPLATE_GITHUB_USER,
    })

    if (isCancel(githubUser)) {
      cancel("Operation cancelled")
      return
    }

    const description = await text({
      message: "What is the description of the project?",
      placeholder: TEMPLATE_DESCRIPTION,
      validate: (value) => {
        if (value.length === 0) {
          return "Description is required"
        }
      },
    })

    if (isCancel(description)) {
      cancel("Operation cancelled")
      return
    }

    const s = spinner()

    s.start("Updating package.json...")

    await Bun.file("package.json")
      .text()
      .then((value) => value.replaceAll(TEMPLATE_NAME, name))
      .then((value) => value.replaceAll(TEMPLATE_AUTHOR, author))
      .then((value) => value.replaceAll(TEMPLATE_GITHUB_USER, githubUser))
      .then((value) => value.replaceAll(TEMPLATE_DESCRIPTION, description))
      .then((updated) => Bun.write("package.json", updated))

    s.stop("Package.json updated")

    s.start("Updating README.md...")

    const readme = `
<div align="center">
  <h1 align="center">${name}</h1>

  <p align="center">
    <strong>${description}</strong>
  </p>
</div>

Made with [🥐 \`pastry\`](https://github.com/adelrodriguez/pastry)
    `

    await Bun.write("README.md", readme)

    s.stop("README.md updated")

    s.start("Remove template documentation...")

    const exists = await Bun.file("./docs").exists()

    if (exists) {
      await Bun.$`rm -rf ./docs`
    }

    s.stop("Template documentation removed")

    log.success("✨ Project initialized successfully")

    outro("Get to cooking! 🥐")
  },
})

yargs(hideBin(process.argv))
  .scriptName("template")
  .version(
    await Bun.file("package.json")
      .json()
      .then((json) => json.version)
  )
  .command(init)
  .demandCommand(1, "A command is required")
  .parse()
