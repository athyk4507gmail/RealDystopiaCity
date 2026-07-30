import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAccount, markAsPaid } from "@/lib/water/mockAccounts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      accountNumber,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    if (!accountNumber || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required payment verification fields" },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        { error: "RAZORPAY_KEY_SECRET is not configured on the server" },
        { status: 500 }
      );
    }

    // -----------------------------------------------------------------------
    // HMAC-SHA256 Signature Verification per Razorpay Security Specs
    // -----------------------------------------------------------------------
    const payloadToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(payloadToSign)
      .digest("hex");

    const isSignatureValid = expectedSignature === razorpay_signature;

    if (!isSignatureValid) {
      console.error(
        `[Payment Verification Failure] Account: ${accountNumber}, Payment: ${razorpay_payment_id}. Signature mismatch!`
      );
      return NextResponse.json(
        { error: "Payment verification failed: Invalid Razorpay signature" },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------------
    // Signature verified — mark account as Paid and record transaction log
    // -----------------------------------------------------------------------
    const account = getAccount(accountNumber);
    const log = markAsPaid(
      accountNumber,
      razorpay_payment_id,
      razorpay_order_id,
      account?.monthlyBillAmount
    );

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      accountNumber,
      amountPaid: log.amount,
      timestamp: log.timestamp,
    });
  } catch (err) {
    console.error("[verify-payment internal error]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
