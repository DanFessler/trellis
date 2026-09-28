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

- `/docs/<page>` is the newest release.
- `/docs/<version>/<page>` is any release, such as `/docs/0.2/navigation`.
- `/docs/next/<page>` is `main`, marked as unreleased. `npm run dev -w trellis-site` serves your working copy there.

### Where old docs come from

Nothing stores old docs separately: release tags do. Each site build lists the `v*.*.*` tags, takes the newest patch of
each minor version, and reads that tag's `docs/*.md` from git into `site/.docs-cache` (ignored, rebuilt every time).
`site/plugins/versions.ts` does this.

- Never delete or move a release tag. Its version's docs would change or disappear from the site.
- Patch releases share their minor version's docs: once `v0.3.1` exists, `/docs/0.3/` shows its docs.
- A tag's contents never change, so fixing an old version's docs takes a patch release of that version, such as
  `v0.2.1`.

### Branches and deploys

| Ref           | What it is                            | Moves when                    |
| ------------- | ------------------------------------- | ----------------------------- |
| `main`        | Where all work happens, docs included | Every commit                  |
| `vX.Y.Z` tags | A fixed snapshot of each release      | Never                         |
| `release`     | Points at the newest release tag      | A newer release tag is pushed |

Netlify's production branch is `release`, so the home page, demos and default docs always match what's on npm.

- `.github/workflows/release-site.yml` moves `release` when a tag is pushed. A tag that isn't the newest, such as a
  patch to an older minor, leaves it alone, so the site never goes backwards. It can also be run by hand from the
  Actions tab.
- `.github/workflows/docs-next.yml` keeps `/docs/next` current: when `docs/` changes on `main`, it calls a Netlify
  build hook for the `release` branch. The build rebuilds the same release and reads `main`'s docs for
  `/docs/next` only. The hook's URL is the `NETLIFY_BUILD_HOOK` repository secret (Settings → Secrets and variables →
  Actions). Without it, `/docs/next` updates with each release.

### Releasing

1. Bump the three packages' versions (and their dependency on `@danfessler/trellis`), then `npm install`.
2. Add the version to `CHANGELOG.md`.
3. `npm run verify:pack`, commit as "Release x.y.z" and push. Wait for CI.
4. Publish: `npm publish -w @danfessler/trellis -w @danfessler/trellis-react -w @danfessler/trellis-element`.
5. Tag the published commit and push the tag: `git tag -a vx.y.z -m x.y.z && git push origin vx.y.z`. The Release site
   workflow moves `release` to it, and Netlify deploys it. The new version becomes the default docs, and the previous
   one moves to `/docs/<its version>/`.

## Licensing of contributions

Trellis is source-available under a non-commercial/commercial license. By submitting a contribution you agree that
it may be distributed under the project's licenses, including commercial licenses.
