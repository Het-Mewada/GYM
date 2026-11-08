import { test, expect } from '@playwright/test';

test.describe('Members Directory Journey (Slice 1)', () => {
  test('navigates to members directory, searches members, creates single-name member, and filters by status', async ({ page }) => {
    // Track any unauthorized network requests
    const unauthorizedRequests: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 401) {
        unauthorizedRequests.push(response.url());
      }
    });

    // 1. Visit Home Page and navigate to Members Directory
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Gym Management SaaS');

    const directoryLink = page.locator('[data-testid="members-directory-link"]');
    await expect(directoryLink).toBeVisible();
    await directoryLink.click();

    // 2. Verify Members Page loaded in preview mode without unauthenticated 401 errors
    await expect(page).toHaveURL(/\/members/);
    await expect(page.locator('h1')).toContainText('Members Directory');
    await expect(page.locator('[data-testid="preview-mode-banner"]')).toBeVisible();
    expect(unauthorizedRequests).toHaveLength(0);

    const table = page.locator('[data-testid="members-table"]');
    await expect(table).toBeVisible();

    // Verify initial seeded entries exist
    await expect(table).toContainText('Suresh');
    await expect(table).toContainText('Priya Sharma');
    await expect(table).toContainText('Ramesh Patel');

    // 3. Search for a member by name
    const searchInput = page.locator('[data-testid="member-search-input"]');
    await searchInput.fill('Priya');

    // Verify table filtered
    await expect(table).toContainText('Priya Sharma');
    await expect(table).not.toContainText('Ramesh Patel');

    // 4. Clear search query
    const clearButton = page.locator('[data-testid="clear-search-button"]');
    await clearButton.click();
    await expect(table).toContainText('Ramesh Patel');

    // 5. Search for non-existent member and verify empty state
    await searchInput.fill('NonExistentGymMember999');
    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No members found');

    await searchInput.fill('');

    // 6. Add new single-name member (supports single name without required last name)
    const addMemberBtn = page.locator('[data-testid="add-member-button"]');
    await addMemberBtn.click();

    const modal = page.locator('[data-testid="add-member-modal"]');
    await expect(modal).toBeVisible();

    // Fill form with single name "Vikram"
    await page.locator('[data-testid="first-name-input"]').fill('Vikram');
    // Note: Last name intentionally left empty to verify single-name support
    await page.locator('[data-testid="phone-input"]').fill('+919988776655');
    await page.locator('[data-testid="email-input"]').fill('vikram@example.com');
    await page.locator('[data-testid="gender-select"]').selectOption('male');

    // Submit form
    const saveBtn = page.locator('[data-testid="save-member-button"]');
    await saveBtn.click();

    // Modal closes and new member appears in table
    await expect(modal).not.toBeVisible();
    await expect(table).toContainText('Vikram');
    await expect(table).toContainText('+919988776655');

    // 7. Search for newly added single-name member
    await searchInput.fill('Vikram');
    await expect(table).toContainText('Vikram');
    await expect(table).not.toContainText('Priya Sharma');

    // 8. Filter by status
    await searchInput.fill('');
    const statusFilter = page.locator('[data-testid="status-filter"]');
    await statusFilter.selectOption('inactive');

    // Only inactive members should be shown
    await expect(table).toContainText('Ramesh Patel');
    await expect(table).not.toContainText('Suresh');

    // Confirm that throughout the entire preview workflow zero 401 errors were triggered
    expect(unauthorizedRequests).toHaveLength(0);
  });
});
