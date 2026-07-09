/**
 * RackMate fork workflow coverage.
 *
 * This is the packaged RackMate browser gate for the fork. It keeps the
 * command-palette starter path and the physical-fit corrections in one
 * targeted Chromium run instead of relying on a manual command-palette pass.
 */
import { test, expect } from "./helpers/base-test";
import { gotoWithRack, PLATFORM_MODIFIER } from "./helpers";
import type { Page } from "@playwright/test";

async function openRackMateStarter(page: Page) {
  await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
  const input = page.getByTestId("command-palette-input");
  await input.fill("rackmate");
  await page
    .getByTestId("command-palette-item-new-layout-template-rackmate-t1-plus")
    .click();
}

test.describe("RackMate workflow", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("starter opens with UCG-Max and GS305 on full-width trays", async ({
    page,
  }) => {
    await openRackMateStarter(page);

    await expect(
      page
        .getByRole("tablist", { name: "Open layouts" })
        .getByRole("tab", { selected: true }),
    ).toContainText("RackMate T1 Plus 8U");

    await expect(
      page.locator(
        '[data-testid="rack-device"][data-device-id="deskpi-rackmate-1u-utility-tray"]',
      ),
    ).toHaveCount(2);
    await expect(
      page.locator(
        '[data-testid="rack-device"][data-device-id="deskpi-rackmate-1u-dual-utility-tray"]',
      ),
    ).toHaveCount(0);
    const childLabels = page.locator(
      '[data-testid="rack-canvas"] .child-device-label',
    );
    await expect(childLabels.filter({ hasText: "UCG-Max" })).toBeVisible();
    await expect(page.locator("#canvas-device-list")).toContainText("GS305");
  });

  test("command-palette device search exposes RackMate fit metadata", async ({
    page,
  }) => {
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-add-device").click();
    await page.getByTestId("command-palette-input").fill("ucg max");

    const ucgRow = page.getByTestId(
      "command-palette-device-item-ubiquiti-unifi-cloud-gateway-max",
    );
    await expect(ucgRow).toBeVisible();
    await expect(ucgRow).toContainText("0.5U");
    await expect(ucgRow).toContainText("Mount");
  });
});
