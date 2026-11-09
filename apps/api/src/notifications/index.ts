import crypto from 'node:crypto';
import type { NotificationTemplate } from '@gym/shared';

export interface SendEmailPayload {
  to: string;
  from?: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  id: string;
  success: boolean;
  error?: string;
}

/**
 * Sends an email via Resend API if RESEND_API_KEY is configured,
 * or falls back to a clean in-memory transport in development and testing.
 */
export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = payload.from || process.env.NOTIFICATION_FROM_EMAIL || 'GymOS <notifications@gymsaas.local>';

  if (!apiKey) {
    // In-memory / development fallback
    const mockId = `mock_resend_${crypto.randomUUID()}`;
    return {
      id: mockId,
      success: true
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: payload.to,
        subject: payload.subject,
        html: payload.html
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        id: '',
        success: false,
        error: (errData as { message?: string }).message || `Resend API error: ${res.statusText}`
      };
    }

    const data = await res.json() as { id: string };
    return {
      id: data.id,
      success: true
    };
  } catch (err: unknown) {
    return {
      id: '',
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dispatch email'
    };
  }
}

export interface NotificationContext {
  gymName: string;
  memberName: string;
  memberNumber: string;
  memberPhone?: string;
  memberEmail?: string;
  receiptNumber?: string;
  amountCents?: number;
  planName?: string;
  customMessage?: string | null;
}

/**
 * Renders HTML email template content
 */
export function renderEmailTemplate(
  template: NotificationTemplate,
  ctx: NotificationContext
): { subject: string; html: string } {
  const brandVolt = '#C6FF3D';

  switch (template) {
    case 'welcome_enrollment':
      return {
        subject: `Welcome to ${ctx.gymName} — Member ID: ${ctx.memberNumber}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000; color: #f5f5f5; padding: 32px 16px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #121212; border: 1px solid #262626; border-radius: 16px; padding: 32px;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${brandVolt}; font-weight: 700;">${ctx.gymName}</div>
    <h1 style="font-size: 24px; font-weight: 800; margin: 12px 0 16px; color: #fff;">Welcome to the Gym, ${ctx.memberName}!</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #a3a3a3;">
      Your membership registration has been activated. Here are your enrollment credentials:
    </p>
    <div style="background-color: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 11px; color: #737373; text-transform: uppercase;">Official Member ID</div>
      <div style="font-size: 18px; font-weight: 700; color: ${brandVolt}; font-family: monospace; margin-top: 4px;">${ctx.memberNumber}</div>
    </div>
    ${ctx.customMessage ? `<p style="font-size: 13px; color: #d4d4d4; background-color: #171717; padding: 12px; border-radius: 8px;">${ctx.customMessage}</p>` : ''}
    <p style="font-size: 13px; color: #737373; margin-top: 24px; border-top: 1px solid #262626; pt: 16px;">
      Present this Member ID at the front desk for seamless check-in. See you on the gym floor!
    </p>
  </div>
</body>
</html>`
      };

    case 'payment_receipt':
      const formattedAmount = ctx.amountCents ? (ctx.amountCents / 100).toLocaleString('en-IN') : '0';
      return {
        subject: `Payment Receipt ${ctx.receiptNumber || ''} — ${ctx.gymName}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000; color: #f5f5f5; padding: 32px 16px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #121212; border: 1px solid #262626; border-radius: 16px; padding: 32px;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${brandVolt}; font-weight: 700;">${ctx.gymName}</div>
    <h1 style="font-size: 22px; font-weight: 800; margin: 12px 0 8px; color: #fff;">Payment Receipt</h1>
    <p style="font-size: 14px; color: #a3a3a3; margin-bottom: 24px;">Thank you for your payment, ${ctx.memberName}.</p>
    
    <div style="background-color: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span style="color: #737373; font-size: 12px;">Receipt Number</span>
        <span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #fff;">${ctx.receiptNumber || 'N/A'}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span style="color: #737373; font-size: 12px;">Member</span>
        <span style="font-size: 13px; color: #fff;">${ctx.memberName} (${ctx.memberNumber})</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid #333;">
        <span style="font-size: 14px; font-weight: 700; color: #fff;">Total Paid</span>
        <span style="font-size: 20px; font-weight: 800; color: ${brandVolt};">₹${formattedAmount}</span>
      </div>
    </div>
    ${ctx.customMessage ? `<p style="font-size: 13px; color: #d4d4d4; background-color: #171717; padding: 12px; border-radius: 8px;">${ctx.customMessage}</p>` : ''}
    <p style="font-size: 12px; color: #737373; text-align: center;">This is an electronically generated receipt for fitness services.</p>
  </div>
</body>
</html>`
      };

    case 'expiry_reminder':
      return {
        subject: `Membership Expiration Reminder — ${ctx.gymName}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000; color: #f5f5f5; padding: 32px 16px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #121212; border: 1px solid #262626; border-radius: 16px; padding: 32px;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${brandVolt}; font-weight: 700;">${ctx.gymName}</div>
    <h1 style="font-size: 22px; font-weight: 800; margin: 12px 0 16px; color: #fff;">Your Membership is Expiring Soon</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #a3a3a3;">
      Hi ${ctx.memberName}, your current subscription with ${ctx.gymName} is approaching its end date.
    </p>
    <div style="background-color: #1a1a1a; border-left: 4px solid ${brandVolt}; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="font-size: 13px; color: #e5e5e5; margin: 0;">
        Renew your plan today at the front desk to ensure continuous access to the gym facility and amenities.
      </p>
    </div>
    ${ctx.customMessage ? `<p style="font-size: 13px; color: #d4d4d4; background-color: #171717; padding: 12px; border-radius: 8px;">${ctx.customMessage}</p>` : ''}
    <p style="font-size: 13px; color: #737373;">See you in training!</p>
  </div>
</body>
</html>`
      };

    case 'renewal_confirmation':
      return {
        subject: `Membership Renewal Confirmed — ${ctx.gymName}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000; color: #f5f5f5; padding: 32px 16px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #121212; border: 1px solid #262626; border-radius: 16px; padding: 32px;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${brandVolt}; font-weight: 700;">${ctx.gymName}</div>
    <h1 style="font-size: 22px; font-weight: 800; margin: 12px 0 16px; color: #fff;">Subscription Renewal Confirmed!</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #a3a3a3;">
      Hi ${ctx.memberName}, your membership has been successfully renewed. Thank you for your continued commitment!
    </p>
    ${ctx.customMessage ? `<p style="font-size: 13px; color: #d4d4d4; background-color: #171717; padding: 12px; border-radius: 8px;">${ctx.customMessage}</p>` : ''}
    <p style="font-size: 13px; color: #737373; margin-top: 24px;">Your access is active. Let's keep training!</p>
  </div>
</body>
</html>`
      };

    case 'membership_approved':
      return {
        subject: `Registration Approved — Welcome to ${ctx.gymName}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000; color: #f5f5f5; padding: 32px 16px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #121212; border: 1px solid #262626; border-radius: 16px; padding: 32px;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${brandVolt}; font-weight: 700;">${ctx.gymName}</div>
    <h1 style="font-size: 22px; font-weight: 800; margin: 12px 0 16px; color: #fff;">Your Registration is Approved!</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #a3a3a3;">
      Hi ${ctx.memberName}, your self-registration for ${ctx.gymName} has been approved by the front desk.
    </p>
    <div style="background-color: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 11px; color: #737373; text-transform: uppercase;">Your Member ID</div>
      <div style="font-size: 18px; font-weight: 700; color: ${brandVolt}; font-family: monospace; margin-top: 4px;">${ctx.memberNumber}</div>
    </div>
    <p style="font-size: 13px; color: #737373;">We look forward to seeing you at the gym!</p>
  </div>
</body>
</html>`
      };

    default:
      return {
        subject: `Update from ${ctx.gymName}`,
        html: `<p>Hi ${ctx.memberName}, you have an update from ${ctx.gymName}.</p>`
      };
  }
}

