# AGENTS.md for Faultier

## Agents

- Always use the `changeset-writer` agent when you need to create or update changeset entries based on git changes.
- Add changesets only for user-facing changes. Never choose a major bump without explicit user approval.

## Validation

- Always run `pnpm run fix`, `pnpm run check`, `pnpm run typecheck`, and `pnpm test` after code changes.

## pnpm and Node.js

Use pnpm for package management and package scripts, and Node.js for standalone scripts.

- Use the Node.js version declared in `.node-version`.
- Use `node <file>` for standalone scripts.
- Use `pnpm test` to run Vitest.
- Use `pnpm install` to install dependencies.
- Use `pnpm run <script>` to run package scripts.

## APIs

- Prefer `node:fs` for filesystem operations.
- Prefer `node:child_process` for subprocesses that cannot be expressed as package scripts.
- Prefer function declarations for standalone functions; avoid arrow functions for individually named functions.

## Testing

Use `pnpm test` to run tests. Use `describe` to group tests by function or feature. Write test descriptions as present-tense behavioral sentences without "should" (for example: `it("returns value when function succeeds")`, `it("throws Panic when catch throws")`).

- `describe` labels should be the exact function or class being tested (for example: `describe("Fault")`, `describe("withCause")`).
- A `__tests__/` directory tests only the files it is a sibling of: tests import only from modules in their `__tests__/` directory's parent directory, never from directories outside that scope.
- `src/__tests__/` therefore holds the public API tests (importing only from `src/index.ts`, `src/errors.ts`, or `src/types.ts`), and internal `src/lib/` modules get colocated suites in `src/lib/__tests__/`.
- Public API type changes must be covered in `src/__tests__/types.test.ts`.
- Type assertions are enforced by `pnpm run check` and `pnpm run typecheck`, not Vitest.

```ts#index.test.ts
import { expect, it } from "vitest";

it("returns the expected value", () => {
  expect(1).toBe(1);
});
```

## Suppressions

- Use `@ts-expect-error -- reason` for intentional type errors.
- Keep Oxlint disables as narrow as possible and explain why the suppressed operation is safe.

<!-- ADAMANTITE:START -->

## Adamantite

This project uses Adamantite for its managed formatting, linting, type checking, and dependency-analysis setup.

- Prefer the package scripts Adamantite added for this workspace.
- Run `pnpm run check` to catch lint, formatting, and type issues. Direct command: `adamantite check`.
- Run `pnpm run fix` to apply formatting and safe lint fixes. Direct command: `adamantite fix`.
- Run `pnpm run analyze` after changing dependencies, imports, or exports. Direct command: `adamantite analyze`.
- Use `adamantite doctor` to inspect managed setup and `adamantite doctor --fix` for safe local fixes.

<!-- ADAMANTITE:END -->

<!-- PACKREF:START -->

## Packref

Packref provides local copies of dependency source code so you can inspect the exact implementation used by this project.

- Source references are stored in `.packref/packages/<registry>/<package>/<version>/` for unscoped packages and `.packref/packages/<registry>/<scope>/<package>/<version>/` for scoped packages — browse these directories to read dependency internals
- `.packref/packref-lock.json` is shared and should be committed; `.packref/packages/` is developer-local and git-ignored
- Run `packref install` after cloning when locked references are missing; install restores locked references exactly and does not install runtime dependencies
- Available commands:
  - `packref add [package]` — select manifest dependencies, fetch a registry package, or fetch a direct repository source (e.g. `packref add react`, `packref add hono@4.2.0`, `packref add adelrodriguez/packref`)
    - Direct repository package specs support GitHub shorthand (`owner/repository[/directory][@ref]`), provider shorthand (`github:`, `gitlab:`, `bitbucket:`, or `sourcehut:`), standard Git URLs, and SCP-style SSH URLs
    - A repository ref can be a tag, branch, or full 40-character commit SHA; without a ref, Packref pins the default branch commit
  - `packref remove [package]` — select or name package references to remove
  - `packref install` — materialize every reference already recorded in the committed lockfile
  - `packref sync` — update or remove dependency-tracked lock entries to match current `package.json` dependency versions
  - `packref list` — show all referenced packages
  - `packref prune` — remove unused entries from the global store
  - `packref clean` — remove all project-local references
  - `packref clean --global` — wipe all global store entries
- `packref remove`, `packref prune`, and `packref clean` delete state — run them only when the user requests that removal
- Use Packref when you need to understand how a dependency works internally — read the source in `.packref/` instead of guessing or searching the web
- Multiple versions of the same package can coexist; check `.packref/packref-lock.json` for the full list

<!-- PACKREF:END -->
