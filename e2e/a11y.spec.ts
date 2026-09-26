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
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("open panel menu has no axe violations", async ({ page }) => {
  await page.goto("/?scenario=vanilla");
  await page.locator("[data-panel=docs] [data-trellis-part=panel-menu]").click();
  await expect(page.getByRole("menu")).toBeVisible();
  const results = await new AxeBuilder({ page }).include(".trellis-menu").analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
