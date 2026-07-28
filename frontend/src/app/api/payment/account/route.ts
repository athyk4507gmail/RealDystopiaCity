import { NextRequest, NextResponse } from "next/server";
import { getAccount, getAllAccounts } from "@/lib/water/mockAccounts";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountNumber = searchParams.get("accountNumber");

  if (accountNumber) {
    const acc = getAccount(accountNumber);
    if (!acc) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    return NextResponse.json(acc);
  }

  const allAccounts = getAllAccounts();
  return NextResponse.json(allAccounts);
}
