# @danfessler/trellis-element

Trellis as a `<trellis-workspace>` custom element, for any framework or none.

Install it with the core package:

```sh
npm install @danfessler/trellis-element @danfessler/trellis
```

Register the element, then declare the workspace in HTML:

```html
<script type="module">
  import "@danfessler/trellis-element";
</script>
<link rel="stylesheet" href="node_modules/@danfessler/trellis-element/dist/style.css" />

<trellis-workspace theme="dark" style="height: 100vh">
  <template data-view-type="notes" data-title="Notes"><textarea></textarea></template>
  <trellis-split weights="1 3">
    <trellis-view type="notes"></trellis-view>
    <trellis-stage></trellis-stage>
  </trellis-split>
</trellis-workspace>
```

Without a bundler, import `@danfessler/trellis-element/standalone` (a single self-contained module).

Documentation, guides and examples are in the [Trellis repository](https://github.com/DanFessler/trellis).

## License

Free for non-commercial use. Commercial use requires an active GitHub Sponsorship at the applicable tier or an enterprise license. See [LICENSE.md](LICENSE.md).
