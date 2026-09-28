# Contributing

Thanks for your interest in Trellis. Bug reports with a minimal reproduction are the most valuable contribution.

## Setup

```sh
npm install
npx playwright install chromium firefox
npm run check   # typecheck, unit tests, build, browser tests
```

## Layout of the repository

- `packages/core` — the model (`src/model`: pure, DOM-free layout operations and hit testing) and the runtime
  (`src/runtime`: rendering, input, motion). Model changes need unit tests in `packages/core/test`.
- `packages/react`, `packages/element` — adapters. They only mount content into containers the core provides.
- `e2e` — Playwright tests against a fixture app covering all three entry points.
- `examples`, `site`, `docs` — example apps, the website and the documentation it renders.

## Principles

- Content is mounted once and never reparented. Anything that would remount a view is a bug.
- Frameworks never render per frame. Motion is imperative; adapters receive lifetime changes only.
- `change` events fire on commits, never mid-drag or mid-animation.
- Built-in styles use `:where()` so user CSS always wins.

## Documentation and releases

Docs live in `docs/` and change on `main` alongside the code. The website serves every released version of them:

- `/docs/<page>` is the newest release, read from its git tag.
- `/docs/<version>/<page>` is any release (the newest patch of each minor version), such as `/docs/0.2/navigation`.
- `/docs/next/<page>` is `main`, marked as unreleased. `npm run dev -w trellis-site` serves your working copy there.

The site deploys from the `release` branch, which always points at the newest release tag, so the live site never
describes unreleased behaviour.

To release:

1. Bump the three packages' versions (and their dependency on `@danfessler/trellis`), then `npm install`.
2. Add the version to `CHANGELOG.md`.
3. `npm run verify:pack`, commit as "Release x.y.z" and push. Wait for CI.
4. Publish: `npm publish -w @danfessler/trellis -w @danfessler/trellis-react -w @danfessler/trellis-element`.
5. Tag and push: `git tag -a vx.y.z -m x.y.z && git push origin vx.y.z`. The Release site workflow moves `release`
   to the tag, and Netlify deploys it.

## Licensing of contributions

Trellis is source-available under a non-commercial/commercial license. By submitting a contribution you agree that
it may be distributed under the project's licenses, including commercial licenses.
