import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractCustomerName(eventDataJson: unknown): string {
  if (!eventDataJson || typeof eventDataJson !== "object") return "";
  const d = eventDataJson as Record<string, unknown>;
  const KEYS = ["customerName", "clientName", "candidateName", "buyerName", "accountName", "tenantName", "recruiterClient", "partnerName"];
  for (const k of KEYS) {
    if (typeof d[k] === "string" && d[k]) return d[k] as string;
  }
  return "";
}

function ceaToResponse(cea: any) {
  const event = cea.commissionEvent ?? {};
  const exec = event.salesExecutive ?? {};
  return {
    id:                   cea.id,
    tenantId:             cea.tenantId,
    dealId:               cea.commissionEventId,
    dealName:             event.eventTitle ?? "",
    customerName:         extractCustomerName(event.eventDataJson),
    calculatedCommission: Number(event.calculatedCommissionAmount ?? 0),
    salesExecutiveName:   exec.firstName ? `${exec.firstName} ${exec.lastName}` : "",
    approvalLevel:        cea.approvalStep,
    stepName:             cea.stepName ?? null,
    approverRole:         cea.approverRole,
    approverUserId:       cea.approverUserId ?? null,
    approverName:         cea.approver ? `${cea.approver.firstName} ${cea.approver.lastName}` : null,
    status:               cea.status,
    comments:             cea.comments ?? null,
    payoutAmount:         cea.payoutAmount ? Number(cea.payoutAmount) : null,
    approvedAt:           cea.approvedAt?.toISOString() ?? null,
    createdAt:            cea.createdAt.toISOString(),
    submittedAt:          event.submittedAt?.toISOString() ?? null,
    eventDataJson:        event.eventDataJson ?? {},
    commissionBreakdown: {
      eventType:            event.eventType ?? "",
      revenueAmount:        Number(event.revenueAmount ?? 0),
      costAmount:           Number(event.costAmount ?? 0),
      grossProfitAmount:    Number(event.grossProfitAmount ?? 0),
      commissionBaseAmount: Number(event.commissionBaseAmount ?? 0),
      commissionPercentage: Number(event.commissionPercentage ?? 0),
    },
    sourceType:           event.sourceType ?? "SELF",
    splitReferrerName:    event.splitReferrerName ?? null,
    splitDeductionAmount: event.splitDeductionAmount ? Number(event.splitDeductionAmount) : null,
    editStatus:           event.editStatus ?? "NONE",
  };
}

const ceaInclude = {
  commissionEvent: {
    select: {
      eventTitle:                 true,
      eventType:                  true,
      eventDataJson:              true,
      revenueAmount:              true,
      costAmount:                 true,
      grossProfitAmount:          true,
      commissionBaseAmount:       true,
      commissionPercentage:       true,
      calculatedCommissionAmount: true,
      salesExecutiveId:           true,
      submittedAt:                true,
      sourceType:                 true,
      internalReferrerId:         true,
      externalProviderId:         true,
      splitReferrerName:          true,
      splitDeductionAmount:       true,
      editStatus:                 true,
      salesExecutive:             { select: { firstName: true, lastName: true } },
      internalReferrer:           { select: { firstName: true, lastName: true } },
    },
  },
  approver: { select: { firstName: true, lastName: true } },
};

async function deductPendingBalance(
  tenantId: string, salesExecutiveId: string, commission: number, eventId: string, eventTitle: string
) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: salesExecutiveId } });
  if (wallet && wallet.pendingBalance > 0) {
    const deduction = Math.min(Number(wallet.pendingBalance), commission);
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { pendingBalance: Math.max(0, Number(wallet.pendingBalance) - deduction) },
    });
    await prisma.walletTransaction.create({
      data: {
        tenantId,
        walletId:        wallet.id,
        transactionType: "PENDING_COMMISSION_REMOVED",
        amount:          deduction,
        referenceType:   "DEAL",
        referenceId:     eventId,
        description:     `Commission reversal: ${eventTitle}`,
      },
    });
  }
}

