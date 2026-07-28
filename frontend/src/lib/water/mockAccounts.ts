export interface PipelineAccount {
  accountNumber: string;
  ownerName: string;
  address: string;
  zone: string;
  monthlyBillAmount: number; // INR
  dueDate: string; // ISO date string
  paymentStatus: "pending" | "paid" | "overdue";
  lastPaidDate: string | null;
  connectionType: "residential" | "commercial";
  meterReading: number; // current month kL
}

/**
 * Mock pipeline accounts — 8 realistic Bangalore entries.
 * In the demo, status is mutated in-memory to simulate payment.
 */
export const MOCK_ACCOUNTS: PipelineAccount[] = [
  {
    accountNumber: "BWSSB-2024-00142",
    ownerName: "Suresh Rajan",
    address: "14/A, 3rd Cross, Rajajinagar, Bengaluru - 560010",
    zone: "Rajajinagar",
    monthlyBillAmount: 480,
    dueDate: "2026-08-05",
    paymentStatus: "pending",
    lastPaidDate: "2026-07-03",
    connectionType: "residential",
    meterReading: 12.4,
  },
  {
    accountNumber: "BWSSB-2024-00387",
    ownerName: "Meena Krishnamurthy",
    address: "27, 5th Main, Koramangala 4th Block, Bengaluru - 560034",
    zone: "Koramangala",
    monthlyBillAmount: 620,
    dueDate: "2026-08-07",
    paymentStatus: "pending",
    lastPaidDate: "2026-07-05",
    connectionType: "residential",
    meterReading: 18.2,
  },
  {
    accountNumber: "BWSSB-2024-00519",
    ownerName: "Anil Kumar Sharma",
    address: "88, Brigade Road, Shivajinagar, Bengaluru - 560025",
    zone: "Shivajinagar",
    monthlyBillAmount: 1240,
    dueDate: "2026-07-28",
    paymentStatus: "overdue",
    lastPaidDate: "2026-06-01",
    connectionType: "commercial",
    meterReading: 38.6,
  },
  {
    accountNumber: "BWSSB-2024-00673",
    ownerName: "Priya Venkatesh",
    address: "42, 8th Cross, Malleswaram, Bengaluru - 560003",
    zone: "Malleswaram",
    monthlyBillAmount: 390,
    dueDate: "2026-08-10",
    paymentStatus: "pending",
    lastPaidDate: "2026-07-08",
    connectionType: "residential",
    meterReading: 9.8,
  },
  {
    accountNumber: "BWSSB-2024-00821",
    ownerName: "Rajesh Nair",
    address: "7/1, 2nd Stage, Yeshwanthpur, Bengaluru - 560022",
    zone: "Yeshwanthpur",
    monthlyBillAmount: 510,
    dueDate: "2026-08-03",
    paymentStatus: "paid",
    lastPaidDate: "2026-07-25",
    connectionType: "residential",
    meterReading: 14.1,
  },
  {
    accountNumber: "BWSSB-2024-00945",
    ownerName: "Deepa Srinivas",
    address: "102, 1st Main, JP Nagar 3rd Phase, Bengaluru - 560078",
    zone: "JP Nagar",
    monthlyBillAmount: 455,
    dueDate: "2026-08-06",
    paymentStatus: "pending",
    lastPaidDate: "2026-07-04",
    connectionType: "residential",
    meterReading: 11.3,
  },
  {
    accountNumber: "BWSSB-2024-01087",
    ownerName: "Mohammed Ismail",
    address: "56, Commercial Street, Tasker Town, Bengaluru - 560001",
    zone: "Shivajinagar",
    monthlyBillAmount: 2100,
    dueDate: "2026-07-30",
    paymentStatus: "overdue",
    lastPaidDate: "2026-05-28",
    connectionType: "commercial",
    meterReading: 67.4,
  },
  {
    accountNumber: "BWSSB-2024-01204",
    ownerName: "Kavitha Reddy",
    address: "11, 4th Block, Jayanagar, Bengaluru - 560011",
    zone: "Jayanagar",
    monthlyBillAmount: 530,
    dueDate: "2026-08-09",
    paymentStatus: "pending",
    lastPaidDate: "2026-07-07",
    connectionType: "residential",
    meterReading: 15.7,
  },
];

/** In-memory override store — set when citizen pays a bill in the demo */
const paymentOverrides = new Map<string, "paid">();

export function getAccount(accountNumber: string): PipelineAccount | null {
  const acc = MOCK_ACCOUNTS.find((a) => a.accountNumber === accountNumber);
  if (!acc) return null;
  if (paymentOverrides.has(accountNumber)) {
    return { ...acc, paymentStatus: "paid", lastPaidDate: new Date().toISOString().split("T")[0] };
  }
  return acc;
}

export function markAsPaid(accountNumber: string): void {
  paymentOverrides.set(accountNumber, "paid");
}

export function getAllAccounts(): PipelineAccount[] {
  return MOCK_ACCOUNTS.map((acc) => ({
    ...acc,
    paymentStatus: paymentOverrides.has(acc.accountNumber) ? "paid" : acc.paymentStatus,
    lastPaidDate: paymentOverrides.has(acc.accountNumber)
      ? new Date().toISOString().split("T")[0]
      : acc.lastPaidDate,
  }));
}
