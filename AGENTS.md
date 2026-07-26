# AGENTS.md for Faultier

## Agents

- Always use the `changeset-writer` agent when you need to create or update changeset entries based on git changes.
- Add changesets only for user-facing changes. Never choose a major bump without explicit user approval.

## Validation

- Always run `bun run format`, `bun run check`, `bun run typecheck`, and `bun test` after code changes.

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun run build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.
- Prefer function declarations for standalone functions; avoid arrow functions for individually named functions.

## Testing

Use `bun test` to run tests. Use `describe` to group tests by function or feature. Write test descriptions as present-tense behavioral sentences without "should" (for example: `it("returns value when function succeeds")`, `it("throws Panic when catch throws")`).

- `describe` labels should be the exact function or class being tested (for example: `describe("Fault")`, `describe("withCause")`).
- Public API tests live in `src/__tests__/` and import only from `src/index.ts`, `src/errors.ts`, or `src/types.ts`.
- Public API type changes must be covered in `src/__tests__/types.test.ts`.
- Type assertions are enforced by `bun run check` and `bun run typecheck`, not `bun test`.

```ts#index.test.ts
import { it, expect } from "bun:test";

it("returns the expected value", () => {
  expect(1).toBe(1);
});
```

## Suppressions

- Use `@ts-expect-error -- reason` for intentional type errors.
- Keep Oxlint disables as narrow as possible and explain why the suppressed operation is safe.
