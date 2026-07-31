import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import {
  createAnnouncement,
  getAllAnnouncements,
  getAnnouncementsByArea,
} from "@/lib/water/announcementsStore";
import { NOTIFICATION_RECIPIENTS } from "@/lib/water/notificationRecipients";

// ---------------------------------------------------------------------------
// GET /api/water/announce — list all announcements (or by ?area=ZoneName)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area");

  if (area) {
    return NextResponse.json(getAnnouncementsByArea(area));
  }
  return NextResponse.json(getAllAnnouncements());
}

// ---------------------------------------------------------------------------
// POST /api/water/announce — create announcement + send email via Resend
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: { area?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { area, message } = body;
  if (!area || !message?.trim()) {
    return NextResponse.json(
      { error: "area and message are required" },
      { status: 400 },
    );
  }

  const now = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  // -------------------------------------------------------------------------
  // Attempt to send real email via Gmail SMTP
  // -------------------------------------------------------------------------
  let emailSent = false;
  let emailId: string | undefined;
  let emailError: string | undefined;

  // Legacy Resend logic commented out
  /*
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && NOTIFICATION_RECIPIENTS.length > 0) {
    try {
      const emailRes = await fetch("https://api.resend.com/emails", { ... });
    } catch (err) { ... }
  }
  */

  if (gmailUser && gmailPass && NOTIFICATION_RECIPIENTS.length > 0) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      const info = await transporter.sendMail({
        from: `"CityPulse Water" <${gmailUser}>`,
        to: NOTIFICATION_RECIPIENTS,
        subject: `CityPulse Water Announcement — ${area}`,
        html: buildEmailHtml({ area, message, sentAt: now }),
      });

      emailSent = true;
      emailId = info.messageId;
    } catch (err) {
      emailError =
        err instanceof Error ? err.message : "Email send failed";
      console.error("[/api/water/announce] Gmail SMTP error:", err);
    }
  } else {
    emailError = !(gmailUser && gmailPass)
      ? "GMAIL_USER or GMAIL_APP_PASSWORD not configured — email simulated"
      : "No recipients configured in notificationRecipients.ts";
  }

  // -------------------------------------------------------------------------
  // Always save the announcement to shared store regardless of email result
  // -------------------------------------------------------------------------
  const saved = createAnnouncement({
    area,
    message: message.trim(),
    sentBy: "municipality",
    emailSent,
    emailId,
    recipientCount: emailSent ? NOTIFICATION_RECIPIENTS.length : 0,
  });

  return NextResponse.json({
    announcement: saved,
    emailSent,
    emailId,
    emailError: emailError ?? null,
    recipientCount: emailSent ? NOTIFICATION_RECIPIENTS.length : 0,
    sentAt: now,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildEmailHtml({
  area,
  message,
  sentAt,
}: {
  area: string;
  message: string;
  sentAt: string;
}) {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 0 auto; background: #0b0f19; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;">
      <div style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); padding: 20px 28px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 22px;">💧</span>
          <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #000;">BWSSB Water Announcement</h1>
        </div>
        <p style="margin: 4px 0 0; font-size: 12px; color: rgba(0,0,0,0.65);">CityPulse AI — Municipality Portal</p>
      </div>

      <div style="padding: 28px;">
        <div style="background: #1e293b; border-radius: 8px; padding: 6px 14px; display: inline-block; margin-bottom: 16px;">
          <span style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Area / Zone</span>
          <p style="margin: 2px 0 0; font-size: 16px; font-weight: 700; color: #06b6d4;">${area}</p>
        </div>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-left: 3px solid #06b6d4; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #e2e8f0;">${message}</p>
        </div>

        <hr style="border: none; border-top: 1px solid #1e293b; margin: 16px 0;" />

        <p style="font-size: 12px; color: #64748b; margin: 0;">
          Sent by Municipality Staff via CityPulse AI · ${sentAt}<br/>
          <em>This is an automated notification from the water distribution management system.</em>
        </p>
      </div>
    </div>
  `;
}