// Compute split deduction and credit internal referrer if applicable.
// Returns the net commission for the sales exec after deduction.
async function computeAndApplySplit(
  tenantId: string, event: any, fullCommission: number, eventId: string, eventTitle: string
): Promise<number> {
  if (event.sourceType !== "INTERNAL" || !event.internalReferrerId) return fullCommission;

  const splitConfig = await prisma.commissionSplitConfig.findUnique({ where: { tenantId } });
  if (!splitConfig || !splitConfig.isEnabled || splitConfig.deductionValue <= 0) return fullCommission;

  const rawSplit = splitConfig.deductionType === "PERCENTAGE"
    ? fullCommission * (Number(splitConfig.deductionValue) / 100)
    : Number(splitConfig.deductionValue);
  const splitAmount = Math.min(rawSplit, fullCommission);
  const netCommission = fullCommission - splitAmount;

  // Credit internal referrer wallet
  const referrerWallet = await prisma.wallet.findUnique({ where: { userId: event.internalReferrerId } });
  if (referrerWallet) {
    await prisma.wallet.update({
      where: { id: referrerWallet.id },
      data:  { availableBalance: Number(referrerWallet.availableBalance) + splitAmount },
    });
    await prisma.walletTransaction.create({
      data: {
        tenantId,
        walletId:        referrerWallet.id,
        transactionType: "COMMISSION_SPLIT_CREDIT",
        amount:          splitAmount,
        referenceType:   "DEAL",
        referenceId:     eventId,
        description:     `Commission split credit: ${eventTitle}`,
      },
    });
    const referrerName = event.internalReferrer
      ? `${event.internalReferrer.firstName} ${event.internalReferrer.lastName}`
      : "Internal referrer";
    await prisma.notification.create({
      data: {
        tenantId,
        userId:   event.internalReferrerId,
        title:    "Commission Split Credited",
        message:  `R${splitAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} commission split credited for "${eventTitle}"`,
        type:     "WALLET_CREDITED",
        readStatus: false,
      },
    }).catch(() => {});
    logger.info({ referrerName, splitAmount, eventId }, "Commission split credited to referrer");
  }

  // Store the split amount on the commission event
  await prisma.commissionEvent.update({
    where: { id: eventId },
    data:  { splitDeductionAmount: splitAmount },
  });

  return netCommission;
}

async function creditWalletForSalesExec(
  tenantId: string, salesExecId: string, commission: number, eventId: string, eventTitle: string
) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: salesExecId } });
  if (!wallet) return;
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      availableBalance: Number(wallet.availableBalance) + commission,
      pendingBalance:   Math.max(0, Number(wallet.pendingBalance) - commission),
    },
  });
  await prisma.walletTransaction.create({
    data: {
      tenantId,
      walletId:        wallet.id,
      transactionType: "COMMISSION_APPROVED",
      amount:          commission,
      referenceType:   "DEAL",
      referenceId:     eventId,
      description:     `Commission approved: ${eventTitle}`,
    },
  });
}

