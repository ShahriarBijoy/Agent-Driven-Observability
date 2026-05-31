# @obs/tsconfig

Shared TypeScript compiler presets for the AI Observability Lab monorepo.

## Presets

### base.json

Strict defaults for all packages and apps. Key settings:

- `target: ES2023` with ESNext module output
- `moduleResolution: Bundler` — suited for Bun and modern bundlers
- `verbatimModuleSyntax: true` — enforces explicit `import type` usage
- `strict: true` plus `noUncheckedIndexedAccess` and `noImplicitOverride`
- `isolatedModules: true` and `moduleDetection: force` for safe single-file transforms
- `noEmit: true` — type-checking only; bundling is handled externally

### library.json

Extends `base.json`. Adds `declaration: true` so shared packages emit `.d.ts`
files for consumers to pick up type information.

### service.json

Extends `base.json`. Adds `types: ["node"]` so runnable services (apps) have
access to Node.js global types.

## Usage

In a shared package (`packages/<name>/tsconfig.json`):

```json
{
  "extends": "@obs/tsconfig/library.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

In a runnable app (`apps/<name>/tsconfig.json`):

```json
{
  "extends": "@obs/tsconfig/service.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```
