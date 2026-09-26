import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Stage, View, ViewType, Workspace } from "../src";

describe("server rendering", () => {
  it("renders a host element without touching the DOM", () => {
    const html = renderToString(
      <Workspace className="ws">
        <ViewType id="a" title="A">
          <p>content</p>
        </ViewType>
        <Stage>
          <View type="a" />
        </Stage>
      </Workspace>,
    );
    expect(html).toContain('class="ws"');
    expect(html).toContain("data-trellis-host");
    expect(html).not.toContain("content");
  });
  it("imports the custom element module on the server", async () => {
    const mod = await import("../../element/src/index");
    expect(typeof mod.defineTrellisElement).toBe("function");
  });
});