// ── GET /api/approvals ────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { status, dealId } = req.query as { status?: string; dealId?: string };
  try {
    const where: any = { tenantId: req.user!.tenantId };

    if (!["SUPER_ADMIN", "ADMIN"].includes(req.user!.role)) {
      where.OR = [
        { approverUserId: req.user!.userId },
        { approverUserId: null, approverRole: req.user!.role },
      ];
    }

    where.status = status ?? "PENDING";
    if (dealId) where.commissionEventId = dealId;

    const approvals = await prisma.commissionEventApproval.findMany({
      where,
      include: ceaInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json(approvals.map(ceaToResponse));
  } catch (err) {
    logger.error({ err }, "ListApprovals error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/approvals/deal/:dealId ──────────────────────────────────────────
// dealId here is actually the commissionEventId (frontend naming)

router.get("/deal/:dealId", requireAuth, async (req: Request, res: Response) => {
  try {
    const approvals = await prisma.commissionEventApproval.findMany({
      where: { commissionEventId: req.params.dealId as string, tenantId: req.user!.tenantId },
      include: ceaInclude,
      orderBy: { approvalStep: "asc" },
    });
    res.json(approvals.map(ceaToResponse));
  } catch (err) {
    logger.error({ err }, "GetDealApprovals error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/approvals/:id/action ────────────────────────────────────────────

router.post("/:id/action", requireAuth, async (req: Request, res: Response) => {
  const { action, comments, payoutAmount, allowResubmit } = req.body;
  if (!action || !["APPROVE", "REJECT", "REQUEST_CHANGES"].includes(action)) {
    res.status(400).json({ error: "action must be APPROVE, REJECT, or REQUEST_CHANGES" });
    return;
  }
  if (["REJECT", "REQUEST_CHANGES"].includes(action) && !comments?.trim()) {
    res.status(400).json({ error: "comments are required when rejecting or requesting changes" });
    return;
  }

  try {
    const cea: any = await prisma.commissionEventApproval.findUnique({
      where:   { id: req.params.id as string },
      include: { commissionEvent: true },
    });
    if (!cea) { res.status(404).json({ error: "Approval not found" }); return; }
    if (cea.tenantId !== req.user!.tenantId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (cea.status !== "PENDING") {
      res.status(400).json({ error: "This approval step has already been actioned" });
      return;
    }

    const canAction =
      ["SUPER_ADMIN", "ADMIN"].includes(req.user!.role) ||
      cea.approverUserId === req.user!.userId ||
      (!cea.approverUserId && cea.approverRole === req.user!.role);
    if (!canAction) {
      res.status(403).json({ error: "You are not authorised to action this approval step" });
      return;
    }

    // SALES_EXECUTIVE confirmation step — payout amount required on approval
    if (action === "APPROVE" && cea.approverRole === "SALES_EXECUTIVE") {
      const amt = Number(payoutAmount);
      if (!payoutAmount || isNaN(amt) || amt <= 0) {
        res.status(400).json({ error: "payoutAmount is required when a Sales Executive Confirmation step is approved" });
        return;
      }
    }

    const newStatus = action === "APPROVE" ? "APPROVED"
      : action === "REJECT" ? "REJECTED"
      : "CHANGES_REQUESTED";

    const updateData: any = {
      status:        newStatus,
      approverUserId: req.user!.userId,
      comments:      comments ?? null,
      approvedAt:    action === "APPROVE" ? new Date() : null,
    };
    if (action === "APPROVE" && cea.approverRole === "SALES_EXECUTIVE" && payoutAmount) {
      updateData.payoutAmount = Number(payoutAmount);
    }

    const updated: any = await prisma.commissionEventApproval.update({
      where:   { id: req.params.id as string },
      data:    updateData,
      include: ceaInclude,
    });

    const event       = cea.commissionEvent;
    const commission  = Number(event.calculatedCommissionAmount);
    const salesExecId = event.salesExecutiveId as string;
    const eventId     = event.id as string;
    const eventTitle  = event.eventTitle as string;

    if (action === "APPROVE") {
      // SALES_EXECUTIVE confirmation — create payout request
      if (cea.approverRole === "SALES_EXECUTIVE") {
        const amt    = Number(payoutAmount);
        const tax    = amt * 0.25;
        const net    = amt - tax;
        const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
        const cutoffDay = tenant?.commissionCutoffDay ?? 20;
        const now = new Date();
        const isAfterCutoff = now.getDate() > cutoffDay;
        const payoutDate  = isAfterCutoff ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
        const payoutMonth = `${payoutDate.getFullYear()}-${String(payoutDate.getMonth() + 1).padStart(2, "0")}`;
        await prisma.payoutRequest.create({
          data: {
            tenantId: req.user!.tenantId,
            userId:   salesExecId,
            requestedAmount:     amt,
            estimatedTax:        tax,
            estimatedNetPayout:  net,
            payoutMonth,
            status: "PENDING",
          },
        });
        await prisma.notification.create({
          data: {
            tenantId: req.user!.tenantId,
            userId:   salesExecId,
            title:    "Payout Request Created",
            message:  `Your payout request of R${amt.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${eventTitle} has been sent to Payroll for processing.`,
            type:     "PAYOUT_REQUESTED",
            readStatus: false,
          },
        });
      }

      // Find next step
      const nextStep: any = await prisma.commissionEventApproval.findFirst({
        where: { commissionEventId: eventId, approvalStep: cea.approvalStep + 1 },
      });

      if (nextStep) {
        // Determine interim CommissionEvent status
        const interimStatus: string =
          cea.approverRole === "MANAGER"         ? "MANAGER_APPROVED"
          : cea.approverRole === "FINANCE"       ? "FINANCE_APPROVED"
          : cea.approverRole === "EXECUTIVE"     ? "EXECUTIVE_APPROVED"
          : cea.approverRole === "SALES_EXECUTIVE" ? "PENDING_PAYROLL"
          : "PENDING_APPROVAL";

        await prisma.commissionEvent.update({
          where: { id: eventId },
          data:  { approvalStatus: interimStatus },
        });

        // SALES_EXECUTIVE next step — credit wallet and assign step to this exec
        if (nextStep.approverRole === "SALES_EXECUTIVE") {
          const netCommission1 = await computeAndApplySplit(req.user!.tenantId, event, commission, eventId, eventTitle);
          await creditWalletForSalesExec(req.user!.tenantId, salesExecId, netCommission1, eventId, eventTitle);
          await prisma.commissionEventApproval.update({
            where: { id: nextStep.id },
            data:  { approverUserId: salesExecId, status: "PENDING" },
          });
          await prisma.notification.create({
            data: {
              tenantId: req.user!.tenantId,
              userId:   salesExecId,
              title:    "Commission Credited — Action Required",
              message:  `R${netCommission1.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} commission for ${eventTitle} has been credited to your wallet. Please go to Approvals to confirm your payout amount.`,
              type:     "WALLET_CREDITED",
              readStatus: false,
            },
          });
        } else {
          // Activate next step
          await prisma.commissionEventApproval.update({
            where: { id: nextStep.id },
            data:  { status: "PENDING" },
          });

          // Notify next approver(s)
          if (nextStep.approverUserId) {
            await prisma.notification.create({
              data: {
                tenantId: req.user!.tenantId,
                userId:   nextStep.approverUserId,
                title:    "Deal Approval Required",
                message:  `${eventTitle} has been approved at step ${cea.approvalStep} and requires your review`,
                type:     "DEAL_SUBMITTED",
                readStatus: false,
              },
            });
          } else {
            const roleUsers = await prisma.user.findMany({
              where: { tenantId: req.user!.tenantId, role: nextStep.approverRole, status: "ACTIVE" },
            });
            if (roleUsers.length > 0) {
              await prisma.notification.createMany({
                data: roleUsers.map((u: any) => ({
                  tenantId: req.user!.tenantId,
                  userId:   u.id,
                  title:    "Deal Approval Required",
                  message:  `${eventTitle} is ready for ${nextStep.approverRole} review`,
                  type:     "DEAL_SUBMITTED" as const,
                  readStatus: false,
                })),
              });
            }
          }

          // Notify sales exec of progress
          if (nextStep.approverRole !== "SALES_EXECUTIVE") {
            await prisma.notification.create({
              data: {
                tenantId: req.user!.tenantId,
                userId:   salesExecId,
                title:    "Deal Progressed",
                message:  `Your deal ${eventTitle} was approved at step ${cea.approvalStep} — moving to next stage`,
                type:     "DEAL_APPROVED",
                readStatus: false,
              },
            });
          }
        }

        // Notify payroll when it becomes their turn
        if (nextStep.approverRole === "PAYROLL") {
          const salesExec: any = await prisma.user.findUnique({ where: { id: salesExecId }, select: { firstName: true, lastName: true } });
          const confirmedAmount = cea.approverRole === "SALES_EXECUTIVE" ? Number(payoutAmount) : null;
          const payrollUsers = await prisma.user.findMany({
            where: { tenantId: req.user!.tenantId, role: "PAYROLL", status: "ACTIVE" },
          });
          if (payrollUsers.length > 0) {
            await prisma.notification.createMany({
              data: payrollUsers.map((u: any) => ({
                tenantId: req.user!.tenantId,
                userId:   u.id,
                title:    "Payout Ready for Processing",
                message:  confirmedAmount
                  ? `${salesExec?.firstName ?? "Sales exec"} ${salesExec?.lastName ?? ""} confirmed a payout of R${confirmedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} for ${eventTitle}. Please review and process.`
                  : `${eventTitle} is ready for Payroll processing.`,
                type: "PAYOUT_REQUESTED" as const,
                readStatus: false,
              })),
            });
          }
        }
      } else {
        // Final step approved — mark event as APPROVED
        const alreadyCredited = await prisma.walletTransaction.findFirst({
          where: { referenceId: eventId, transactionType: "COMMISSION_APPROVED" },
        });

        await prisma.commissionEvent.update({
          where: { id: eventId },
          data:  { approvalStatus: "APPROVED", approvedAt: new Date(), walletStatus: "CREDITED" },
        });

        if (!alreadyCredited) {
          const netCommission2 = await computeAndApplySplit(req.user!.tenantId, event, commission, eventId, eventTitle);
          await creditWalletForSalesExec(req.user!.tenantId, salesExecId, netCommission2, eventId, eventTitle);
          await prisma.notification.create({
            data: {
              tenantId: req.user!.tenantId,
              userId:   salesExecId,
              title:    "Commission Approved & Credited",
              message:  `R${netCommission2.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} has been credited to your wallet for ${eventTitle}`,
              type:     "WALLET_CREDITED",
              readStatus: false,
            },
          });

          // ── Future-offset clawback hook ───────────────────────────────────────
          // Apply any pending FUTURE_COMMISSION_OFFSET clawbacks for this exec.
          // Uses a per-clawback transaction so a failure on one doesn't block others.
          // Caps deduction at the wallet's live available balance to prevent negatives.
          // Handles partial coverage: outstandingAmount reduced by what was actually
          // deducted, not forced to 0; recoveryStatus updated accordingly.
          try {
            const pendingOffsets = await prisma.commissionClawback.findMany({
              where: {
                tenantId:          req.user!.tenantId,
                salesExecutiveId:  salesExecId,
                status:            "EXECUTED",
                outstandingAmount: { gt: 0 },
              },
              include: {
                recoveries:      { where: { recoveryMethod: "FUTURE_COMMISSION_OFFSET" } },
                commissionEvent: { select: { eventTitle: true } },
              },
              orderBy: { executedAt: "asc" }, // oldest debt first
            });

            for (const offset of pendingOffsets) {
              if (offset.recoveries.length === 0) continue;
              const outstanding = Number(offset.outstandingAmount);
              if (outstanding <= 0) continue;

              const offsetTitle = (offset as any).commissionEvent?.eventTitle ?? "prior event";

              // Run inside a transaction so the wallet re-fetch and deduction are atomic
              await prisma.$transaction(async (tx) => {
                // Re-fetch wallet inside the transaction for the freshest balance
                const freshWallet = await tx.wallet.findUnique({ where: { userId: salesExecId } });
                if (!freshWallet) return;

                const walletBalance = Number(freshWallet.availableBalance);
                if (walletBalance <= 0) return;

                // Cap deduction so the wallet can never go negative
                const deductNow      = Math.min(walletBalance, outstanding);
                const newOutstanding = Math.max(0, outstanding - deductNow);
                const newRecovered   = Number(offset.recoveredAmount) + deductNow;
                const newRecovSt     = newOutstanding === 0 ? "FULLY_RECOVERED" : "PARTIALLY_RECOVERED";

                await tx.wallet.update({
                  where: { id: freshWallet.id },
                  data:  { availableBalance: walletBalance - deductNow },
                });

                await tx.walletTransaction.create({
                  data: {
                    tenantId:        req.user!.tenantId,
                    walletId:        freshWallet.id,
                    transactionType: "FUTURE_OFFSET_APPLIED",
                    amount:          deductNow,
                    referenceType:   "CLAWBACK",
                    referenceId:     offset.id,
                    description:     `Future commission offset applied for "${offsetTitle}"`,
                  },
                });

                await tx.clawbackRecovery.create({
                  data: {
                    tenantId:       req.user!.tenantId,
                    clawbackId:     offset.id,
                    recoveryMethod: "FUTURE_COMMISSION_OFFSET",
                    amount:         deductNow,
                    description:    `Auto-applied offset on approval of commission event ${eventId}`,
                    createdById:    req.user!.userId,
                  },
                });

                await tx.commissionClawback.update({
                  where: { id: offset.id },
                  data: {
                    recoveredAmount:   newRecovered,
                    outstandingAmount: newOutstanding,
                    recoveryStatus:    newRecovSt as any,
                  },
                });
              });

              await prisma.notification.create({
                data: {
                  tenantId:   req.user!.tenantId,
                  userId:     salesExecId,
                  title:      "Clawback Offset Applied",
                  message:    `A clawback offset for "${offsetTitle}" has been applied from your latest commission.`,
                  type:       "CLAWBACK_EXECUTED",
                  readStatus: false,
                },
              }).catch(() => {});
            }
          } catch (offsetErr) {
            logger.error({ err: offsetErr }, "FutureOffsetHook error — commission credit was not rolled back");
          }
        } else {
          await prisma.notification.create({
            data: {
              tenantId: req.user!.tenantId,
              userId:   salesExecId,
              title:    "Deal Fully Approved",
              message:  `${eventTitle} has completed all approval stages and is fully approved.`,
              type:     "DEAL_APPROVED",
              readStatus: false,
            },
          });
        }
      }
    } else if (action === "REJECT") {
      const canResubmit = allowResubmit === true;
      await prisma.commissionEvent.update({ where: { id: eventId }, data: { approvalStatus: "REJECTED", allowResubmit: canResubmit } });
      await deductPendingBalance(req.user!.tenantId, salesExecId, commission, eventId, eventTitle);

      // Reverse any commission already credited
      const credited = await prisma.walletTransaction.findFirst({
        where: { referenceId: eventId, transactionType: "COMMISSION_APPROVED" },
      });
      if (credited) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: salesExecId } });
        if (wallet) {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data:  { availableBalance: Math.max(0, Number(wallet.availableBalance) - commission) },
          });
          await prisma.walletTransaction.create({
            data: {
              tenantId: req.user!.tenantId,
              walletId:        wallet.id,
              transactionType: "PENDING_COMMISSION_REMOVED",
              amount:          commission,
              referenceType:   "DEAL",
              referenceId:     eventId,
              description:     `Commission reversed after rejection: ${eventTitle}`,
            },
          });
        }
      }

      const canResubmit2 = allowResubmit === true;
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId:   salesExecId,
          title:    "Deal Rejected",
          message:  `Your deal ${eventTitle} was rejected${comments ? `: ${comments}` : ""}${canResubmit2 ? " — you may resubmit after making changes." : ""}`,
          type:     "DEAL_REJECTED",
          readStatus: false,
        },
      });
    } else {
      // REQUEST_CHANGES — send back for revision
      await prisma.commissionEvent.update({ where: { id: eventId }, data: { approvalStatus: "CHANGES_REQUESTED" } });
      await deductPendingBalance(req.user!.tenantId, salesExecId, commission, eventId, eventTitle);
      await prisma.notification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId:   salesExecId,
          title:    "Changes Requested on Deal",
          message:  `${eventTitle} has been sent back for changes${comments ? `: ${comments}` : ""}`,
          type:     "DEAL_CHANGES_REQUESTED",
          readStatus: false,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        action,
        entityType: "CommissionEventApproval",
        entityId:   cea.id,
        oldValue:   JSON.stringify({ status: cea.status }),
        newValue:   JSON.stringify({ status: newStatus, comments, payoutAmount: payoutAmount ?? null }),
      },
    });

    res.json(ceaToResponse(updated));
  } catch (err) {
    logger.error({ err }, "ActionApproval error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as approvalsRouter };