/**
 * Generates direct WhatsApp click-to-chat URL with pre-filled message
 */
export function generateWhatsAppLink(
  template: NotificationTemplate,
  ctx: NotificationContext
): { url: string; text: string } {
  const cleanPhone = (ctx.memberPhone || '').replace(/\D/g, '');
  let message = '';

  switch (template) {
    case 'welcome_enrollment':
      message = `Hello ${ctx.memberName}! Welcome to ${ctx.gymName}. Your official Member ID is ${ctx.memberNumber}. We're excited to have you with us!`;
      break;

    case 'payment_receipt':
      const amount = ctx.amountCents ? (ctx.amountCents / 100).toLocaleString('en-IN') : '0';
      message = `Hello ${ctx.memberName}! We received your payment of ₹${amount} at ${ctx.gymName}. Receipt Number: ${ctx.receiptNumber || 'N/A'}. Thank you!`;
      break;

    case 'expiry_reminder':
      message = `Hello ${ctx.memberName}! Your membership at ${ctx.gymName} (ID: ${ctx.memberNumber}) is expiring soon. Please visit the front desk to renew your plan.`;
      break;

    case 'renewal_confirmation':
      message = `Hello ${ctx.memberName}! Your membership renewal at ${ctx.gymName} has been confirmed. Thank you!`;
      break;

    case 'membership_approved':
      message = `Hello ${ctx.memberName}! Your registration for ${ctx.gymName} has been approved. Your Member ID is ${ctx.memberNumber}. Welcome!`;
      break;

    default:
      message = `Hello ${ctx.memberName}! Greeting from ${ctx.gymName}.`;
      break;
  }

  if (ctx.customMessage) {
    message += ` Note: ${ctx.customMessage}`;
  }

  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${cleanPhone}?text=${encoded}`;

  return { url, text: message };
}
