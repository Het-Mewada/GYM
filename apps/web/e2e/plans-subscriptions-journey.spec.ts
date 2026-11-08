import { test, expect } from '@playwright/test';

test.describe('Membership Plans & Subscriptions Lifecycle Journey (Slice 2)', () => {
  test('creates a membership plan and assigns active subscription to a member', async ({ page }) => {
    // 1. Visit Membership Plans page
    await page.goto('/plans');
    await expect(page.locator('h1')).toContainText('Membership Plans');

    // 2. Click "Add Plan" button
    const addPlanBtn = page.locator('[data-testid="add-plan-button"]');
    await expect(addPlanBtn).toBeVisible();
    await addPlanBtn.click();

    // 3. Verify modal opens and fill plan details
    const planModal = page.locator('[data-testid="add-plan-modal"]');
    await expect(planModal).toBeVisible();

    await page.locator('[data-testid="plan-name-input"]').fill('Annual Gold Pass');
    await page.locator('[data-testid="plan-duration-input"]').fill('365');
    await page.locator('[data-testid="plan-price-input"]').fill('12000');

    // 4. Submit plan creation form
    const savePlanBtn = page.locator('[data-testid="save-plan-button"]');
    await savePlanBtn.click();

    // 5. Verify modal closes and new plan card is rendered
    await expect(planModal).not.toBeVisible();
    await expect(page.locator('main')).toContainText('Annual Gold Pass');
    await expect(page.locator('main')).toContainText('₹12,000');
    await expect(page.locator('main')).toContainText('365 Days');

    // 6. Navigate to Members page
    await page.goto('/members');
    await expect(page.locator('h1')).toContainText('Members Directory');

    // 7. Add a new member to assign the subscription to
    const addMemberBtn = page.locator('[data-testid="add-member-button"]');
    await addMemberBtn.click();

    const memberModal = page.locator('[data-testid="add-member-modal"]');
    await expect(memberModal).toBeVisible();

    await page.locator('[data-testid="first-name-input"]').fill('Rohan');
    await page.locator('[data-testid="last-name-input"]').fill('Verma');
    await page.locator('[data-testid="phone-input"]').fill('+919876543299');
    await page.locator('[data-testid="email-input"]').fill('rohan.verma@example.com');
    await page.locator('[data-testid="gender-select"]').selectOption('male');

    await page.locator('[data-testid="save-member-button"]').click();
    await expect(memberModal).not.toBeVisible();
    await expect(page.locator('[data-testid="members-table"]')).toContainText('Rohan Verma');

    // 8. Open Subscriptions management modal for Rohan
    const manageSubsBtn = page.locator('[data-testid^="manage-subscriptions-"]').first();
    await expect(manageSubsBtn).toBeVisible();
    await manageSubsBtn.click();

    // 9. Verify Subscriptions modal opens
    const subsModal = page.locator('[data-testid="subscriptions-modal"]');
    await expect(subsModal).toBeVisible();
    await expect(subsModal).toContainText('Subscriptions');

    // 10. Select the plan in dropdown
    const planSelect = page.locator('[data-testid="select-subscription-plan"]');
    await expect(planSelect).toBeVisible();
    
    // Choose the first available option that has a non-empty value
    const options = await planSelect.locator('option').all();
    if (options.length > 1) {
      await planSelect.selectOption({ index: 1 });
    }

    // 11. Submit new subscription
    const submitSubBtn = page.locator('[data-testid="submit-subscription-button"]');
    await submitSubBtn.click();

    // 12. Verify success or active subscription entry appears
    await expect(subsModal.locator('[data-testid^="subscription-item-"]').first()).toBeVisible();

    // 13. Close modal
    const closeBtn = page.locator('[data-testid="close-subscriptions-modal"]');
    await closeBtn.click();
    await expect(subsModal).not.toBeVisible();
  });
});
