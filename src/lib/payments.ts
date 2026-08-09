// Display labels for payment methods, kept beside the enum so the ledger,
// receipts and the payment form never drift apart in wording.

import type { PaymentMethod } from "@/generated/prisma/enums";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  UPI: "UPI",
  CHEQUE: "Cheque",
  OTHER: "Other",
};
