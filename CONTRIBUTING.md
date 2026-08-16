# Contributing to OryphemRouter

Thank you for your interest in contributing! This guide will help you make your first contribution. Every contribution matters, whether it is a bug fix, a new provider, documentation, or a feature.

## Code of Conduct

Be respectful and constructive. This project welcomes contributors of all levels. Harassment, discrimination, or toxic behavior is not tolerated.

## How to Contribute

### 1. Find something to work on

- Browse [open issues](https://github.com/virgiawanprima/OryphemRouter/issues)
- Look for issues labeled `good first issue` or `help wanted`
- Propose a new feature by opening an issue first

### 2. Set up your environment

**Prerequisites:**

- Node.js 20+ ([download](https://nodejs.org))
- Git
- npm (bundled with Node.js)

**Clone and install:**

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd OryphemRouter
npm install
```

**Run the dev server:**

```bash
cp .env.example .env
PORT=20129 NEXT_PUBLIC_BASE_URL=http://localhost:20129 npm run dev
```

Dashboard opens at `http://localhost:20129`.

### 3. Create a branch

Use a descriptive branch name with a conventional prefix:

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bugfix-name
# or
git checkout -b docs/your-doc-update
```

### 4. Make your changes

- Write clean, readable code
- Follow the existing style and conventions in the codebase
- Keep changes focused on a single concern
- Do not commit secrets, tokens, or `.env` files

### 5. Test your changes

Run the unit test suite:

```bash
npx vitest --config tests/vitest.config.js tests/unit/
```

Run the production build:

```bash
npm run build
```

Ensure your changes pass with **no errors** before submitting.

### 6. Commit with conventional commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Type | Purpose | Example |
|------|---------|---------|
| `feat:` | New feature | `feat: add cost-optimized routing strategy` |
| `fix:` | Bug fix | `fix: resolve circuit breaker reset on success` |
| `test:` | Add/update tests | `test: cover spending limits logic` |
| `docs:` | Documentation | `docs: add multi-OS install guide` |
| `refactor:` | Code refactor | `refactor: extract API key modal` |
| `chore:` | Maintenance | `chore: bump dependencies` |
| `ci:` | CI/CD changes | `ci: fix Docker workflow` |

Keep commits **atomic**: one logical change per commit.

```bash
git add <relevant-files-only>
git commit -m "feat: add your feature"
```

### 7. Push and open a Pull Request

```bash
git push -u origin your-branch-name
```

Then open a Pull Request against the `master` branch on [GitHub](https://github.com/virgiawanprima/OryphemRouter/pulls). In the PR description, explain:

- What you changed and why
- How to test it
- Any trade-offs or open questions

## Adding a New Provider

The easiest way to add a provider:

1. Copy `open-sse/providers/REGISTRY_TEMPLATE.js` to `open-sse/providers/registry/{id}.js`
2. Add your models to `open-sse/config/providerModels.js`
3. Generic OpenAI-compatible providers need no custom executor
4. Non-standard providers: subclass `BaseExecutor` and register in `executors/index.js`
5. Run `tests/translator/coverage-all-models.test.js` to verify your models pass

## Reporting a Bug

Open an [issue](https://github.com/virgiawanprima/OryphemRouter/issues) with:

- A clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or logs if helpful
- Your environment (OS, Node version, version of OryphemRouter)

## Feature Requests

Open an [issue](https://github.com/virgiawanprima/OryphemRouter/issues) with the `enhancement` label describing:

- The problem you are trying to solve
- A proposed solution
- Any alternatives you considered

## Documentation

Good documentation is as valuable as code. Improvements to `README.md`, `README.id.md`, `DOCKER.md`, or this file are always welcome.

## Style Guide

- **JavaScript/JSX**: use `npx eslint .` to check (requires the project's ESLint 9)
- **Markdown**: keep headings, lists, and tables well-formed
- **Bilingual**: when adding user-facing copy, update both English and Indonesian where relevant

## Recognition

Contributors are acknowledged in the project. Thank you for helping make OryphemRouter better!

---

Licensed under the [MIT License](./LICENSE).