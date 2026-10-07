const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function checkout(page, method = "Cash") {
  await page.getByRole("button", { name: "Add Coffee," }).click();
  await page.getByRole("button", { name: "Proceed to Order Summary" }).click();
  await page.getByRole("button", { name: "Continue to Payment" }).click();
  await page.getByRole("button", { name: method }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
});

test("cart totals follow quantity changes, removals and back navigation", async ({
  page,
}) => {
  const summary = page.getByRole("button", {
    name: "Proceed to Order Summary",
  });
  await expect(summary).toBeDisabled();
  await page.getByRole("button", { name: "Add Coffee," }).click();
  await page.getByRole("button", { name: "Increase Coffee quantity" }).click();
  await page.getByRole("button", { name: "Add Sandwich," }).click();
  await expect(page.locator("#item-count")).toHaveText("3 items");
  await expect(page.locator("#cart-total")).toHaveText("₱140.00");
  await page.getByRole("button", { name: "Decrease Coffee quantity" }).click();
  await summary.click();
  await expect(page.locator(".amount-box strong")).toHaveText("₱95.00");
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await page.getByRole("button", { name: "Remove Sandwich" }).click();
  await page.getByRole("button", { name: "Decrease Coffee quantity" }).click();
  await expect(summary).toBeDisabled();
  await expect(page.locator("#cart-total")).toHaveText("₱0.00");
});

test("cash validation and change remain correct through receipt and reset", async ({
  page,
}) => {
  await checkout(page);
  const pay = page.getByRole("button", { name: "Pay Now" });
  await pay.click();
  await expect(page.locator("#cash-error")).toContainText(
    "Enter the amount paid",
  );
  await page.getByLabel("Amount Paid").fill("44.99");
  await pay.click();
  await expect(page.locator("#cash-error")).toContainText(
    "Insufficient payment",
  );
  await page.getByLabel("Amount Paid").fill("45.001");
  await pay.click();
  await expect(page.getByLabel("Amount Paid")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Amount Paid").fill("50.10");
  await expect(page.locator("#cash-error")).toBeHidden();
  await expect(page.locator("#change-preview")).toHaveText("₱5.10");
  await pay.click();
  await expect(
    page.getByRole("heading", { name: "Payment successful!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View Receipt" }).click();
  await expect(page.locator(".receipt")).toContainText("Coffee");
  await expect(page.locator(".receipt")).toContainText("₱50.10");
  await expect(page.locator(".receipt")).toContainText("₱5.10");
  await expect(page.locator(".receipt .reference")).toHaveText(
    /^TXN-\d{4}-[A-Z0-9]+-[A-F0-9]{32}$/,
  );
  await page.getByRole("button", { name: "New Transaction" }).click();
  await expect(page.locator("#cart-total")).toHaveText("₱0.00");
  await expect(
    page.getByRole("button", { name: "Proceed to Order Summary" }),
  ).toBeDisabled();
});

test("QR confirmation records exact payment and zero change", async ({
  page,
}) => {
  await checkout(page, "QR Payment");
  await expect(
    page.getByAltText("QR code placeholder for simulated payment"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await page.getByRole("button", { name: "View Receipt" }).click();
  await expect(page.locator(".receipt")).toContainText("QR Payment");
  await expect(
    page.locator(".detail").filter({ hasText: "Change" }),
  ).toContainText("₱0.00");
});

test("card payment blocks duplicate processing and navigation", async ({
  page,
}) => {
  await checkout(page, "Credit/Debit Card");
  await page.getByRole("button", { name: "Process Payment" }).click();
  await expect(page.locator("#processing")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Process Payment" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Change Payment Method" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Payment successful!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View Receipt" }).click();
  await expect(page.locator(".receipt")).toContainText("Credit/Debit Card");
});

test("method changes preserve the cart and clear cash input", async ({
  page,
}) => {
  await checkout(page);
  await page.getByLabel("Amount Paid").fill("50");
  await page.getByRole("button", { name: "Change Payment Method" }).click();
  await expect(page.locator(".amount-box strong")).toHaveText("₱45.00");
  await page.getByRole("button", { name: "Cash Pay with cash" }).click();
  await expect(page.getByLabel("Amount Paid")).toHaveValue("");
});

test("local assets and every screen load without runtime errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (
      response.url().startsWith("http://127.0.0.1") &&
      response.status() >= 400
    )
      errors.push(response.url());
  });
  await page.goto("/");
  await checkout(page);
  await page.getByLabel("Amount Paid").fill("45");
  await page.getByRole("button", { name: "Pay Now" }).click();
  await page.getByRole("button", { name: "View Receipt" }).click();
  await page.getByRole("button", { name: "New Transaction" }).click();
  expect(errors).toEqual([]);
});

test("the kiosk still works when index.html is opened directly", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(__dirname, "..", "index.html")).href);
  await checkout(page, "QR Payment");
  const image = page.getByAltText("QR code placeholder for simulated payment");
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((element) => element.naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await page.getByRole("button", { name: "View Receipt" }).click();
  await expect(page.locator(".receipt")).toContainText("QR Payment");
  expect(errors).toEqual([]);
});
