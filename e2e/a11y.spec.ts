import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scenario of ["vanilla", "react", "element"]) {
  test(`${scenario}: workspace chrome has no axe violations`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}`);
    await expect(page.locator("[data-trellis-part=tab]").first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include(".trellis")
      // Fixture content (bare inputs, test buttons) is not part of the library under test.
      .exclude("[data-trellis-part=content]")
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}

for (const theme of ["light", "medium", "dark", "darker"]) {
  test(`open panel menu has no axe violations (${theme})`, async ({ page }) => {
    // Shortcuts render as symbols on macOS, which axe skips; spell them out as on other platforms.
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "platform", { get: () => "Linux x86_64" }),
    );
    await page.goto("/?scenario=vanilla");
    await page.evaluate((theme) => (window as any).ws.update({ theme }), theme);
    await page.locator("[data-panel=docs] [data-trellis-part=panel-menu]").click();
    await expect(page.getByRole("menu")).toBeVisible();
    // The menu fades in; measure contrast once it's fully opaque.
    await page
      .getByRole("menu")
      .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const results = await new AxeBuilder({ page }).include(".trellis-menu").analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}
