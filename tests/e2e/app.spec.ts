import { test, expect } from "@playwright/test";
test("desktop: projects, CRUD, filtering, Kanban, restart persistence, disabled notifications", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /בוקר טוב|צהריים טובים|ערב טוב/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "הוספת פרויקט", exact: true }).click();
  await page.getByLabel("שם הפרויקט").fill("פרויקט בדיקה");
  await page.getByRole("button", { name: "שמירת פרויקט" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "משימה חדשה", exact: true }).click();
  await page.getByLabel("כותרת המשימה").fill("לבדוק שהכול עובד");
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "פרויקט", exact: true })
    .selectOption({ label: "פרויקט בדיקה" });
  await page.getByLabel("תת משימה חדשה").fill("צעד ראשון");
  await page
    .getByRole("button", { name: "הוספת תת משימה", exact: true })
    .click();
  await page.getByRole("button", { name: "שמירת משימה" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /המשימות שלי/ })
    .click();
  await expect(
    page.getByRole("button", { name: "לבדוק שהכול עובד", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "לבדוק שהכול עובד", exact: true })
    .click();
  await page.getByLabel("כותרת המשימה").fill("משימה מעודכנת");
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "תיאור", exact: true })
    .fill("נשמר גם אחרי רענון");
  await page.getByRole("button", { name: "שמירת משימה" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("combobox", { name: "סטטוס משימה מעודכנת", exact: true })
    .selectOption("progress");
  await expect(
    page.getByRole("combobox", { name: "סטטוס משימה מעודכנת", exact: true }),
  ).toHaveValue("progress");
  await page.getByLabel("חיפוש משימות").fill("לא קיימת");
  await expect(page.getByText("לא נמצאו משימות מתאימות")).toBeVisible();
  await page.getByLabel("חיפוש משימות").fill("");
  await page.getByRole("button", { name: "תצוגת Kanban" }).click();
  await page
    .locator(".kanban-card")
    .filter({ hasText: "משימה מעודכנת" })
    .dragTo(
      page
        .locator(".kanban-column")
        .filter({ has: page.getByRole("heading", { name: /בהמתנה/ }) }),
    );
  await expect(
    page
      .locator(".kanban-column")
      .filter({ has: page.getByRole("heading", { name: /בהמתנה/ }) })
      .getByRole("button", { name: "משימה מעודכנת" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "סטטוס משימה מעודכנת" })
    .selectOption("done");
  await expect(
    page
      .locator(".kanban-column")
      .filter({ has: page.getByRole("heading", { name: /הושלם/ }) })
      .getByRole("button", { name: "משימה מעודכנת" }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /המשימות שלי/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "סטטוס משימה מעודכנת" }),
  ).toHaveValue("done");
  await page.getByRole("button", { name: "עריכת משימה מעודכנת" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "תיאור", exact: true }),
  ).toHaveValue("נשמר גם אחרי רענון");
  await page.getByRole("button", { name: "סגירה", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "הגדרות", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "הפעלת תזכורות" }),
  ).toBeDisabled();
  await expect(page.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("button", { name: "מצב כהה" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /המשימות שלי/ })
    .click();
  await page.getByRole("button", { name: "עריכת משימה מעודכנת" }).click();
  await page.getByRole("button", { name: "מחיקה", exact: true }).click();
  await page.getByRole("button", { name: "מחיקת משימה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "משימה מעודכנת", exact: true }),
  ).toHaveCount(0);
});
test("mobile: title-only quick entry persists without notification permission", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Reflect.set(window, "notificationRequests", 0);
    Notification.requestPermission = async () => {
      Reflect.set(
        window,
        "notificationRequests",
        Reflect.get(window, "notificationRequests") + 1,
      );
      return "denied";
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "משימה חדשה", exact: true }).click();
  await page.getByLabel("כותרת המשימה").fill("משימה מהטלפון");
  await page.getByRole("button", { name: "שמירת משימה" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "המשימות שלי" })
    .click();
  await expect(
    page.getByRole("button", { name: "משימה מהטלפון", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const response = await page.request.post("/api/reminders/subscribe", {
    data: {},
  });
  expect(response.status()).toBe(503);
  expect(
    await page.evaluate(() => Reflect.get(window, "notificationRequests")),
  ).toBe(0);
  await page.screenshot({ path: "/tmp/maslul-mobile.png", fullPage: true });
});
test("dashboard screenshot", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /בוקר טוב|צהריים טובים|ערב טוב/ }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/maslul-desktop.png", fullPage: true });
});
