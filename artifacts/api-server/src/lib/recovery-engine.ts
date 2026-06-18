import { Prisma } from "@prisma/client";

const ZAR = (n: number) =>
  n.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });

// ─── executeRecoveryWaterfall ─────────────────────────────────────────────────
//
// Runs immediately when a clawback is EXECUTED.
// Priority: 1) Wallet availableBalance → 2) Future commission offset → (3 optional) Payroll flag
//
export async function executeRecoveryWaterfall(
  params: {
    clawbackId: string;
    tenantId: string;
    salesExecutiveId: string;
    outstandingAmount: number;
    clawbackAmount: number;
    recoveredAmount: number;
    eventTitle: string;
    executedByUserId: string;
    allowPayrollDeduction: boolean;
    tx: Prisma.TransactionClient;
  },
): Promise<{ newRecovered: number; newOutstanding: number; recoveryStatus: string }> {
  const {
    clawbackId, tenantId, salesExecutiveId, outstandingAmount,
    recoveredAmount, eventTitle, executedByUserId, allowPayrollDeduction, tx,
  } = params;

  let remaining     = outstandingAmount;
  let totalRecovered = recoveredAmount;

  // ── Step 1: Wallet deduction ──────────────────────────────────────────────
  const wallet = await tx.wallet.findUnique({ where: { userId: salesExecutiveId } });

  if (wallet) {
    const walletBalance = Number(wallet.availableBalance);
    if (walletBalance > 0) {
      const walletDeduct = Math.min(walletBalance, remaining);

      await tx.wallet.update({
        where: { id: wallet.id },
        data:  { availableBalance: walletBalance - walletDeduct },
      });

      await tx.walletTransaction.create({
        data: {
          tenantId,
          walletId:        wallet.id,
          transactionType: "CLAWBACK_DEDUCTION",
          amount:          walletDeduct,
          referenceType:   "CLAWBACK",
          referenceId:     clawbackId,
          description:     `Clawback recovery (wallet): ${eventTitle}`,
        },
      });

      await tx.clawbackRecovery.create({
        data: {
          tenantId,
          clawbackId,
          recoveryMethod: "WALLET_DEDUCTION",
          amount:         walletDeduct,
          description:    `Auto wallet deduction — ${ZAR(walletDeduct)} recovered`,
          createdById:    executedByUserId,
        },
      });

      remaining      -= walletDeduct;
      totalRecovered += walletDeduct;
    }
  }

  // ── Step 2: Future commission offset for any remainder ────────────────────
  if (remaining > 0) {
    await tx.clawbackRecovery.create({
      data: {
        tenantId,
        clawbackId,
        recoveryMethod: "FUTURE_COMMISSION_OFFSET",
        amount:         remaining,
        description:    `Future commission offset pending — ${ZAR(remaining)} deducted from next approved commission`,
        createdById:    executedByUserId,
      },
    });

    // ── Step 3: Payroll deduction flag (optional tenant setting) ─────────────
    // Creates a scheduled payroll record as a guaranteed fallback if the tenant
    // allows it. The same outstanding amount is flagged — payroll or offset,
    // whichever settles first reduces outstandingAmount.
    if (allowPayrollDeduction) {
      await tx.clawbackRecovery.create({
        data: {
          tenantId,
          clawbackId,
          recoveryMethod: "PAYROLL_DEDUCTION",
          amount:         remaining,
          description:    `Payroll deduction scheduled as fallback — ${ZAR(remaining)} on payroll run`,
          createdById:    executedByUserId,
        },
      });
    }
  }

  const newOutstanding  = remaining;
  const newRecoveryStatus: string =
    newOutstanding === 0 ? "FULLY_RECOVERED"
    : totalRecovered > recoveredAmount ? "PARTIALLY_RECOVERED"
    : "RECOVERY_IN_PROGRESS";

  return { newRecovered: totalRecovered, newOutstanding, recoveryStatus: newRecoveryStatus };
}

// ─── applyFutureOffsets ───────────────────────────────────────────────────────
//
// Called inside checkAndCreditWallet (commission-events) before crediting wallet.
// Finds this user's EXECUTED clawbacks with outstanding amounts (FUTURE_COMMISSION_OFFSET)
// and deducts from the incoming gross commission, oldest-first.
// Returns the net amount that should be credited to availableBalance.
//
export async function applyFutureOffsets(params: {
  userId: string;
  tenantId: string;
  grossIncoming: number;
  walletId: string;
  commissionEventId: string;
  eventTitle: string;
  tx: Prisma.TransactionClient;
}): Promise<{ netAmount: number; totalDeducted: number }> {
  const { userId, tenantId, grossIncoming, walletId, commissionEventId, eventTitle, tx } = params;

  const pendingClawbacks = await tx.commissionClawback.findMany({
    where: {
      tenantId,
      salesExecutiveId: userId,
      status:           "EXECUTED",
      outstandingAmount: { gt: 0 },
    },
    include: { commissionEvent: { select: { eventTitle: true } } },
    orderBy: { executedAt: "asc" }, // oldest debt first
  });

  if (pendingClawbacks.length === 0) {
    return { netAmount: grossIncoming, totalDeducted: 0 };
  }

  let remaining     = grossIncoming;
  let totalDeducted = 0;

  for (const cb of pendingClawbacks) {
    if (remaining <= 0) break;

    const owedAmount = Number(cb.outstandingAmount);
    const deductNow  = Math.min(owedAmount, remaining);
    const cbTitle    = cb.commissionEvent?.eventTitle ?? "unknown event";

    // Wallet transaction for the deduction
    await tx.walletTransaction.create({
      data: {
        tenantId,
        walletId,
        transactionType: "FUTURE_OFFSET_APPLIED",
        amount:          deductNow,
        referenceType:   "CLAWBACK",
        referenceId:     cb.id,
        description:     `Clawback offset applied: ${cbTitle}`,
      },
    });

    // Recovery record on the clawback
    await tx.clawbackRecovery.create({
      data: {
        tenantId,
        clawbackId:     cb.id,
        recoveryMethod: "FUTURE_COMMISSION_OFFSET",
        amount:         deductNow,
        description:    `Commission offset applied from "${eventTitle}" — ${ZAR(deductNow)}`,
        referenceId:    commissionEventId,
        createdById:    userId,
      },
    });

    const newRecovered    = Number(cb.recoveredAmount) + deductNow;
    const newOutstanding  = Math.max(0, owedAmount - deductNow);
    const newRecovSt      = newOutstanding === 0 ? "FULLY_RECOVERED" : "PARTIALLY_RECOVERED";

    await tx.commissionClawback.update({
      where: { id: cb.id },
      data:  {
        recoveredAmount:  newRecovered,
        outstandingAmount: newOutstanding,
        recoveryStatus:   newRecovSt as any,
      },
    });

    await tx.notification.create({
      data: {
        tenantId,
        userId,
        title:      "Commission Offset Applied",
        message:    `${ZAR(deductNow)} of your new commission for "${eventTitle}" was applied to your outstanding clawback on "${cbTitle}". ${newOutstanding > 0 ? `${ZAR(newOutstanding)} remains outstanding.` : "That clawback is now fully recovered."}`,
        type:       "WALLET_CREDITED" as any,
        readStatus: false,
      },
    }).catch(() => {});

    remaining      -= deductNow;
    totalDeducted  += deductNow;
  }

  return { netAmount: remaining, totalDeducted };
}
