# Contributing to Faultier

Thank you for your interest in contributing to Faultier! This document provides guidelines and instructions for contributing to the project.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org) 24 or higher
- [pnpm](https://pnpm.io) 11 or higher
- TypeScript 5.4 or higher

### Installation

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/faultier.git
   cd faultier
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```

## Project Structure

```
src/
├── index.ts          # Core runtime entry point
├── errors.ts         # faultier/errors entry point
├── types.ts          # faultier/types entry point
├── __tests__/        # Public API and type-level tests
└── lib/              # Internal implementation modules
    ├── fault.ts
    ├── tagged.ts
    ├── registry.ts
    ├── merge.ts
    ├── match.ts
    ├── reviver.ts
    ├── registry-state.ts
    ├── errors.ts
    └── wire.ts
```

See [`CONTEXT.md`](CONTEXT.md) for the domain glossary, behavioral model, and detailed module responsibilities.

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm run test:watch

# With coverage
pnpm run test:coverage
```

### Code Quality

```bash
# Check linting and formatting
pnpm run check

# Format files
pnpm run format

# Auto-fix linting issues
pnpm run fix

# Type checking
pnpm run typecheck

# Find unused code and dependencies
pnpm run analyze
```

All checks must pass before submitting a PR.

### Building

```bash
# Build the package
pnpm run build

# Watch mode
pnpm run dev

# Build and verify all published entry points
pnpm run test:package
```

## Making Changes

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring

### Commit Messages

Write clear, concise commit messages that describe what changed and why:

```
feat: add support for custom error serialization

Allows users to define custom serialization logic for context objects.
```

### Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Use the configured Adamantite, Oxfmt, and Oxlint tooling
- Prefer `unknown` and narrowing over `any`
- Keep justified suppressions as narrow as possible

### Testing

- Add tests for new features
- Update tests when modifying existing functionality
- Ensure all tests pass before submitting
- Public tests live in `src/__tests__/` and import only from `src/index.ts`, `src/errors.ts`, or `src/types.ts`
- Public API type changes require coverage in `src/__tests__/types.test.ts`
- Type assertions are checked by `pnpm run check` and `pnpm run typecheck`, not Vitest
- Internal tests are appropriate only when behavior cannot be reached through a public entry point

## Changesets Workflow

This project uses [Changesets](https://github.com/changesets/changesets) for version management and changelog generation.

### When to Add a Changeset

Add a changeset for any user-facing changes:

- New features
- Bug fixes
- Breaking changes
- Deprecations

Skip changesets for:

- Documentation updates
- Internal refactoring without behavior changes
- Test updates

### Creating a Changeset

```bash
pnpm exec changeset
```

Follow the prompts to:

1. Select the type of change (major, minor, patch)
2. Write a summary of the change

The changeset file will be created in `.changeset/` and should be committed with your PR.

#### Change Types

- **Major** (breaking changes): API changes that require user code updates
- **Minor** (new features): Backwards-compatible new functionality
- **Patch** (bug fixes): Backwards-compatible bug fixes

Choose a major bump only when the breaking release has been explicitly planned and approved.

## Submitting a Pull Request

### Before Submitting

Ensure your PR meets these requirements:

- [ ] Code follows the project's style guidelines
- [ ] Formatting passes (`pnpm run format`)
- [ ] All tests pass (`pnpm test`)
- [ ] Type checking passes (`pnpm run typecheck`)
- [ ] Linting passes (`pnpm run check`)
- [ ] Package verification passes for entrypoint/build changes (`pnpm run test:package`)
- [ ] Changeset added (if applicable)
- [ ] Documentation updated (if needed)

### PR Process

1. Push your changes to your fork
2. Create a pull request against the `main` branch
3. Fill out the PR template with:
   - Description of changes
   - Motivation and context
   - Breaking changes (if any)
   - Related issues
4. Wait for CI checks to pass
5. Address review feedback

### CI Checks

Pull requests must pass:

- **Lint** - Code style and formatting
- **Typecheck** - TypeScript compilation
- **Test** - All test suites
- **Package verification** - Built entrypoints and declarations resolve for consumers

## Getting Help

- Open an [issue](https://github.com/adelrodriguez/faultier/issues) for bug reports or feature requests
- Check existing issues before creating a new one
- Provide as much context as possible

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions. We're here to build great software together.

## License

By contributing to Faultier, you agree that your contributions will be licensed under the MIT License.
