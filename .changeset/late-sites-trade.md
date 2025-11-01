---
"pastry": minor
---

Add interactive template initialization CLI and comprehensive documentation

This release introduces two major features that significantly improve the developer experience when working with the Pastry template:

**Interactive Template CLI** (d3b12c5)

- Added `bun run template init` command that provides an interactive CLI for scaffolding new projects
- Prompts users for project name, author, GitHub username, and description
- Automatically updates package.json, README.md, and removes template documentation
- Uses @clack/prompts for a polished terminal UI with spinners and progress indicators
- Includes proper error handling and validation for user inputs

**Comprehensive Documentation** (870d134)

- Added detailed migration guide (`docs/migrate-project.md`) with 594 lines of documentation covering:
  - Three different git merge strategies for preserving project history
  - Step-by-step post-migration instructions for package.json, source code organization, configuration reconciliation, and dependency updates
  - Troubleshooting section for common migration issues
  - Examples and best practices for converting existing projects to the Pastry template
- Enhanced README.md with a clear overview of included tools (Bun, Bunup, Adamantite, Changesets, GitHub Actions)
- Improved template script with better user feedback and file cleanup

**Claude Code Agent for Changesets**

- Added a specialized `changeset-writer` agent (`.claude/agents/changeset-writer.md`) for automating changelog generation
- Analyzes git diffs and generates appropriate changeset entries following semantic versioning principles
- Provides intelligent version bump recommendations (major/minor/patch) based on change impact
- Writes user-focused changelog descriptions with proper formatting and examples
- Integrates seamlessly with the existing changesets workflow

These additions make it significantly easier for developers to both start new projects from scratch and migrate existing projects to the Pastry template while maintaining their git history.
