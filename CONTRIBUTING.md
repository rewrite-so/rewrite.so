# Contributing to rewrite.so

First — thank you. This project is small, and even a typo fix or a clearer
error message helps. Below is what you need to know to make your PR land
quickly.

## Before you write code

- **Open an issue first for non-trivial work.** A 3-line bug fix or a doc
  tweak can go straight to PR. But for new features, refactors, or anything
  that touches more than one package, open an issue and we'll align on the
  approach before you spend time on it.
- **Read [CLAUDE.md](./CLAUDE.md).** It encodes non-obvious project
  conventions — privacy contracts, the "no ORM for business tables" rule,
  PII exclusion list, etc. Many PRs get sent back because the contributor
  missed something documented there.
- **Bug reports are welcome with a minimal reproduction.** A 3-line repro is
  worth a 30-line description.

## Local setup

```bash
git clone https://github.com/rewrite-so/rewrite.so.git
cd rewrite.so
pnpm install
cp .env.example .env.local
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.local.example apps/web/.env.local
```

See [README.md](./README.md#run-end-to-end-locally) for running the full
stack (API + Web + Extension) end-to-end.

## Quality bar before opening a PR

```bash
pnpm typecheck    # must pass
pnpm test         # must pass; add new tests for new behavior
pnpm lint         # must pass; auto-fix with `pnpm fix`
```

CI runs all three on every PR. PRs that don't pass these locally will fail
CI too — no exceptions.

### Tests

- Unit tests: vitest with happy-dom or workers pool depending on package.
- New behavior needs a new test. Bug fixes need a regression test.
- For UI changes that can't be unit-tested, include a manual test plan
  in the PR description.

### Code style

- TypeScript strict mode is on. No `any` without comment justifying.
- Biome handles formatting. Don't fight it — `pnpm fix` is your friend.
- Imports: side-effect-free; the auto-fixer organizes them.
- Comments: focus on **why**, not **what**. Self-explanatory code over
  comments. See [CLAUDE.md "Don't explain WHAT the code does" rule](./CLAUDE.md).

## Things we will not accept

- **PRs that weaken the privacy contract.** We never store input or output
  text. Adding any logging, analytics, or persistence path that includes
  user content is a hard no, even behind a feature flag.
- **PRs that simplify the PII exclusion list.** The hard-coded password /
  CC / CVV / OTP exclusions in `packages/core/src/editable/detect.ts` are
  load-bearing. Don't refactor them away.
- **PRs that add a 4th rewrite style or a custom-prompt input.** Those are
  product decisions, not implementation gaps. See [CLAUDE.md](./CLAUDE.md).
- **PRs that introduce an ORM for business tables.** We use hand-written
  SQL on D1 deliberately. The single exception is the 4 better-auth tables.
- **PRs that bypass rate limits or quotas.** If you have a legitimate need
  for higher limits, file an issue.

## Things we'd love help with

- 🐛 **Compatibility fixes for specific sites.** ProseMirror, Lexical, Slate,
  Quill, and other rich-text editors keep evolving. If a popular site's
  input box doesn't work, a small targeted fix is gold.
- 🌐 **Language pairs.** The 3 system prompts work across many languages,
  but corner cases for low-resource languages can be improved.
- 🧪 **Tests.** We have decent coverage of trigger logic and SSE. We have
  weaker coverage of contenteditable write paths across editor frameworks.
- 📚 **Docs.** Especially for self-hosters: deploying your own stack, BYOK
  setup, troubleshooting the most common issues.
- ♿ **Accessibility.** The overlay UI is keyboard-driven by design, but
  there's room for improvement in screen reader support.

## Commit messages

We don't enforce conventional commits, but we like them:

```
feat(api): add per-IP rate limit override for BYOK users
fix(extension): trigger fires once per double-tap on Linux
docs(readme): correct wrangler dev command for proxy users
```

Squash on merge is the default.

## DCO / CLA

We don't require a CLA. Apache 2.0's contribution clause already grants us
the rights we need, and adding a CLA would just slow first-time contributors
down.

By submitting a PR, you confirm that:
1. You have the right to license your contribution under Apache 2.0.
2. Your contribution is your original work, or you have permission from the
   original author.

## Security

Found a vulnerability? Please **do not** open a public issue. Email
**hello@rewrite.so** with subject `Security` and we'll respond within 5
business days. Coordinated disclosure timeline is negotiable but please give
us a reasonable window before public disclosure.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md).
By participating you agree to uphold it.

## Questions

Open an issue tagged `question`, or email **hello@rewrite.so**.
