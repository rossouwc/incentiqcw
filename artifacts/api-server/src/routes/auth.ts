import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { generateToken, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function userToResponse(user: {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  avatarUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const { companyName, email, password, firstName, lastName } = req.body;
  if (!companyName || !email || !password || !firstName || !lastName) {
    res.status(400).json({ error: "All fields required" });
    return;
  }
  try {
    const baseSlug = slugify(companyName);
    let slug = baseSlug;
    let count = 0;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      count++;
      slug = `${baseSlug}-${count}`;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const tenant = await prisma.tenant.create({
      data: {
        name: companyName,
        slug,
        currency: "ZAR",
        taxRate: 0.25,
      },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        firstName,
        lastName,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    // Seed demo commission rules
    await prisma.commissionRule.createMany({
      data: [
        { tenantId: tenant.id, name: "Net New 10%", dealType: "NET_NEW", rateType: "PERCENTAGE", rateValue: 10, isActive: true },
        { tenantId: tenant.id, name: "Renewal 5%", dealType: "RENEWAL", rateType: "PERCENTAGE", rateValue: 5, isActive: true },
        { tenantId: tenant.id, name: "Upsell 7.5%", dealType: "UPSELL", rateType: "PERCENTAGE", rateValue: 7.5, isActive: true },
        { tenantId: tenant.id, name: "Cross-sell 6%", dealType: "CROSS_SELL", rateType: "PERCENTAGE", rateValue: 6, isActive: true },
      ],
    });

    // Seed demo deals and wallet transactions
    const now = new Date();
    const months = ["2023-12", "2024-01", "2024-02", "2024-03", "2024-04", "2024-05"];
    for (const m of months) {
      const commission = Math.round((8000 + Math.random() * 20000) * 100) / 100;
      await prisma.deal.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          dealName: `Demo Deal ${m}`,
          dealType: "NET_NEW",
          grossProfit: commission * 10,
          commission,
          status: "EXECUTIVE_APPROVED",
          closedAt: new Date(`${m}-15`),
        },
      });
      await prisma.transaction.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          type: "CREDIT",
          amount: commission,
          description: `Commission credited for ${m}`,
          createdAt: new Date(`${m}-15`),
        },
      });
    }

    // Seed current deals
    const dealSeeds = [
      { name: "ABC Technologies", type: "NET_NEW" as const, gp: 120000, commission: 12000, status: "EXECUTIVE_APPROVED" as const },
      { name: "XYZ Solutions Renewal", type: "RENEWAL" as const, gp: 80000, commission: 4000, status: "FINANCE_APPROVED" as const },
      { name: "LMN System Upgrade", type: "UPSELL" as const, gp: 60000, commission: 4500, status: "MANAGER_APPROVED" as const },
      { name: "OPQ Cross-sell", type: "CROSS_SELL" as const, gp: 40000, commission: 2400, status: "SUBMITTED" as const },
      { name: "RST New Contract", type: "NET_NEW" as const, gp: 200000, commission: 20000, status: "PENDING_APPROVAL" as const },
    ];
    for (const d of dealSeeds) {
      await prisma.deal.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          dealName: d.name,
          dealType: d.type,
          grossProfit: d.gp,
          commission: d.commission,
          status: d.status,
        },
      });
    }

    // Seed wallet credit
    await prisma.transaction.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        type: "CREDIT",
        amount: 12000,
        description: "Commission for ABC Technologies approved",
      },
    });

    // Seed notifications
    await prisma.notification.createMany({
      data: [
        { tenantId: tenant.id, userId: user.id, title: "Deal Approved", message: "Your deal ABC Technologies was approved by Executive Approver", isRead: false },
        { tenantId: tenant.id, userId: user.id, title: "Commission Moved", message: "Commission of R12,000.00 moved to your available balance", isRead: false },
        { tenantId: tenant.id, userId: user.id, title: "Payout Submitted", message: "Payout request of R20,000.00 submitted successfully", isRead: true },
      ],
    });

    // Seed pending approval
    const pendingDeal = await prisma.deal.findFirst({ where: { tenantId: tenant.id, dealName: "RST New Contract" } });
    if (pendingDeal) {
      await prisma.approval.create({
        data: {
          tenantId: tenant.id,
          type: "DEAL",
          referenceId: pendingDeal.id,
          referenceName: "RST New Contract",
          requestedById: user.id,
          status: "PENDING",
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: "CREATE",
        entity: "Tenant",
        entityId: tenant.id,
        metadata: JSON.stringify({ companyName }),
      },
    });

    const token = generateToken({ userId: user.id, tenantId: tenant.id, role: user.role, email: user.email });
    res.status(201).json({ token, user: userToResponse(user) });
  } catch (err) {
    logger.error({ err }, "Register error");
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = generateToken({ userId: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
    res.json({ token, user: userToResponse(user) });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userToResponse(user));
  } catch (err) {
    logger.error({ err }, "GetMe error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (_req: Request, res: Response) => {
  res.json({ message: "Logged out successfully" });
});

export { router as authRouter };
