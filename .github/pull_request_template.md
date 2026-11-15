## What and why

<!-- One concern per pull request. Title: type(scope): summary. -->

## Checklist

- [ ] `mise exec -- moon run :check` passes locally
- [ ] A Luau bump changes `http:luau-source` and `LUAU_VERSION` together, to the release the pinned luau-lsp uses
- [ ] A behaviour change has a fixture in `tests/fixtures/` (agreement with luau-lsp) or a case in `tests/queries.test.ts`
- [ ] `CHANGELOG.md` has a line under "Unreleased" if users will notice the change
