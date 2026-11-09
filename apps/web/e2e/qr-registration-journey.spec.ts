import { test, expect } from '@playwright/test';

test.describe('Tenant QR Self-Registration & Owner Approval Journey', () => {
  test('displays QR code modal, prospective member submits self-registration, and owner approves enrollment', async ({ page }) => {
    // 1. Visit Members Directory
    await page.goto('/members');
    await expect(page).toHaveURL(/\/members/);

    // 2. Click "Registration QR" button
    const qrBtn = page.locator('[data-testid="qr-code-button"]');
    await expect(qrBtn).toBeVisible();
    await qrBtn.click();

    // 3. Verify Tenant QR Modal opens with QR code and link
    const qrModal = page.locator('text=Front Desk QR Registration');
    await expect(qrModal).toBeVisible();

    const copyBtn = page.locator('button:has-text("Copy")');
    await expect(copyBtn).toBeVisible();

    // Close QR modal
    const closeBtn = page.locator('button[aria-label="Close modal"]');
    await closeBtn.click();
    await expect(qrModal).not.toBeVisible();

    // 4. Visit the public join page for a tenant
    const uniqueDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const testPhone = `+91${uniqueDigits}`;

    // Load public registration form
    await page.goto('/join/sfw-the-gym');

    // Wait for the form to load
    await expect(page.locator('text=Walk-In Self-Registration')).toBeVisible({ timeout: 10000 });

    // 5. Fill out the self-registration form
    await page.locator('input[placeholder="e.g. Het"]').fill('Aarav');
    await page.locator('input[placeholder="e.g. Mewada"]').fill('Patel');

    // Phone input
    const phoneInput = page.locator('input[placeholder="9876543210"]').first();
    await phoneInput.fill(uniqueDigits);

    // Email
    await page.locator('input[type="email"]').fill(`aarav.${uniqueDigits.slice(-4)}@example.com`);

    // Submit form
    const submitBtn = page.locator('button[type="submit"]:has-text("Submit Registration Request")');
    await submitBtn.click();

    // 6. Verify success confirmation screen appears
    await expect(page.locator('text=Request Received')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Pending Review')).toBeVisible();
    await expect(page.locator(`text=${uniqueDigits}`)).toBeVisible();

    // 7. Owner returns to /members directory to review pending requests
    await page.goto('/members');

    // Switch to Pending Requests tab
    const pendingTab = page.locator('[data-testid="tab-pending-requests"]');
    await expect(pendingTab).toBeVisible();
    await pendingTab.click();

    // 8. Verify the applicant is visible in the pending requests table
    const applicantRow = page.locator(`tr:has-text("Aarav Patel")`);
    await expect(applicantRow).toBeVisible({ timeout: 10000 });
    await expect(applicantRow).toContainText(uniqueDigits);

    // 9. Approve the request
    const approveBtn = applicantRow.locator('button:has-text("Approve")');
    await approveBtn.click();

    // Verify row disappears from pending list
    await expect(applicantRow).not.toBeVisible({ timeout: 10000 });

    // 10. Switch to Directory tab and verify newly approved member appears
    const dirTab = page.locator('[data-testid="tab-directory"]');
    await dirTab.click();

    const membersTable = page.locator('table');
    await expect(membersTable).toContainText('Aarav Patel');
    await expect(membersTable).toContainText(testPhone);
    await expect(membersTable).toContainText('MEM-');
  });
});
