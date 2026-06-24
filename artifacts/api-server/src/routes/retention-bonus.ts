import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function calcBonus(available: number, rate: number, minBalance: number, maxBalance: number | null): number {
  if (available < minBalance) return 0;
  const basis = maxBalance !== null ? Math.min(available, maxBalance) : available;
  return parseFloat((basis * (rate / 100 / 12)).toFixed(2));
}

// GET /api/retention-bonus/preview — sales exec sees their projected bonus this month
router.get("/preview", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId   = req.user!.userId;

    const [tenant, user, wallet] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.wallet.findUnique({ where: { userId } }),
    ]);

    if (!tenant || !user || !wallet) { res.json({ eligible: false, projected: 0 }); return; }

    const eligible =
      tenant.retentionBonusEnabled &&
      user.retentionBonusEnabled &&
      Number(wallet.availableBalance) >= tenant.retentionBonusMinBalance;

    const projected = eligible
      ? calcBonus(
          Number(wallet.availableBalance),
          tenant.retentionBonusAnnualRate,
          tenant.retentionBonusMinBalance,
          tenant.retentionBonusMaxBalance,
        )
      : 0;

    const month = currentMonth();
    const alreadyCredited = await prisma.retentionBonusLedger.findUnique({ where: { userId_month: { userId, month } } });

    res.json({
      eligible,
      projected,
      alreadyCreditedThisMonth: !!alreadyCredited,
      creditedAmount: alreadyCredited ? alreadyCredited.amount : 0,
      annualRate: tenant.retentionBonusAnnualRate,
      minBalance: tenant.retentionBonusMinBalance,
      maxBalance: tenant.retentionBonusMaxBalance ?? null,
      availableBalance: Number(wallet.availableBalance),
    });
  } catch (err) {
    logger.error({ err }, "RetentionBonusPreview error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/retention-bonus/accrue — admin/payroll triggers monthly accrual (idempotent)
router.post("/accrue", requireAuth, requireRole(...ADMIN_ROLES, "PAYROLL"), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const month    = (req.body.month as string | undefined) ?? currentMonth();

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    if (!tenant.retentionBonusEnabled) { res.status(400).json({ error: "Retention bonus is not enabled for this tenant" }); return; }

    const eligibleUsers = await prisma.user.findMany({
      where: { tenantId, retentionBonusEnabled: true, status: "ACTIVE", role: "SALES_EXECUTIVE" },
      include: { wallet: true },
    });

    const results: Array<{ userId: string; name: string; amount: number; skipped: boolean }> = [];

    for (const user of eligibleUsers) {
      if (!user.wallet) continue;
      const available = Number(user.wallet.availableBalance);
      const amount    = calcBonus(available, tenant.retentionBonusAnnualRate, tenant.retentionBonusMinBalance, tenant.retentionBonusMaxBalance);

      if (amount <= 0) {
        results.push({ userId: user.id, name: `${user.firstName} ${user.lastName}`, amount: 0, skipped: true });
        continue;
      }

      const existing = await prisma.retentionBonusLedger.findUnique({ where: { userId_month: { userId: user.id, month } } });
      if (existing) {
        results.push({ userId: user.id, name: `${user.firstName} ${user.lastName}`, amount: existing.amount, skipped: true });
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.retentionBonusLedger.create({
          data: { tenantId, userId: user.id, month, amount, rate: tenant.retentionBonusAnnualRate, basis: Math.min(available, tenant.retentionBonusMaxBalance ?? available) },
        });
        await tx.wallet.update({
          where: { id: user.wallet!.id },
          data:  { availableBalance: { increment: amount } },
        });
        await tx.walletTransaction.create({
          data: {
            tenantId,
            walletId:        user.wallet!.id,
            transactionType: "BALANCE_REWARD",
            amount,
            referenceType:   "RETENTION_BONUS",
            referenceId:     month,
            description:     `Retention bonus — ${month} (${tenant.retentionBonusAnnualRate}% p.a.)`,
          },
        });
        await tx.notification.create({
          data: {
            tenantId,
            userId:     user.id,
            title:      "Retention Bonus Credited",
            message:    `R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} retention bonus has been credited to your wallet for ${month}.`,
            type:       "WALLET_CREDITED",
            readStatus: false,
          },
        });
      });

      results.push({ userId: user.id, name: `${user.firstName} ${user.lastName}`, amount, skipped: false });
    }

    await prisma.auditLog.create({
      data: { tenantId, userId: req.user!.userId, action: "CREATE", entityType: "RetentionBonus", entityId: month, newValue: JSON.stringify({ month, credited: results.filter((r) => !r.skipped).length }) },
    });

    res.json({ month, results, credited: results.filter((r) => !r.skipped).length, skipped: results.filter((r) => r.skipped).length });
  } catch (err) {
    logger.error({ err }, "RetentionBonusAccrue error");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/retention-bonus/history — admin sees full ledger
router.get("/history", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const records = await prisma.retentionBonusLedger.findMany({
      where:   { tenantId: req.user!.tenantId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: [{ month: "desc" }, { creditedAt: "desc" }],
    });
    res.json(records.map((r) => ({
      id:          r.id,
      month:       r.month,
      amount:      r.amount,
      rate:        r.rate,
      basis:       r.basis,
      creditedAt:  r.creditedAt,
      userId:      r.userId,
      userName:    `${r.user.firstName} ${r.user.lastName}`,
      userEmail:   r.user.email,
    })));
  } catch (err) {
    logger.error({ err }, "RetentionBonusHistory error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as retentionBonusRouter };
