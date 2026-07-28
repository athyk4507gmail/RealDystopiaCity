import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/water/mockAccounts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountNumber } = body;

    if (!accountNumber) {
      return NextResponse.json(
        { error: "Account number is required" },
        { status: 400 }
      );
    }

    // Server-side lookup — amount is fetched from server record, never trusted from client
    const account = getAccount(accountNumber);
    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    if (account.paymentStatus === "paid") {
      return NextResponse.json(
        { error: "This bill is already paid for the current cycle" },
        { status: 400 }
      );
    }

    const keyId =
      process.env.RAZORPAY_KEY_ID ||
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          error:
            "Razorpay API keys not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your env.",
        },
        { status: 500 }
      );
    }

    const amountInPaise = Math.round(account.monthlyBillAmount * 100);
    const receiptId = `rcpt_${account.accountNumber}_${Date.now()}`;

    // Call Razorpay REST API
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: receiptId,
        notes: {
          accountNumber: account.accountNumber,
          ownerName: account.ownerName,
          zone: account.zone,
        },
      }),
    });

    if (!razorpayRes.ok) {
      const errText = await razorpayRes.text();
      console.error("[Razorpay create-order error]", errText);
      return NextResponse.json(
        { error: `Razorpay Order API error (${razorpayRes.status}): ${errText}` },
        { status: razorpayRes.status }
      );
    }

    const orderData = await razorpayRes.json();

    return NextResponse.json({
      orderId: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      keyId,
      accountNumber: account.accountNumber,
      ownerName: account.ownerName,
    });
  } catch (err) {
    console.error("[create-order internal error]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
