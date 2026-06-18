/**
 * migrate-deals.ts
 *
 * Safe, idempotent one-time migration: copies every Deal row to a
 * CommissionEvent row.  A deal that has already been migrated is skipped
 * (detected via eventDataJson.migratedFromDealId).
 *
 * Run once:
 *   pnpm --filter @workspace/api-server run migrate-deals
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Map DealStatus string → CommissionEvent approvalStatus string
function mapStatus(dealStatus: string): string {
  switch (dealStatus) {
    case "DRAFT":             return "DRAFT";
    case "SUBMITTED":         return "PENDING_APPROVAL";
    case "PENDING_APPROVAL":  return "PENDING_APPROVAL";
    case "MANAGER_APPROVED":  return "PENDING_APPROVAL";
    case "FINANCE_APPROVED":  return "PENDING_APPROVAL";
    case "EXECUTIVE_APPROVED":return "PENDING_APPROVAL";
    case "PENDING_PAYROLL":   return "APPROVED";
    case "APPROVED":          return "APPROVED";
    case "CHANGES_REQUESTED": return "CHANGES_REQUESTED";
    case "REJECTED":          return "REJECTED";
    case "CANCELLED":         return "REJECTED";
    default:                  return "DRAFT";
  }
}

// Map ApprovalWorkflow.status (ApprovalStatus enum) — already compatible
// with CommissionEventApproval.status; just pass through.

async function main() {
  const deals = await prisma.deal.findMany({
    include: {
      approvalWorkflows: {
        orderBy: { approvalLevel: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${deals.length} Deal record(s) to process.`);

  let created = 0;
  let skipped = 0;
  let errors  = 0;

  for (const deal of deals) {
    try {
      // ── Idempotency guard ────────────────────────────────────────────────
      const existing = await prisma.commissionEvent.findFirst({
        where: {
          tenantId:      deal.tenantId,
          eventDataJson: { path: ["migratedFromDealId"], equals: deal.id },
        },
      });

      if (existing) {
        console.log(`  SKIP  ${deal.id} (${deal.dealName}) — already migrated → ${existing.id}`);
        skipped++;
        continue;
      }

      // ── Build eventDataJson ──────────────────────────────────────────────
      const dealMeta = (deal.metadata as Record<string, unknown> | null) ?? {};
      const eventDataJson: Record<string, unknown> = {
        ...dealMeta,
        customerName:        deal.customerName,
        dealType:            deal.dealType,
        grossProfitPercentage: deal.grossProfitPercentage,
        migratedFromDealId:  deal.id,
        ...(deal.contractStartDate && { contractStartDate: deal.contractStartDate.toISOString() }),
        ...(deal.contractEndDate   && { contractEndDate:   deal.contractEndDate.toISOString() }),
      };

      const approvalStatus = mapStatus(deal.status as string);

      // ── Resolve walletStatus ─────────────────────────────────────────────
      const walletStatus =
        approvalStatus === "APPROVED" ? "CREDITED"
        : approvalStatus === "PENDING_APPROVAL" ? "PENDING"
        : "PENDING";

      // ── Find industry template for this tenant ───────────────────────────
      const tic = await prisma.tenantIndustryConfig.findUnique({
        where: { tenantId: deal.tenantId },
        select: { industryTemplateId: true },
      });

      await prisma.$transaction(async (tx) => {
        // Create CommissionEvent
        const event = await tx.commissionEvent.create({
          data: {
            tenantId:                  deal.tenantId,
            salesExecutiveId:          deal.salesExecutiveId,
            ...(tic?.industryTemplateId && { industryTemplateId: tic.industryTemplateId }),
            eventTitle:                deal.dealName,
            eventType:                 deal.dealType as string,
            eventDataJson:             eventDataJson as any,
            revenueAmount:             deal.revenue,
            costAmount:                deal.cost,
            grossProfitAmount:         deal.grossProfit,
            commissionBaseAmount:      deal.grossProfit,
            commissionPercentage:      deal.commissionPercentage,
            calculatedCommissionAmount: deal.calculatedCommission,
            triggerStatus:             "NOT_TRIGGERED",
            approvalStatus,
            walletStatus,
            submittedAt:               deal.submittedAt ?? null,
            approvedAt:                approvalStatus === "APPROVED" ? deal.updatedAt : null,
            createdAt:                 deal.createdAt,
          },
        });

        // Migrate ApprovalWorkflow → CommissionEventApproval
        if (deal.approvalWorkflows.length > 0) {
          await tx.commissionEventApproval.createMany({
            data: deal.approvalWorkflows.map((aw) => ({
              tenantId:          deal.tenantId,
              commissionEventId: event.id,
              approvalStep:      aw.approvalLevel,
              stepName:          aw.stepName ?? null,
              approverRole:      aw.approverRole,
              approverUserId:    aw.approverUserId ?? null,
              status:            aw.status,
              comments:          aw.comments ?? null,
              approvedAt:        aw.approvedAt ?? null,
            })),
          });
        }

        console.log(`  OK    ${deal.id} (${deal.dealName}) → ${event.id} [${approvalStatus}] workflows=${deal.approvalWorkflows.length}`);
      });

      created++;
    } catch (err) {
      console.error(`  ERROR ${deal.id} (${deal.dealName}):`, err);
      errors++;
    }
  }

  console.log(`\nDone. created=${created}, skipped=${skipped}, errors=${errors}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
