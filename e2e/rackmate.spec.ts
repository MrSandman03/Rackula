/**
 * RackMate fork workflow coverage.
 *
 * This is the packaged RackMate browser gate for the fork. It keeps the
 * command-palette starter path and the physical-fit corrections in one
 * targeted Chromium run instead of relying on a manual command-palette pass.
 */
import { test, expect } from "./helpers/base-test";
import {
  createTestLayout,
  gotoWithRack,
  locators,
  PLATFORM_MODIFIER,
} from "./helpers";
import type { Page } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 375, height: 812 };

async function useMobileViewport(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.addInitScript(() => {
    sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
  });
}

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

    const ucgCarrier = page.locator(
      '[data-testid="rack-device"][data-device-uuid="dev-ucg-tray-u1"]',
    );
    await expect(
      ucgCarrier.getByTestId("rack-device-parent-label"),
    ).toHaveCount(0);

    const ucgChild = ucgCarrier.getByRole("button", {
      name: /UCG-Max, 0\.5U network, mounted in/,
    });
    await expect(ucgChild).toHaveAttribute("role", "button");
    await ucgChild.click();
    await expect(ucgChild).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("status", { name: "Rack fit warning" }),
    ).toContainText("USB-C power plug bend clearance");
  });

  test("command-palette device search exposes RackMate fit metadata", async ({
    page,
  }) => {
    await openRackMateStarter(page);
    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-add-device").click();
    await page.getByTestId("command-palette-input").fill("ucg max");

    const ucgRow = page.getByTestId(
      "command-palette-device-item-ubiquiti-unifi-cloud-gateway-max",
    );
    await expect(ucgRow).toBeVisible();
    await expect(ucgRow).toContainText("0.5U");
    await expect(ucgRow).toContainText("Check");
    await expect(
      ucgRow.getByLabel(/USB-C power plug bend clearance/),
    ).toBeVisible();
  });

  test("command palette cannot arm a 19-inch device in RackMate", async ({
    page,
  }) => {
    await openRackMateStarter(page);

    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-settings").click();
    const compatibleOnly = page.getByRole("switch", {
      name: "Compatible devices only",
    });
    if ((await compatibleOnly.getAttribute("data-state")) === "checked") {
      await compatibleOnly.click();
    }
    await page.keyboard.press("Escape");

    await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
    await page.getByTestId("command-palette-add-device").click();
    const input = page.getByTestId("command-palette-input");
    await input.fill("1u server");

    const serverRow = page.getByTestId("command-palette-device-item-1u-server");
    await expect(serverRow).toHaveAttribute("aria-disabled", "true");
    await expect(serverRow).toHaveAccessibleName(/Requires at least 19"/);

    await serverRow.evaluate((element) => (element as HTMLElement).click());
    await input.press("Enter");

    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Placing:" }),
    ).toHaveCount(0);
  });

  test("mobile editor preserves a generic 10-inch rack", async ({ page }) => {
    await useMobileViewport(page);
    const genericMiniRack = createTestLayout({
      name: "Generic Mini Rack",
      rackName: "Other 10-inch rack",
      rackHeight: 12,
      rackWidth: 10,
    });
    await gotoWithRack(page, genericMiniRack);

    await page.getByTestId("nav-tab-racks").click();
    await page.locator('[data-testid^="mobile-rack-row-"]').click();

    const editor = page.getByRole("dialog", { name: "Edit Rack" });
    const height = editor.getByLabel("Height", { exact: true });
    await expect(height).toHaveValue("12");
    await expect(height).toBeEnabled();
    await expect(editor).not.toContainText("RackMate T1 Plus is fixed");
  });

  test("mobile editor locks the explicit RackMate profile", async ({
    page,
  }) => {
    await useMobileViewport(page);
    await gotoWithRack(page);
    await openRackMateStarter(page);

    await page.getByTestId("nav-tab-racks").click();
    await page.locator('[data-testid^="mobile-rack-row-"]').click();

    const editor = page.getByRole("dialog", { name: "Edit Rack" });
    const height = editor.getByLabel("Height", { exact: true });
    await expect(height).toHaveValue("8");
    await expect(height).toBeDisabled();
    await expect(editor).toContainText(
      "RackMate T1 Plus is fixed at 8U / 260mm",
    );
  });

  test("mobile palette exposes one touch-readable fit marker", async ({
    page,
  }) => {
    await useMobileViewport(page);
    await gotoWithRack(page);
    await openRackMateStarter(page);

    await page.getByTestId("nav-tab-devices").click();
    const library = page.getByRole("dialog", { name: "Device Library" });
    await library.getByTestId("search-devices").fill("ucg max");
    const row = library
      .getByTestId("device-palette-item")
      .filter({ hasText: "UCG-Max" });
    await expect(row).toBeVisible();

    const marker = row.getByRole("button", { name: /^Fit details:/ });
    await expect(marker).toHaveCount(1);
    await expect(row.getByText("Bay", { exact: true })).toHaveCount(0);

    const pin = row.getByTestId("favourite-device-btn");
    await expect(pin).toBeVisible();
    const pinBounds = await pin.boundingBox();
    expect(pinBounds).not.toBeNull();
    expect(pinBounds!.width).toBeGreaterThanOrEqual(44);
    expect(pinBounds!.height).toBeGreaterThanOrEqual(44);

    await marker.click();
    const fitDetails = page.getByTestId("fit-detail-popover");
    await expect(fitDetails).toBeVisible();
    await expect(fitDetails).toContainText("USB-C power plug bend clearance");

    const bounds = await fitDetails.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      MOBILE_VIEWPORT.width,
    );
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      MOBILE_VIEWPORT.height,
    );

    const receivesPointerAtCentre = await fitDetails.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return hit === element || element.contains(hit);
    });
    expect(receivesPointerAtCentre).toBe(true);

    await page.keyboard.press("Escape");
    await expect(fitDetails).not.toBeVisible();
    await expect(library).toBeVisible();
    await expect(library.getByTestId("search-devices")).toHaveValue("ucg max");
  });

  test("virtualized palette rows reach the final row with fixed geometry", async ({
    page,
  }) => {
    await page.getByTestId("sidebar-tab-devices").click();
    const palette = page.locator(locators.device.palette);
    await palette.getByRole("button", { name: "A-Z" }).click();

    const virtualList = palette.locator(locators.device.virtualList);
    await expect(virtualList).toBeVisible();
    const rows = virtualList.locator(locators.device.paletteItem);
    await expect(rows.first()).toBeVisible();

    const initialBoxes = await rows.evaluateAll((elements) =>
      elements.slice(0, 4).map((element) => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, height: bounds.height };
      }),
    );
    expect(initialBoxes.length).toBeGreaterThan(1);
    for (const box of initialBoxes) {
      expect(box.height).toBe(48);
    }
    for (let index = 1; index < initialBoxes.length; index += 1) {
      expect(initialBoxes[index]!.top - initialBoxes[index - 1]!.top).toBe(48);
    }

    await virtualList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    await expect
      .poll(async () =>
        virtualList.evaluate((element) => {
          const listBounds = element.getBoundingClientRect();
          const renderedRows = element.querySelectorAll(
            '[data-testid="device-palette-item"]',
          );
          const lastRow = renderedRows.item(renderedRows.length - 1);
          if (!lastRow) return Number.POSITIVE_INFINITY;
          const lastBounds = lastRow.getBoundingClientRect();
          return Math.ceil(
            Math.max(
              0,
              element.scrollHeight - element.clientHeight - element.scrollTop,
              lastBounds.bottom - listBounds.bottom,
            ),
          );
        }),
      )
      .toBeLessThanOrEqual(1);
  });
});
