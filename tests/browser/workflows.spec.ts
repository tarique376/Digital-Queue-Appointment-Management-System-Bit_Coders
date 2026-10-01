import { test, expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";
async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("BrowserTestPassword123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
}
test("customer can book, reschedule and cancel a real persisted appointment", async ({
  page,
}) => {
  await login(page, "customer@queueflow.local");
  await page
    .getByRole("button", { name: "Book an appointment", exact: true })
    .click();
  await page
    .getByLabel("Department", { exact: true })
    .selectOption({ label: "Student Affairs" });
  await page
    .getByLabel("Service", { exact: true })
    .selectOption({ label: "Document verification · 10 min" });
  await page
    .getByLabel("Appointment date")
    .fill(
      DateTime.now().setZone("Asia/Karachi").plus({ days: 1 }).toISODate()!,
    );
  await page.locator(".slot:not([disabled])").first().click();
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your appointment is confirmed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  await page
    .getByLabel("Appointment date")
    .fill(
      DateTime.now().setZone("Asia/Karachi").plus({ days: 2 }).toISODate()!,
    );
  await page.locator(".slot:not([disabled])").first().click();
  await page.getByRole("button", { name: "Confirm new time" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel appointment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("CANCELLED");
});
test("walk-in token, staff calling, public display and completion work across accounts", async ({
  page,
  browser,
}) => {
  await login(page, "customer@queueflow.local");
  await page.getByRole("button", { name: "Live queue", exact: true }).click();
  await page
    .locator(".catalog-card")
    .filter({ hasText: "Document verification" })
    .getByRole("button", { name: "Get a token" })
    .click();
  await expect(page.locator(".queue-card h2")).toBeVisible();
  const token = await page.locator(".queue-card h2").innerText();
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await login(staffPage, "staff@queueflow.local");
  await staffPage
    .getByRole("button", { name: "Live queue", exact: true })
    .click();
  await staffPage
    .getByRole("button", { name: "Call next", exact: true })
    .click();
  await expect(staffPage.locator("tbody")).toContainText("CALLED");
  await expect(page.locator(".queue-card")).toContainText("Counter 01");
  const display = await staffContext.newPage();
  await display.goto("/display");
  await expect(display.locator(".display-call")).toContainText(token);
  await staffPage.getByRole("button", { name: "Start", exact: true }).click();
  await staffPage
    .getByRole("button", { name: "Complete", exact: true })
    .click();
  await expect(staffPage.locator("tbody tr")).toHaveCount(0);
  await expect(page.locator(".queue-card")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("COMPLETED");
  await staffContext.close();
});
test("administrator configuration and reports have functional forms", async ({
  page,
}) => {
  await login(page, "admin@queueflow.local");
  await page.getByRole("button", { name: "Management", exact: true }).click();
  await page.getByRole("button", { name: "Add service", exact: true }).click();
  await page
    .getByLabel("Department", { exact: true })
    .selectOption({ label: "Student Affairs" });
  await page.getByLabel("Service name").fill("Certificate support");
  await page.getByLabel("Token prefix").fill("CS");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Certificate support");
  await page
    .getByRole("button", { name: "Reports & insights", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visitor arrivals by hour" }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/screenshots/admin-reports.png",
    fullPage: true,
  });
});
test("customer layout fits mobile and private API refuses missing sessions and wrong origins", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "customer@queueflow.local");
  await page.screenshot({
    path: "output/screenshots/customer-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Live queue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Live queue", exact: true }),
  ).toBeVisible();
  const unauthorized = await request.get("/api/state");
  expect(unauthorized.status()).toBe(401);
  const csrf = await request.post("/api/commands", {
    headers: { Origin: "https://untrusted.example" },
    data: { action: "join", input: {}, key: crypto.randomUUID() },
  });
  expect(csrf.status()).toBe(403);
});
test("desktop overview is rendered without client errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "customer@queueflow.local");
  await page.screenshot({
    path: "output/screenshots/customer-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Your inbox" })).toBeVisible();
});
test("scheduled arrival checks in exactly once and links its queue token", async ({
  page,
}) => {
  await login(page, "customer@queueflow.local");
  await page
    .getByRole("button", { name: "Book an appointment", exact: true })
    .click();
  await page
    .getByLabel("Department", { exact: true })
    .selectOption({ label: "Student Affairs" });
  await page
    .getByLabel("Service", { exact: true })
    .selectOption({ label: "Document verification · 10 min" });
  await page.locator(".slot:not([disabled])").first().click();
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your appointment is confirmed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("WAITING");
  await page.getByRole("button", { name: "Live queue", exact: true }).click();
  await expect(page.locator(".queue-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Leave this queue" }).click();
  await expect(page.locator(".queue-card")).toHaveCount(0);
});
test("manager can edit rules, create staff, assign a counter and close a date", async ({
  page,
}) => {
  await login(page, "manager@queueflow.local");
  await page.getByRole("button", { name: "Management", exact: true }).click();
  await page.getByRole("button", { name: "Departments", exact: true }).click();
  await page.getByRole("button", { name: "Edit schedule & rules" }).click();
  await page
    .getByLabel("Walk-in fairness threshold (minutes)", { exact: true })
    .fill("25");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Users & staff", exact: true })
    .click();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Full name").fill("Queue Assistant");
  await page.getByLabel("Email address").fill("assistant@test.local");
  await page
    .getByLabel("Password (at least 12 characters)")
    .fill("AssistantPassword123!");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Queue Assistant");
  await page
    .getByRole("button", { name: "Counter assignments", exact: true })
    .click();
  await page.getByRole("button", { name: "Add counter" }).click();
  await page.getByLabel("Counter name").fill("Counter 04");
  await page
    .getByLabel("Assigned staff", { exact: true })
    .selectOption({ label: "Queue Assistant" });
  await page.getByLabel("Document verification", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Counter 04");
  await page
    .getByRole("button", { name: "Date closures", exact: true })
    .click();
  await page.getByRole("button", { name: "Add closure" }).click();
  await page
    .getByLabel("Closure date")
    .fill(
      DateTime.now().setZone("Asia/Karachi").plus({ days: 7 }).toISODate()!,
    );
  await page.getByLabel("Reason").fill("Annual maintenance");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Annual maintenance");
});
