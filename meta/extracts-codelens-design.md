# Extracts CodeLens Support - Feature Design

## Overview

Include paths using `includes/extracts` refer to YAML snippets, not physical `.rst` files.
To resolve an include, search for the path's last element as a `ref` directive 
in `.yaml` files within the same version's `includes` directory.

**Example:**
```
.. include:: /includes/extracts/ssl-facts-x509-ca-file.rst
```
Refers to `ref: ssl-facts-x509-ca-file` in `source/includes/extracts-ssl-facts.yaml`.

## YAML Structure

Extracts YAML files use a multi-document format (separated by `---`):

```yaml
ref: ssl-facts-x509-ca-file
content: |
   To use X.509 authentication, ``--tlsCAFile`` or ``net.tls.CAFile``
   must be specified unless you are using ``--tlsCertificateSelector``
   or ``--net.tls.certificateSelector``.

---
ref: ssl-facts-see-more
content: |
   For more information about TLS/SSL and MongoDB, see
   :doc:`/tutorial/configure-ssl` and
   :doc:`/tutorial/configure-ssl-clients` .
```

Some extracts support inheritance:
```yaml
ref: keyfile-intro-replica-set
source:
   file: extracts-keyfile-info.yaml
   ref: _keyfile-intro
replacement:
   deployment: replica set
   components: :binary:`~bin.mongod` instances
```

## Implementation Plan

### Option A: Full Support (Recommended)

#### 1. Detect Extracts Paths
Modify `directive-parser.ts` to flag includes containing `/extracts/` in the path.

```typescript
// In DirectiveRef interface
isExtract?: boolean;

// In parseSimpleDirective()
ref.isExtract = targetPath.includes('/extracts/');
```

#### 2. Create Extract Resolver
New file: `packages/grove-core/src/rst/extract-resolver.ts`

Responsibilities:
- Extract ref name from path (e.g., `ssl-facts-x509-ca-file` from `/includes/extracts/ssl-facts-x509-ca-file.rst`)
- Find the containing version's `source/includes/` directory
- Search for `extracts*.yaml` files in that directory
- Parse YAML to find matching `ref:` entry
- Return YAML file path and line number of matching ref

```typescript
interface ExtractResolution {
  yamlFilePath: string;
  lineNumber: number;
  refName: string;
  content?: string;
}

async function resolveExtract(
  rstFilePath: string,
  extractPath: string
): Promise<ExtractResolution | undefined>
```

#### 3. Update CodeLens Provider
In `LiteralIncludeProviders.ts`, add special handling for extracts:

- Show different icon: "📋 extract" instead of "📄 view"
- Link to YAML file at correct line
- Display ref name in tooltip

#### 4. Performance: Caching
Cache parsed YAML files per directory to avoid re-parsing on every CodeLens refresh.

```typescript
const extractCache = new Map<string, Map<string, ExtractResolution>>();
```

### Option B: Ignore Extracts (Minimal)

Suppress "File not found" errors for extracts paths:

```typescript
// In LiteralIncludeProviders.ts provideCodeLenses()
if (ref.targetPath.includes('/extracts/')) {
  // Skip - extracts are YAML-based, not file-based
  continue;
}
```

## Effort Estimates

| Task | Option A | Option B |
|------|----------|----------|
| Path detection | 30 min | 15 min |
| YAML parsing & ref lookup | 2-3 hrs | - |
| Caching for performance | 1-2 hrs | - |
| CodeLens integration | 1 hr | - |
| Testing | 2 hrs | 15 min |
| **Total** | **6-8 hrs** | **30 min** |

## Files to Modify

### Option A
- `packages/grove-core/src/rst/directive-parser.ts` - Add `isExtract` flag
- `packages/grove-core/src/rst/extract-resolver.ts` - New file
- `packages/grove-core/src/rst/LiteralIncludeProviders.ts` - Handle extracts in CodeLens
- `packages/grove-core/src/rst/index.ts` - Export new resolver

### Option B
- `packages/grove-core/src/rst/LiteralIncludeProviders.ts` - Skip extracts paths

## Dependencies

- `js-yaml` package for YAML parsing (Option A only)

## Open Questions

1. Should we support the `source:` inheritance pattern for navigating to parent extracts?
2. Should we show the extract content in a hover tooltip?
3. Atlas docs have extracts that reference non-existent directories - are these generated at build time?

## Decision

- [ ] Option A: Full Support
- [ ] Option B: Ignore Extracts

## Related

- See `meta/features.md` for context on this feature request
- Giza extract implementation: `content/landing/docs-tools/giza/giza/content/extract/`

