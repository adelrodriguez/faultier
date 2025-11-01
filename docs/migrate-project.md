# Migrating an existing project to this template

This guide walks you through migrating an existing library or project into this template while preserving your git history and maintaining the template system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Migration Strategies](#migration-strategies)
  - [Option 1: Git Subtree Merge (Recommended)](#option-1-git-subtree-merge-recommended)
  - [Option 2: Git Subtree with Prefix](#option-2-git-subtree-with-prefix)
  - [Option 3: Manual History Preservation](#option-3-manual-history-preservation)
- [Post-Migration Steps](#post-migration-steps)
  - [1. Update package.json](#1-update-packagejson)
  - [2. Organize Source Code](#2-organize-source-code)
  - [3. Reconcile Configuration Files](#3-reconcile-configuration-files)
  - [4. Update Build Configuration](#4-update-build-configuration)
  - [5. Migrate Tests](#5-migrate-tests)
  - [6. Update Dependencies](#6-update-dependencies)
  - [7. Update Documentation](#7-update-documentation)
  - [8. Separate Template System (Optional)](#8-separate-template-system-optional)
- [Final Steps](#final-steps)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting the migration, ensure you have:

- ✅ The Pastry template repository cloned locally
- ✅ The existing project you want to migrate
- ✅ Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- ✅ A backup of both repositories (just in case!)

---

## Migration Strategies

Choose the strategy that best fits your needs. **Option 1** is recommended for most use cases.

### Option 1: Git Subtree Merge (Recommended)

This approach preserves the complete git history and cleanly merges both projects.

```bash
# 1. Navigate to your pastry repo
cd /path/to/pastry

# 2. Add your existing project as a remote
git remote add old-project /path/to/your/existing/library

# 3. Fetch the history from the old project
git fetch old-project

# 4. Create a new branch for the merge
git checkout -b migrate-library

# 5. Merge the old project's history (allowing unrelated histories)
git merge old-project/main --allow-unrelated-histories

# 6. If there are conflicts, resolve them:
#    - Keep pastry's config files (package.json, tsconfig.json, biome.jsonc, etc.)
#    - Keep your library's src/ code
#    - Decide on a case-by-case basis for other files

# 7. After resolving conflicts, stage and commit
git add .
git commit -m "Merge existing library into pastry template"

# 8. Merge back to main
git checkout main
git merge migrate-library

# 9. Clean up
git branch -d migrate-library
git remote remove old-project
```

**Pros:**

- ✅ Preserves complete git history
- ✅ Clean merge workflow
- ✅ Easy to track what came from where

**Cons:**

- ⚠️ May have many merge conflicts to resolve
- ⚠️ Combines two separate histories

---

### Option 2: Git Subtree with Prefix

If you want to keep the library code in a separate directory initially:

```bash
# Add the library as a subtree in a separate directory
git subtree add --prefix=packages/your-library /path/to/existing/library main

# This creates a packages/your-library/ directory with full history
# You can then gradually merge it into src/ as needed
```

**Pros:**

- ✅ Keeps projects initially separated
- ✅ Full history preservation
- ✅ Easier to reorganize gradually

**Cons:**

- ⚠️ Requires additional step to merge into src/
- ⚠️ Creates nested directory structure

---

### Option 3: Manual History Preservation

If the above options don't work, use this manual approach:

```bash
# 1. Create a patch bundle of all commits from your old project
cd /path/to/existing/library
git bundle create /tmp/library-history.bundle --all

# 2. Go to pastry and import the bundle
cd /path/to/pastry
git fetch /tmp/library-history.bundle refs/heads/main:refs/heads/old-library

# 3. Cherry-pick or merge specific commits
git cherry-pick <commit-hash>  # For individual commits
# OR
git merge old-library --allow-unrelated-histories

# 4. Clean up
git branch -d old-library
rm /tmp/library-history.bundle
```

**Pros:**

- ✅ Works when remotes aren't accessible
- ✅ Can selectively import commits
- ✅ Full control over what gets merged

**Cons:**

- ⚠️ More manual steps
- ⚠️ Easy to make mistakes

---

## Post-Migration Steps

After merging the git history, you'll need to reconcile configurations and code structure.

### 1. Update package.json

Merge the dependencies and scripts from both projects:

**Keep from Pastry:**

- Build tools: `bunup`, `biome`, `adamantite`, `changesets`
- Package manager: `bun`
- Core scripts: `build`, `dev`, `test`, `typecheck`, `check`, `fix`

**Add from your library:**

- Runtime dependencies → Add to `dependencies`
- Peer dependencies → Add to `peerDependencies`
- Library-specific scripts → Add to `scripts`

**Example merge:**

```json
{
  "name": "your-library-name",
  "version": "0.0.1",
  "description": "Your library description",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "bunup",
    "dev": "bunup --watch",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "typecheck": "tsc --noEmit",
    "check": "adamantite check",
    "fix": "adamantite fix"
  },
  "dependencies": {
    "your-runtime-dep": "^1.0.0"
  },
  "devDependencies": {
    "@changesets/cli": "^2.29.7",
    "bunup": "^0.15.13",
    "adamantite": "^0.13.0",
    "typescript": "^5.0.0"
  }
}
```

### 2. Organize Source Code

Choose a structure that fits your needs:

#### Option A: Replace src/ with your library

```
src/
  ├── index.ts          # Your library's main entry point
  ├── core/             # Your library's core modules
  ├── utils/            # Utility functions
  ├── types/            # TypeScript type definitions
  └── __tests__/        # Tests
```

#### Option B: Monorepo structure (Keep template separate)

```
packages/
  ├── template/         # Move scripts/ here
  │   ├── scripts/
  │   └── package.json
  └── library/          # Your library code
      ├── src/
      ├── package.json
      └── README.md

src/                    # Or keep library in root
```

**Recommendation:** For most cases, use **Option A** if this is primarily a library repo.

### 3. Reconcile Configuration Files

**Keep from Pastry (with potential modifications):**

- ✅ `bunup.config.ts` - Update entry point if needed
- ✅ `biome.jsonc` - Merge any custom linting rules
- ✅ `tsconfig.json` - Extend if needed
- ✅ `.github/workflows/` - Adjust if needed for your library
- ✅ `.changeset/config.json` - Configure package names

**Evaluate from your library:**

- 📝 Test configuration → Adapt to Bun's test runner
- 📝 Additional TypeScript options → Merge into `tsconfig.json`
- 📝 Custom build scripts → Adapt to bunup or keep as custom scripts
- 📝 Linting rules → Merge into `biome.jsonc` or `adamantite` config

### 4. Update Build Configuration

Edit `bunup.config.ts` to match your library's needs:

```typescript
import { defineBunupConfig } from "bunup";

export default defineBunupConfig({
  entry: "src/index.ts", // Update if your entry point differs
  output: {
    dir: "dist",
    format: "esm", // or "cjs" if you need CommonJS
    generateTypes: true, // Generates .d.ts files
    sourcemap: true,
  },
  runtime: "node", // or "browser" for browser libraries
  // Optional: Add external dependencies
  external: ["react", "react-dom"], // Don't bundle these
});
```

**Common adjustments:**

- Change `runtime` to `"browser"` for browser-only libraries
- Add `external` array for peer dependencies
- Adjust `format` if you need multiple output formats

### 5. Migrate Tests

Convert your existing tests to Bun's test format:

**Before (Jest/Vitest):**

```typescript
import { describe, it, expect } from "vitest";

describe("myFunction", () => {
  it("should return true", () => {
    expect(myFunction()).toBe(true);
  });
});
```

**After (Bun):**

```typescript
import { describe, test, expect } from "bun:test";

describe("myFunction", () => {
  test("should return true", () => {
    expect(myFunction()).toBe(true);
  });
});
```

**Key changes:**

- Import from `"bun:test"` instead of `vitest` or `jest`
- Use `test` instead of `it` (both work, but `test` is idiomatic)
- Bun supports most Jest matchers out of the box

**Run tests:**

```bash
bun test                # Run all tests
bun test --watch        # Watch mode
bun test --coverage     # Generate coverage report
```

### 6. Update Dependencies

Remove old tooling and add what you need:

```bash
# Remove old build tools (if migrating from npm)
bun remove jest vitest webpack esbuild rollup dotenv ts-node

# The pastry template already provides:
# ✅ bunup (bundler)
# ✅ biome (linter/formatter via adamantite)
# ✅ bun:test (test runner - built into bun)
# ✅ changesets (versioning)

# Just add your library's runtime dependencies
bun add your-runtime-deps

# Add any peer dependencies
bun add --peer react react-dom
```

**Note:** Bun automatically loads `.env` files, so you don't need `dotenv`.

### 7. Update Documentation

Update `README.md` with your library's information:

```markdown
# Your Library Name

> Brief description of what your library does

## Installation

\`\`\`bash
bun add your-library-name
\`\`\`

## Usage

\`\`\`typescript
import { yourFunction } from "your-library-name"

yourFunction() // Your example
\`\`\`

## Development

\`\`\`bash

# Install dependencies

bun install

# Run tests

bun test

# Build the library

bun run build

# Type checking

bun run typecheck

# Linting

bun run check
bun run fix
\`\`\`

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

MIT
```

**Also consider creating:**

- `CONTRIBUTING.md` - Contribution guidelines
- `CHANGELOG.md` - Will be auto-generated by changesets
- `docs/` - Additional documentation

### 8. Separate Template System (Optional)

If you want to keep both the template system and your library, create a monorepo:

```bash
# Create packages structure
mkdir -p packages/template packages/core

# Move template system
git mv scripts packages/template/scripts
# Create package.json for template
cat > packages/template/package.json << 'EOF'
{
  "name": "@pastry/template",
  "version": "0.0.1",
  "private": true,
  "type": "module"
}
EOF

# Your library stays in root or moves to packages/core
```

**Update root `package.json`:**

```json
{
  "name": "pastry-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "template": "bun run packages/template/scripts/template.ts",
    "build:all": "bun run --filter '*' build"
  }
}
```

---

## Final Steps

After completing the post-migration steps, finalize the setup:

```bash
# 1. Install all dependencies
bun install

# 2. Run type checking
bun run typecheck

# 3. Run linter
bun run check

# 4. Run tests
bun test

# 5. Build the library
bun run build

# 6. Test the build output (if it's a CLI or runnable)
bun run dist/index.js

# 7. Commit the reconciled structure
git add .
git commit -m "chore: reconcile library with pastry template structure"
```

---

## Verification

Ensure everything works correctly:

```bash
# Type checking passes
✓ bun run typecheck

# All tests pass
✓ bun test

# Build succeeds
✓ bun run build

# Linting passes
✓ bun run check

# Build output exists
✓ ls dist/index.js dist/index.d.ts
```

**Additional checks:**

- 📦 Try importing your library in a test project
- 🧪 Run tests with coverage: `bun test --coverage`
- 📚 Review generated type definitions in `dist/`
- 🔍 Check bundle size: `ls -lh dist/`

---

## Troubleshooting

### Merge Conflicts

**Problem:** Many merge conflicts during git merge

**Solution:**

- Accept "theirs" for config files from Pastry (package.json, tsconfig.json, etc.)
- Accept "ours" (your library) for src/ files
- Manually merge package.json dependencies

```bash
# Accept Pastry's version for configs
git checkout --theirs package.json tsconfig.json biome.jsonc

# Accept your library's src/
git checkout --ours src/

# Then manually fix package.json
```

### Type Errors After Migration

**Problem:** TypeScript errors after merging

**Solution:**

1. Check `tsconfig.json` extends the right base config
2. Ensure all dependencies are installed: `bun install`
3. Clear any caches: `rm -rf node_modules .bun dist && bun install`
4. Check for conflicting type definitions

### Tests Not Running

**Problem:** Tests fail or don't run with Bun

**Solution:**

1. Convert test imports to `import { test, expect } from "bun:test"`
2. Remove Jest/Vitest config files
3. Check for unsupported matchers (Bun supports most Jest matchers)
4. Use `bun test --only` to run specific tests

### Build Fails

**Problem:** `bun run build` fails

**Solution:**

1. Check `bunup.config.ts` entry point matches your `src/index.ts`
2. Ensure all imports are valid ESM imports
3. Check for missing dependencies: `bun install`
4. Review bunup documentation: https://github.com/wobsoriano/bunup

### Import Errors

**Problem:** Imports not resolving correctly

**Solution:**

1. Check `package.json` `exports` field is correctly configured
2. Ensure `type: "module"` is set in package.json
3. Use `.js` extensions in imports if needed
4. Check `tsconfig.json` `moduleResolution` is set to `"bundler"`

---

## Need Help?

If you encounter issues not covered here:

1. Check the [Bun documentation](https://bun.sh/docs)
2. Review [bunup documentation](https://github.com/wobsoriano/bunup)
3. Search [Bun Discord](https://bun.sh/discord) for similar issues
4. Open an issue in the Pastry repository

---

**Happy migrating! 🥐**
