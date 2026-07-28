import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { markAsPaid } from "@/lib/water/mockAccounts";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!webhookSecret) {
      console.warn("[Webhook warning] No webhook secret configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        { error: "Missing x-razorpay-signature header" },
        { status: 400 }
      );
    }

    // Verify webhook HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("[Webhook error] Invalid webhook signature!");
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;

    if (eventType === "payment.captured") {
      const paymentEntity = event.payload.payment.entity;
      const accountNumber = paymentEntity.notes?.accountNumber;
      const paymentId = paymentEntity.id;
      const amount = paymentEntity.amount / 100; // paise to INR

      if (accountNumber && paymentId) {
        markAsPaid(accountNumber, paymentId, paymentEntity.order_id, amount);
        console.log(
          `[Razorpay Webhook] Successfully captured and marked account ${accountNumber} as paid (Payment ID: ${paymentId})`
        );
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Webhook handler error]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook processing error" },
      { status: 500 }
    );
  }
}
