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

## Licensing of contributions

Trellis is source-available under a non-commercial/commercial license. By submitting a contribution you agree that
it may be distributed under the project's licenses, including commercial licenses.
