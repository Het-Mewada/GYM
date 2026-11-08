import { test, expect } from '@playwright/test';

test.describe('Payments & Invoicing Ledger Journey (Slice 3)', () => {
  test('records a payment, generates monotonic tax receipt, displays GST breakdown, and issues partial refund', async ({ page }) => {
    // 1. Visit Members page first to ensure a member exists
    await page.goto('/members');
    await expect(page.locator('h1')).toContainText('Members Directory');

    // Add a test member for payment testing
    const addMemberBtn = page.locator('[data-testid="add-member-button"]');
    await addMemberBtn.click();

    const memberModal = page.locator('[data-testid="add-member-modal"]');
    await expect(memberModal).toBeVisible();

    const uniquePhone = `+91988${Math.floor(1000000 + Math.random() * 9000000)}`;
    await page.locator('[data-testid="first-name-input"]').fill('Kavita');
    await page.locator('[data-testid="last-name-input"]').fill('Patel');
    await page.locator('[data-testid="phone-input"]').fill(uniquePhone);
    await page.locator('[data-testid="email-input"]').fill(`kavita.${Date.now()}@example.com`);
    await page.locator('[data-testid="gender-select"]').selectOption('female');

    await page.locator('[data-testid="save-member-button"]').click();
    await expect(memberModal).not.toBeVisible();
    await expect(page.locator('[data-testid="members-table"]')).toContainText('Kavita Patel');

    // 2. Navigate to Payments Ledger page
    await page.goto('/payments');
    await expect(page.locator('h1')).toContainText('Payments & Invoicing');

    // 3. Open "Collect Payment" modal
    const collectBtn = page.locator('[data-testid="collect-payment-button"]');
    await expect(collectBtn).toBeVisible();
    await collectBtn.click();

    const collectModal = page.locator('[data-testid="collect-payment-modal"]');
    await expect(collectModal).toBeVisible();

    // 4. Fill payment form
    await page.locator('[data-testid="payment-amount-input"]').fill('5000');
    await page.locator('[data-testid="payment-method-select"]').selectOption('upi');
    await page.locator('[data-testid="payment-ref-input"]').fill('UPI/TEST/882910');
    await page.locator('[data-testid="payment-notes-input"]').fill('Playwright test payment');

    // 5. Submit payment
    await page.locator('[data-testid="save-payment-button"]').click();

    // 6. Verify Tax Receipt Modal is rendered
    const receiptModal = page.locator('[data-testid="receipt-modal"]');
    await expect(receiptModal).toBeVisible();
    await expect(receiptModal).toContainText('TAX RECEIPT');
    await expect(receiptModal).toContainText('REC-');
    await expect(receiptModal).toContainText('5,000.00');
    await expect(receiptModal).toContainText('Inclusive GST (18%)');

    // Close receipt modal
    await receiptModal.locator('button:has-text("Close")').click();
    await expect(receiptModal).not.toBeVisible();

    // 7. Verify Payments Table contains the transaction
    const paymentsTable = page.locator('[data-testid="payments-table"]');
    await expect(paymentsTable).toBeVisible();
    await expect(paymentsTable).toContainText('+₹5,000.00');
    await expect(paymentsTable).toContainText('UPI');

    // 8. Open Refund modal for the recorded payment
    const refundBtn = page.locator('[data-testid="refund-payment-button"]').first();
    await expect(refundBtn).toBeVisible();
    await refundBtn.click();

    const refundModal = page.locator('[data-testid="refund-modal"]');
    await expect(refundModal).toBeVisible();

    // 9. Enter partial refund of ₹2,000
    await page.locator('[data-testid="refund-amount-input"]').fill('2000');
    await page.locator('[data-testid="refund-notes-input"]').fill('Partial refund for test');

    // 10. Submit refund
    await page.locator('[data-testid="submit-refund-button"]').click();

    // 11. Verify Refund Voucher receipt modal appears
    await expect(receiptModal).toBeVisible();
    await expect(receiptModal).toContainText('REFUND VOUCHER');
    await expect(receiptModal).toContainText('-REF');
    await expect(receiptModal).toContainText('2,000.00');

    // Close voucher
    await receiptModal.locator('button:has-text("Close")').click();
    await expect(receiptModal).not.toBeVisible();

    // 12. Verify Payments Table reflects the refund
    await expect(paymentsTable).toContainText('-₹2,000.00');
    await expect(paymentsTable).toContainText('REFUND');
  });
});
