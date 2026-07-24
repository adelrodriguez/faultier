import core from "adamantite/lint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core],
  options: {
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      files: ["src/lib/fault.ts"],
      rules: { "unicorn/custom-error-definition": "off" },
    },
    {
      files: ["src/lib/registry.ts"],
      rules: { "typescript/no-invalid-void-type": "off" },
    },
    {
      files: ["src/lib/__tests__/types.test.ts"],
      rules: { "typescript/no-unnecessary-type-parameters": "off" },
    },
  ],
})
