# Features to Develop

## snippets and includes

- snippet codelens to point to test file for tested examples
- add reference lookup codelens for all includes and literalincludes

## Performance

- Ways to gracefully lazy load extension features to improve start up time?
- Optimize build

## Security

- Do a full security audit

## Beyond code examples

Based on analysis of the `docs-mongodb-internal` monorepo, here are opportunities to improve writer workflows:

### Content Creation

- **RST Formatting Assistant** - Integrate style guide prompts directly into VS Code. Provide inline suggestions, auto-formatting at 72 chars, heading underline length matching, and live validation
- **Source Constant/Substitution Auto-complete** - Auto-complete `{+constants+}` and `|substitutions|` based on the project's `snooty.toml`, with hover documentation showing resolved values
- **Code Block → Literalinclude Converter** - One-click command to extract a code-block into a `literalinclude` file in the correct directory structure
- **Include File Creator** - Quick action to extract selected text into a properly named `.rst` include file in the correct subdirectory
- **Tutorial Scaffolding** - Template generator for new tutorials following standardized patterns

### Content Maintenance

- **Typo Detection & Fix** - Real-time spell checking using cspell with the same dictionaries as CI (~18,000 typos found in periodic scans). Could integrate with Jira typo ticket workflow
- **Symlink Status Indicator** - Show symlink status to `code-examples/tested` in status bar. Quick fix to create missing symlinks
- **Version Directory Awareness** - Visual indicators showing which version directory you're editing (`current/`, `upcoming/`, `v6.x/`). Warn if editing older version
- **Backport Helper** - Visual tool to select source changes and target version directories using `.backportrc.json` config
- **Deprecated Examples Checker** - Warn when editing or referencing deprecated code examples (per `deprecated_examples.json`)

### Cross-Reference & Navigation

- **Enhanced literalinclude Support** - Peek/Go-to definition for `literalinclude` paths. Hover preview showing included code. Validate paths exist
- **Include File References** - "Find all references" for `.rst` include files. Show usage count in explorer
- **Intersphinx Link Validation** - Validate `intersphinx` references in `snooty.toml` are reachable
- **TOC Tree Visualization** - Tree view of document structure from `toctree` directives. Click to navigate. Show missing pages

### Code Example Testing

- **Multi-Language Test Runners** - Add runners for Python (pytest), Go, Java, C# per the existing `code-example-tests/` structure
- **Docker Test Environment** - One-click to run tests in Docker matching CI environment (per `*-test-in-docker.yml` workflows)
- **Bluehawk Snippet Validation** - Validate Bluehawk markup before running `snip.js`. Show errors inline
- **Test Coverage Indicator** - Status indicator showing if a code example file has corresponding tests

### Project & Build

- **Project Context Awareness** - Auto-detect project type (versioned vs non-versioned). Show project info in status bar
- **Build Trigger Integration** - Command palette to trigger staging/prod builds for specific branches
- **Table of Contents Preview** - Preview how current page appears in the unified TOC (`content/table-of-contents/`)
- **snooty.toml Editor** - Rich editing experience with validation and auto-complete for constants, substitutions, intersphinx, composables

### AI-Assisted

- **Style Guide Compliance Check** - Integrated style checking based on `.github/prompts/style-guide-check.prompt.md`
- **RST Conversion Assistant** - AI-powered conversion of plain text/markdown to properly formatted RST
- **Code Example Migration Helper** - Guided workflow for migrating code examples between languages/versions

### Automation & Integration

- **PR Template Selector** - Auto-suggest appropriate PR template based on files changed
- **GitHub Label Preview** - Show which labels will be applied before creating PR (per `labeler.yml`)
- **OpenAPI Spec Validation** - Run `oasprey` validation locally before committing
- **Atlas API Documentation Sync** - Trigger local runs of generators (`atlas-event-types-generator`, `atlas-rate-limits-generator`)

### Discoverability

- **Project Explorer** - Custom tree view showing all ~60 documentation projects with metadata
- **Code Example Explorer** - Unified view of all code examples per language, with test status
- **Shared Content Browser** - Browse and search shared content from `content/shared/` and `sharedinclude_root` URLs
- **Jupyter Notebook Sync Status** - Show sync status for notebooks in `ext-source/docs-notebooks/`

### High-Impact Quick Wins

Prioritized by frequency of use and pain severity:

1. **Source Constant/Substitution Auto-complete** - Writers constantly reference `snooty.toml`
2. **Symlink Status & Creator** - Manual symlink creation is error-prone
3. **Typo Detection** - Real-time checking prevents accumulation
4. **literalinclude Path Validation** - Broken paths are common errors
5. **Version Directory Context** - Prevents accidental edits to wrong versions
