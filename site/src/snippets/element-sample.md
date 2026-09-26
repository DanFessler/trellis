```html title="index.html"
<script type="module">
  import "@danfessler/trellis-element";
  import "@danfessler/trellis/style.css";
</script>

<trellis-workspace theme="dark" navigation="free" storage-key="my-ide" version="1" style="height: 100vh">
  <template data-view-type="files" data-title="Files" data-singleton data-allow-stage="false">
    <ul class="file-tree"></ul>
  </template>
  <template data-view-type="file" data-title="Editor" data-placement="stage">
    <textarea data-param="path"></textarea>
  </template>
  <template data-view-type="preview" data-title="Preview" data-iframe="http://localhost:3000"></template>

  <trellis-split weights="1 4">
    <trellis-view type="files"></trellis-view>
    <trellis-stage>
      <trellis-view type="file" params='{"path":"src/index.ts"}'></trellis-view>
    </trellis-stage>
  </trellis-split>
</trellis-workspace>
```
