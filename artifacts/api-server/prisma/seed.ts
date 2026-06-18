import { PrismaClient, UserRole, DealType, DealStatus, TransactionType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEFAULT_PW = "Password123!";
const hash = (pw: string) => bcrypt.hashSync(pw, 12);

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Tenant 1: System (for SuperAdmin) ─────────────────────────────────────
  const systemTenant = await prisma.tenant.upsert({
    where: { id: "system-tenant-001" },
    update: {},
    create: {
      id: "system-tenant-001",
      companyName: "CommissionWallet Platform",
      contactName: "Platform Admin",
      contactEmail: "superadmin@commissionwallet.co.za",
      status: "ACTIVE",
      subscriptionPlan: "ENTERPRISE",
    },
  });

  // ─── Tenant 2: TechSales ZA (existing demo) ─────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo-tenant-001" },
    update: {},
    create: {
      id: "demo-tenant-001",
      companyName: "TechSales ZA (Pty) Ltd",
      registrationNumber: "2021/123456/07",
      vatNumber: "4710123456",
      industry: "Technology",
      contactName: "Sarah Johnson",
      contactEmail: "admin@techsalesza.co.za",
      contactPhone: "+27 11 555 0100",
      status: "ACTIVE",
      subscriptionPlan: "PROFESSIONAL",
    },
  });

  // ─── Tenant 3: Demo Corp (demo.co.za users) ──────────────────────────────────
  const demoTenant = await prisma.tenant.upsert({
    where: { id: "demo-tenant-002" },
    update: {},
    create: {
      id: "demo-tenant-002",
      companyName: "Demo Corporation",
      registrationNumber: "2023/999999/07",
      vatNumber: "4799999999",
      industry: "Financial Services",
      contactName: "Demo Admin",
      contactEmail: "admin@demo.co.za",
      contactPhone: "+27 21 000 0000",
      status: "ACTIVE",
      subscriptionPlan: "PROFESSIONAL",
    },
  });

  console.log("✅ Tenants created:", 3);

  // ─── Users: System Tenant ───────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: "user-superadmin-001" },
    update: {},
    create: {
      id: "user-superadmin-001",
      tenantId: systemTenant.id,
      firstName: "Platform",
      lastName: "Admin",
      email: "superadmin@commissionwallet.co.za",
      passwordHash: hash(DEFAULT_PW),
      role: UserRole.SUPER_ADMIN,
      status: "ACTIVE",
    },
  });

  // ─── Users: TechSales ZA ────────────────────────────────────────────────────
  const techUsers = [
    { id: "user-admin-001",   firstName: "Sarah",   lastName: "Johnson",    email: "admin@techsalesza.co.za",    role: UserRole.ADMIN },
    { id: "user-manager-001", firstName: "Michael", lastName: "van Niekerk",email: "manager@techsalesza.co.za",  role: UserRole.MANAGER },
    { id: "user-finance-001", firstName: "Priya",   lastName: "Naidoo",     email: "finance@techsalesza.co.za",  role: UserRole.FINANCE },
    { id: "user-exec-001",    firstName: "James",   lastName: "Ndlovu",     email: "james@techsalesza.co.za",    role: UserRole.SALES_EXECUTIVE },
    { id: "user-exec-002",    firstName: "Nomsa",   lastName: "Dlamini",    email: "nomsa@techsalesza.co.za",    role: UserRole.SALES_EXECUTIVE },
    { id: "user-exec-003",    firstName: "Ruan",    lastName: "Botha",      email: "ruan@techsalesza.co.za",     role: UserRole.SALES_EXECUTIVE },
  ];
  const users: Record<string, any> = {};
  for (const u of techUsers) {
    users[u.id] = await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { ...u, tenantId: tenant.id, passwordHash: hash(DEFAULT_PW), status: "ACTIVE" },
    });
  }

  // ─── Users: Demo Corp ────────────────────────────────────────────────────────
  const demoUsers = [
    { id: "demo-admin-001",     firstName: "Alex",    lastName: "Demo",    email: "admin@demo.co.za",     role: UserRole.ADMIN },
    { id: "demo-sales-001",     firstName: "Sam",     lastName: "Sales",   email: "sales@demo.co.za",     role: UserRole.SALES_EXECUTIVE },
    { id: "demo-manager-001",   firstName: "Morgan",  lastName: "Manager", email: "manager@demo.co.za",   role: UserRole.MANAGER },
    { id: "demo-finance-001",   firstName: "Frances", lastName: "Finance", email: "finance@demo.co.za",   role: UserRole.FINANCE },
    { id: "demo-executive-001", firstName: "Eddie",   lastName: "Exec",    email: "executive@demo.co.za", role: UserRole.EXECUTIVE },
    { id: "demo-payroll-001",   firstName: "Pat",     lastName: "Payroll", email: "payroll@demo.co.za",   role: UserRole.PAYROLL },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { ...u, tenantId: demoTenant.id, passwordHash: hash(DEFAULT_PW), status: "ACTIVE" },
    });
  }

  console.log("✅ Users created:", 1 + techUsers.length + demoUsers.length);

  // ─── Commission Rules: TechSales ZA ────────────────────────────────────────
  const rulesData = [
    { id: "rule-001", ruleName: "Net New Standard",    dealType: DealType.NET_NEW,    commissionPercentage: 10, minGrossProfit: 0,      maxGrossProfit: 100000 },
    { id: "rule-002", ruleName: "Net New Premium",     dealType: DealType.NET_NEW,    commissionPercentage: 12, minGrossProfit: 100001, maxGrossProfit: null   },
    { id: "rule-003", ruleName: "Renewal Commission",  dealType: DealType.RENEWAL,    commissionPercentage: 5,  minGrossProfit: null,   maxGrossProfit: null   },
    { id: "rule-004", ruleName: "Upsell Commission",   dealType: DealType.UPSELL,     commissionPercentage: 7,  minGrossProfit: null,   maxGrossProfit: null   },
    { id: "rule-005", ruleName: "Cross-Sell Standard", dealType: DealType.CROSS_SELL, commissionPercentage: 6,  minGrossProfit: null,   maxGrossProfit: null   },
  ];
  for (const r of rulesData) {
    await prisma.commissionRule.upsert({
      where: { id: r.id },
      update: {},
      create: { ...r, tenantId: tenant.id, appliesToRole: UserRole.SALES_EXECUTIVE, effectiveFrom: new Date("2024-01-01"), status: "ACTIVE" },
    });
  }

  // ─── Commission Rules: Demo Corp ────────────────────────────────────────────
  const demoRules = [
    { id: "demo-rule-001", ruleName: "Net New Standard",   dealType: DealType.NET_NEW,    commissionPercentage: 8 },
    { id: "demo-rule-002", ruleName: "Renewal Commission", dealType: DealType.RENEWAL,    commissionPercentage: 4 },
    { id: "demo-rule-003", ruleName: "Upsell Commission",  dealType: DealType.UPSELL,     commissionPercentage: 6 },
    { id: "demo-rule-004", ruleName: "Cross-Sell",         dealType: DealType.CROSS_SELL, commissionPercentage: 5 },
  ];
  for (const r of demoRules) {
    await prisma.commissionRule.upsert({
      where: { id: r.id },
      update: {},
      create: { ...r, tenantId: demoTenant.id, minGrossProfit: null, maxGrossProfit: null, appliesToRole: UserRole.SALES_EXECUTIVE, effectiveFrom: new Date("2024-01-01"), status: "ACTIVE" },
    });
  }

  console.log("✅ Commission rules created");

  // ─── Wallets: TechSales ZA sales execs ─────────────────────────────────────
  const execIds = ["user-exec-001", "user-exec-002", "user-exec-003"];
  for (const uid of execIds) {
    await prisma.wallet.upsert({
      where: { userId: uid },
      update: {},
      create: { tenantId: tenant.id, userId: uid, availableBalance: 0, pendingBalance: 0, deferredBalance: 0, paidOutBalance: 0 },
    });
  }

  // ─── Wallet: Demo Corp sales exec ──────────────────────────────────────────
  await prisma.wallet.upsert({
    where: { userId: "demo-sales-001" },
    update: {},
    create: { tenantId: demoTenant.id, userId: "demo-sales-001", availableBalance: 18500, pendingBalance: 9200, deferredBalance: 0, paidOutBalance: 5000 },
  });

  // ─── Deals: TechSales ZA ───────────────────────────────────────────────────
  type DealSeed = {
    id: string; execId: string; customerName: string; dealName: string; dealType: DealType;
    revenue: number; cost: number; status: DealStatus; createdAt: Date; submittedAt?: Date;
  };

  const dealsData: DealSeed[] = [
    { id: "deal-001", execId: "user-exec-001", customerName: "ABC Technologies",    dealName: "ERP Cloud Migration",          dealType: DealType.NET_NEW,    revenue: 480000,  cost: 360000,  status: DealStatus.EXECUTIVE_APPROVED, createdAt: new Date("2024-03-10"), submittedAt: new Date("2024-03-11") },
    { id: "deal-002", execId: "user-exec-001", customerName: "XYZ Solutions",       dealName: "Annual Support Renewal",       dealType: DealType.RENEWAL,    revenue: 180000,  cost: 140000,  status: DealStatus.FINANCE_APPROVED,   createdAt: new Date("2024-04-02"), submittedAt: new Date("2024-04-03") },
    { id: "deal-003", execId: "user-exec-001", customerName: "LMN Systems",         dealName: "Security Suite Upsell",        dealType: DealType.UPSELL,     revenue: 240000,  cost: 180000,  status: DealStatus.MANAGER_APPROVED,   createdAt: new Date("2024-05-15"), submittedAt: new Date("2024-05-16") },
    { id: "deal-004", execId: "user-exec-001", customerName: "RST Industries",      dealName: "New Contract 2024",            dealType: DealType.NET_NEW,    revenue: 800000,  cost: 600000,  status: DealStatus.PENDING_APPROVAL,   createdAt: new Date("2024-06-01"), submittedAt: new Date("2024-06-01") },
    { id: "deal-005", execId: "user-exec-001", customerName: "Quantum Corp",        dealName: "Analytics Platform",           dealType: DealType.CROSS_SELL, revenue: 160000,  cost: 120000,  status: DealStatus.SUBMITTED,          createdAt: new Date("2024-06-08") },
    { id: "deal-006", execId: "user-exec-002", customerName: "First National Bank", dealName: "Banking Cloud Suite",          dealType: DealType.NET_NEW,    revenue: 1200000, cost: 900000,  status: DealStatus.EXECUTIVE_APPROVED, createdAt: new Date("2024-02-20"), submittedAt: new Date("2024-02-21") },
    { id: "deal-007", execId: "user-exec-002", customerName: "Shoprite Holdings",   dealName: "Retail Analytics Renewal",     dealType: DealType.RENEWAL,    revenue: 320000,  cost: 240000,  status: DealStatus.FINANCE_APPROVED,   createdAt: new Date("2024-04-10"), submittedAt: new Date("2024-04-11") },
    { id: "deal-008", execId: "user-exec-002", customerName: "MTN Group",           dealName: "AI Chatbot Implementation",    dealType: DealType.UPSELL,     revenue: 560000,  cost: 420000,  status: DealStatus.PENDING_APPROVAL,   createdAt: new Date("2024-06-05"), submittedAt: new Date("2024-06-06") },
    { id: "deal-009", execId: "user-exec-003", customerName: "Discovery Health",    dealName: "Insurance Platform",           dealType: DealType.NET_NEW,    revenue: 950000,  cost: 700000,  status: DealStatus.EXECUTIVE_APPROVED, createdAt: new Date("2024-01-15"), submittedAt: new Date("2024-01-16") },
    { id: "deal-010", execId: "user-exec-003", customerName: "Nedbank",             dealName: "Mobile Banking Renewal",       dealType: DealType.RENEWAL,    revenue: 280000,  cost: 210000,  status: DealStatus.REJECTED,           createdAt: new Date("2024-03-22"), submittedAt: new Date("2024-03-23") },
    { id: "deal-011", execId: "user-exec-003", customerName: "Transnet SOC",        dealName: "Logistics Management System",  dealType: DealType.NET_NEW,    revenue: 680000,  cost: 510000,  status: DealStatus.MANAGER_APPROVED,   createdAt: new Date("2024-05-28"), submittedAt: new Date("2024-05-29") },
  ];

  const commPct: Record<DealType, number> = { NET_NEW: 10, RENEWAL: 5, UPSELL: 7, CROSS_SELL: 6 };
  const createdDeals: Record<string, any> = {};
  for (const d of dealsData) {
    const gp = d.revenue - d.cost;
    const pct = commPct[d.dealType];
    const commission = Math.round(gp * (pct / 100) * 100) / 100;
    createdDeals[d.id] = await prisma.deal.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id, tenantId: tenant.id, salesExecutiveId: d.execId,
        submittedById: d.submittedAt ? d.execId : null,
        customerName: d.customerName, dealName: d.dealName, dealType: d.dealType,
        revenue: d.revenue, cost: d.cost, grossProfit: gp,
        grossProfitPercentage: Math.round((gp / d.revenue) * 10000) / 100,
        commissionPercentage: pct, calculatedCommission: commission,
        status: d.status, submittedAt: d.submittedAt ?? null,
        contractStartDate: d.submittedAt ?? null,
        contractEndDate: d.submittedAt ? new Date(d.submittedAt.getFullYear() + 1, d.submittedAt.getMonth(), d.submittedAt.getDate()) : null,
        createdAt: d.createdAt,
      },
    });
  }
  console.log("✅ Deals created:", Object.keys(createdDeals).length);

  // ─── Demo Corp Deals ────────────────────────────────────────────────────────
  const demoDeal = await prisma.deal.upsert({
    where: { id: "demo-deal-001" },
    update: {},
    create: {
      id: "demo-deal-001", tenantId: demoTenant.id, salesExecutiveId: "demo-sales-001",
      submittedById: "demo-sales-001", customerName: "Acme Financial",
      dealName: "Cloud ERP Implementation", dealType: DealType.NET_NEW,
      revenue: 350000, cost: 262500, grossProfit: 87500,
      grossProfitPercentage: 25, commissionPercentage: 8, calculatedCommission: 7000,
      status: DealStatus.EXECUTIVE_APPROVED, submittedAt: new Date("2024-05-01"),
      createdAt: new Date("2024-04-28"),
    },
  });

  const demoDeal2 = await prisma.deal.upsert({
    where: { id: "demo-deal-002" },
    update: {},
    create: {
      id: "demo-deal-002", tenantId: demoTenant.id, salesExecutiveId: "demo-sales-001",
      submittedById: "demo-sales-001", customerName: "Korridor",
      dealName: "2 x Developer Licences", dealType: DealType.NET_NEW,
      revenue: 180000, cost: 135000, grossProfit: 45000,
      grossProfitPercentage: 25, commissionPercentage: 8, calculatedCommission: 3600,
      status: DealStatus.APPROVED, submittedAt: new Date("2024-05-20"),
      createdAt: new Date("2024-05-18"),
    },
  });

  // ─── Approval Workflows ─────────────────────────────────────────────────────
  type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
  const approvedDeals = dealsData.filter(d =>
    [DealStatus.MANAGER_APPROVED, DealStatus.FINANCE_APPROVED, DealStatus.EXECUTIVE_APPROVED, DealStatus.PENDING_APPROVAL].includes(d.status)
  );
  for (const d of approvedDeals) {
    const deal = createdDeals[d.id];
    const statusMap: Record<DealStatus, { l1: ApprovalStatus; l2: ApprovalStatus; l3: ApprovalStatus }> = {
      [DealStatus.PENDING_APPROVAL]:   { l1: "PENDING",  l2: "PENDING",  l3: "PENDING"  },
      [DealStatus.MANAGER_APPROVED]:   { l1: "APPROVED", l2: "PENDING",  l3: "PENDING"  },
      [DealStatus.FINANCE_APPROVED]:   { l1: "APPROVED", l2: "APPROVED", l3: "PENDING"  },
      [DealStatus.EXECUTIVE_APPROVED]: { l1: "APPROVED", l2: "APPROVED", l3: "APPROVED" },
      [DealStatus.DRAFT]:              { l1: "PENDING",  l2: "PENDING",  l3: "PENDING"  },
      [DealStatus.SUBMITTED]:          { l1: "PENDING",  l2: "PENDING",  l3: "PENDING"  },
      [DealStatus.REJECTED]:           { l1: "REJECTED", l2: "PENDING",  l3: "PENDING"  },
      [DealStatus.CANCELLED]:          { l1: "PENDING",  l2: "PENDING",  l3: "PENDING"  },
    };
    const s = statusMap[d.status];
    const levels = [
      { level: 1, role: UserRole.MANAGER, approver: "user-manager-001", statusStr: s.l1 },
      { level: 2, role: UserRole.FINANCE, approver: "user-finance-001", statusStr: s.l2 },
      { level: 3, role: UserRole.ADMIN,   approver: "user-admin-001",   statusStr: s.l3 },
    ];
    for (const lv of levels) {
      await prisma.approvalWorkflow.upsert({
        where: { id: `aw-${d.id}-l${lv.level}` },
        update: {},
        create: {
          id: `aw-${d.id}-l${lv.level}`, tenantId: tenant.id, dealId: deal.id,
          approvalLevel: lv.level, approverRole: lv.role,
          approverUserId: lv.statusStr !== "PENDING" ? lv.approver : null,
          status: lv.statusStr as any,
          approvedAt: lv.statusStr === "APPROVED" ? new Date() : null,
        },
      });
    }
  }

  // Demo Corp approval workflow — Cloud ERP
  for (let lv = 1; lv <= 3; lv++) {
    await prisma.approvalWorkflow.upsert({
      where: { id: `aw-demo-deal-001-l${lv}` },
      update: {},
      create: {
        id: `aw-demo-deal-001-l${lv}`, tenantId: demoTenant.id, dealId: demoDeal.id,
        approvalLevel: lv,
        approverRole: lv === 1 ? UserRole.MANAGER : lv === 2 ? UserRole.FINANCE : UserRole.ADMIN,
        approverUserId: lv === 1 ? "demo-manager-001" : lv === 2 ? "demo-finance-001" : "demo-admin-001",
        status: "APPROVED" as any,
        approvedAt: new Date("2024-05-05"),
      },
    });
  }

  // Demo Corp approval workflow — Korridor (all 5 steps approved, sales exec confirmed R3 600)
  const korridorApprovers = [
    { lv: 1, role: UserRole.MANAGER,         uid: "demo-manager-001",   at: new Date("2024-05-22") },
    { lv: 2, role: UserRole.FINANCE,          uid: "demo-finance-001",   at: new Date("2024-05-23") },
    { lv: 3, role: UserRole.EXECUTIVE,        uid: "demo-executive-001", at: new Date("2024-05-24") },
    { lv: 4, role: UserRole.SALES_EXECUTIVE,  uid: "demo-sales-001",     at: new Date("2024-05-25") },
    { lv: 5, role: UserRole.PAYROLL,          uid: "demo-payroll-001",   at: new Date("2024-05-28") },
  ];
  for (const a of korridorApprovers) {
    await prisma.approvalWorkflow.upsert({
      where: { id: `aw-demo-deal-002-l${a.lv}` },
      update: {},
      create: {
        id: `aw-demo-deal-002-l${a.lv}`, tenantId: demoTenant.id, dealId: demoDeal2.id,
        approvalLevel: a.lv, approverRole: a.role, approverUserId: a.uid,
        status: "APPROVED" as any, approvedAt: a.at,
        payoutAmount: a.role === UserRole.SALES_EXECUTIVE ? 3600 : null,
      },
    });
  }
  console.log("✅ Approval workflows created");

  // ─── Wallet Balances & Transactions ─────────────────────────────────────────
  const walletCredits: Record<string, { available: number; pending: number; deferred: number; paid: number }> = {
    "user-exec-001": { available: 0, pending: 0, deferred: 0, paid: 0 },
    "user-exec-002": { available: 0, pending: 0, deferred: 0, paid: 0 },
    "user-exec-003": { available: 0, pending: 0, deferred: 0, paid: 0 },
  };
  for (const d of dealsData) {
    if (!walletCredits[d.execId]) continue;
    const deal = createdDeals[d.id];
    const w = walletCredits[d.execId];
    if (d.status === DealStatus.EXECUTIVE_APPROVED)     w.available += deal.calculatedCommission;
    else if ([DealStatus.PENDING_APPROVAL, DealStatus.SUBMITTED].includes(d.status)) w.pending += deal.calculatedCommission;
    else if ([DealStatus.MANAGER_APPROVED, DealStatus.FINANCE_APPROVED].includes(d.status)) w.deferred += deal.calculatedCommission;
  }
  for (const [uid, bal] of Object.entries(walletCredits)) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: uid } });
    if (!wallet) continue;
    await prisma.wallet.update({
      where: { userId: uid },
      data: {
        availableBalance: Math.round(bal.available * 100) / 100,
        pendingBalance:   Math.round(bal.pending  * 100) / 100,
        deferredBalance:  Math.round(bal.deferred * 100) / 100,
        paidOutBalance:   0,
      },
    });
    const userDeals = dealsData.filter(d => d.execId === uid && d.status === DealStatus.EXECUTIVE_APPROVED);
    for (const d of userDeals) {
      const deal = createdDeals[d.id];
      await prisma.walletTransaction.upsert({
        where: { id: `wt-${d.id}` },
        update: {},
        create: {
          id: `wt-${d.id}`, tenantId: tenant.id, walletId: wallet.id,
          transactionType: TransactionType.CREDIT,
          amount: deal.calculatedCommission,
          referenceType: "DEAL", referenceId: deal.id,
          description: `Commission for ${deal.dealName}`,
          createdAt: d.submittedAt!,
        },
      });
    }
  }

  // Demo Corp wallet transactions
  const demoWallet = await prisma.wallet.findUnique({ where: { userId: "demo-sales-001" } });
  if (demoWallet) {
    await prisma.walletTransaction.upsert({
      where: { id: "wt-demo-deal-001" },
      update: {},
      create: {
        id: "wt-demo-deal-001", tenantId: demoTenant.id, walletId: demoWallet.id,
        transactionType: TransactionType.CREDIT,
        amount: 7000, referenceType: "DEAL", referenceId: demoDeal.id,
        description: "Commission for Cloud ERP Implementation",
        createdAt: new Date("2024-05-05"),
      },
    });
    await prisma.walletTransaction.upsert({
      where: { id: "wt-demo-deal-002" },
      update: {},
      create: {
        id: "wt-demo-deal-002", tenantId: demoTenant.id, walletId: demoWallet.id,
        transactionType: TransactionType.COMMISSION_APPROVED,
        amount: 3600, referenceType: "DEAL", referenceId: demoDeal2.id,
        description: "Commission approved: 2 x Developer Licences",
        createdAt: new Date("2024-05-24"),
      },
    });
    // Korridor payout was paid out — deduct from available
    await prisma.walletTransaction.upsert({
      where: { id: "wt-demo-deal-002-payout" },
      update: {},
      create: {
        id: "wt-demo-deal-002-payout", tenantId: demoTenant.id, walletId: demoWallet.id,
        transactionType: TransactionType.PAYOUT_PAID,
        amount: 3600, referenceType: "PAYOUT", referenceId: "pr-demo-002",
        description: "Salary payout: 2 x Developer Licences (Korridor)",
        createdAt: new Date("2024-05-31"),
      },
    });
    // Update wallet to reflect the Korridor commission was paid out
    await prisma.wallet.update({
      where: { id: demoWallet.id },
      data: {
        availableBalance: { decrement: 3600 },
        paidOutBalance: { increment: 3600 },
      },
    });
  }
  console.log("✅ Wallets and transactions updated");

  // ─── Tax Profiles ───────────────────────────────────────────────────────────
  const taxData = [
    { uid: "user-exec-001", monthlySalary: 55000, medical: 1500, retirement: 5500 },
    { uid: "user-exec-002", monthlySalary: 62000, medical: 2250, retirement: 6200 },
    { uid: "user-exec-003", monthlySalary: 48000, medical: 1500, retirement: 4800 },
    { uid: "demo-sales-001",monthlySalary: 42000, medical: 1000, retirement: 4200 },
  ];
  for (const t of taxData) {
    const tenantId = t.uid.startsWith("demo") ? demoTenant.id : tenant.id;
    await prisma.taxProfile.upsert({
      where: { userId: t.uid },
      update: {},
      create: {
        tenantId, userId: t.uid,
        monthlySalary: t.monthlySalary, annualSalary: t.monthlySalary * 12,
        taxYear: 2024, medicalAidCredits: t.medical, retirementContribution: t.retirement,
      },
    });
  }
  console.log("✅ Tax profiles created");

  // ─── Payout Requests ────────────────────────────────────────────────────────
  await prisma.payoutRequest.upsert({
    where: { id: "pr-001" },
    update: {},
    create: {
      id: "pr-001", tenantId: tenant.id, userId: "user-exec-001",
      requestedAmount: 25000, estimatedTax: 6250, estimatedNetPayout: 18750,
      payoutMonth: "2024-06", status: "PENDING", requestedAt: new Date("2024-06-10"),
    },
  });
  await prisma.payoutRequest.upsert({
    where: { id: "pr-002" },
    update: {},
    create: {
      id: "pr-002", tenantId: tenant.id, userId: "user-exec-002",
      requestedAmount: 45000, estimatedTax: 11250, estimatedNetPayout: 33750,
      payoutMonth: "2024-05", status: "FINANCE_APPROVED",
      requestedAt: new Date("2024-05-28"), approvedAt: new Date("2024-06-02"),
    },
  });
  await prisma.payoutRequest.upsert({
    where: { id: "pr-demo-001" },
    update: {},
    create: {
      id: "pr-demo-001", tenantId: demoTenant.id, userId: "demo-sales-001",
      requestedAmount: 5000, estimatedTax: 1250, estimatedNetPayout: 3750,
      payoutMonth: "2024-06", status: "PENDING", requestedAt: new Date("2024-06-12"),
    },
  });
  await prisma.payoutRequest.upsert({
    where: { id: "pr-demo-002" },
    update: {},
    create: {
      id: "pr-demo-002", tenantId: demoTenant.id, userId: "demo-sales-001",
      requestedAmount: 3600, estimatedTax: 900, estimatedNetPayout: 2700,
      payoutMonth: "2024-05", status: "PAID",
      requestedAt: new Date("2024-05-25"), approvedAt: new Date("2024-05-27"), paidAt: new Date("2024-05-31"),
    },
  });
  console.log("✅ Payout requests created");

  // ─── Notifications ──────────────────────────────────────────────────────────
  const notifs = [
    { userId: "user-exec-001",    title: "Deal Approved",              message: "Your deal 'ERP Cloud Migration' has been fully approved",             type: "DEAL_APPROVED",     readStatus: false, tenantId: tenant.id },
    { userId: "user-exec-001",    title: "Wallet Credited",            message: "Commission of R12,000.00 has been credited to your wallet",           type: "WALLET_CREDITED",   readStatus: false, tenantId: tenant.id },
    { userId: "user-exec-001",    title: "Payout Request Submitted",   message: "Your payout request of R25,000.00 for June 2024 is under review",     type: "PAYOUT_REQUESTED",  readStatus: true,  tenantId: tenant.id },
    { userId: "user-exec-002",    title: "Deal Approved",              message: "Your deal 'Banking Cloud Suite' has been fully approved",             type: "DEAL_APPROVED",     readStatus: false, tenantId: tenant.id },
    { userId: "user-exec-002",    title: "Payout Approved",            message: "Your payout request for May 2024 has been approved by Finance",       type: "PAYOUT_APPROVED",   readStatus: false, tenantId: tenant.id },
    { userId: "user-manager-001", title: "New Approval Required",      message: "RST Industries deal 'New Contract 2024' awaits your approval",        type: "DEAL_SUBMITTED",    readStatus: false, tenantId: tenant.id },
    { userId: "user-finance-001", title: "New Approval Required",      message: "Payout request from James Ndlovu requires finance review",            type: "PAYOUT_REQUESTED",  readStatus: false, tenantId: tenant.id },
    { userId: "demo-sales-001",   title: "Deal Approved",              message: "Your deal 'Cloud ERP Implementation' has been fully approved",        type: "DEAL_APPROVED",     readStatus: false, tenantId: demoTenant.id },
    { userId: "demo-sales-001",   title: "Commission Credited",        message: "R3 600.00 commission for 2 x Developer Licences (Korridor) credited to your wallet", type: "WALLET_CREDITED", readStatus: true, tenantId: demoTenant.id },
    { userId: "demo-sales-001",   title: "Payout Paid",                message: "Your payout of R3 600.00 for May 2024 has been processed and paid",              type: "PAYOUT_PAID",       readStatus: true,  tenantId: demoTenant.id },
    { userId: "demo-admin-001",   title: "Welcome to Incentiq!",       message: "Demo Corporation account is active. Explore the platform features.",  type: "SYSTEM",            readStatus: false, tenantId: demoTenant.id },
  ];
  for (const n of notifs) {
    await prisma.notification.create({
      data: { tenantId: n.tenantId, userId: n.userId, title: n.title, message: n.message, type: n.type as any, readStatus: n.readStatus },
    });
  }
  console.log("✅ Notifications created");

  // ─── Commission Rule Groups: TechSales ZA ──────────────────────────────────
  const groupsData = [
    {
      id: "group-001",
      groupName: "Enterprise Team",
      description: "High-value deal rules for enterprise sales executives",
      assignToAll: false,
      ruleIds: ["rule-002", "rule-003", "rule-004"],
      memberUserIds: ["user-exec-001", "user-exec-002"],
    },
    {
      id: "group-002",
      groupName: "SMB Team",
      description: "Standard commission rules for SMB-focused sales reps",
      assignToAll: false,
      ruleIds: ["rule-001", "rule-003", "rule-005"],
      memberUserIds: ["user-exec-003"],
    },
    {
      id: "group-003",
      groupName: "Default (All Executives)",
      description: "Baseline rules that apply to all sales executives",
      assignToAll: true,
      ruleIds: ["rule-001", "rule-003"],
      memberUserIds: [],
    },
  ];
  for (const g of groupsData) {
    const existing = await prisma.commissionRuleGroup.findUnique({ where: { id: g.id } });
    if (!existing) {
      await prisma.commissionRuleGroup.create({
        data: {
          id: g.id,
          tenantId: tenant.id,
          groupName: g.groupName,
          description: g.description,
          assignToAll: g.assignToAll,
          status: "ACTIVE",
          rules: { create: g.ruleIds.map(ruleId => ({ ruleId })) },
          members: { create: g.memberUserIds.map(userId => ({ userId })) },
        },
      });
    }
  }

  // ─── Commission Rule Groups: Demo Corp ──────────────────────────────────────
  const demoGroupsData = [
    {
      id: "demo-group-001",
      groupName: "Standard (All Reps)",
      description: "Default commission structure for all sales executives",
      assignToAll: true,
      ruleIds: ["demo-rule-001", "demo-rule-002"],
      memberUserIds: [],
    },
  ];
  for (const g of demoGroupsData) {
    const existing = await prisma.commissionRuleGroup.findUnique({ where: { id: g.id } });
    if (!existing) {
      await prisma.commissionRuleGroup.create({
        data: {
          id: g.id,
          tenantId: demoTenant.id,
          groupName: g.groupName,
          description: g.description,
          assignToAll: g.assignToAll,
          status: "ACTIVE",
          rules: { create: g.ruleIds.map(ruleId => ({ ruleId })) },
          members: { create: g.memberUserIds.map(userId => ({ userId })) },
        },
      });
    }
  }
  console.log("✅ Commission rule groups created");

  // ─── Audit Logs ─────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({ data: [
    { tenantId: tenant.id,     userId: "user-admin-001",   action: "CREATE",  entityType: "Tenant", entityId: tenant.id,     newValue: JSON.stringify({ companyName: tenant.companyName }) },
    { tenantId: tenant.id,     userId: "user-exec-001",    action: "SUBMIT",  entityType: "Deal",   entityId: "deal-001",    newValue: JSON.stringify({ status: "SUBMITTED" }) },
    { tenantId: tenant.id,     userId: "user-manager-001", action: "APPROVE", entityType: "Deal",   entityId: "deal-001",    oldValue: JSON.stringify({ status: "PENDING_APPROVAL" }),   newValue: JSON.stringify({ status: "MANAGER_APPROVED" }) },
    { tenantId: tenant.id,     userId: "user-finance-001", action: "APPROVE", entityType: "Deal",   entityId: "deal-001",    oldValue: JSON.stringify({ status: "MANAGER_APPROVED" }),   newValue: JSON.stringify({ status: "FINANCE_APPROVED" }) },
    { tenantId: tenant.id,     userId: "user-admin-001",   action: "APPROVE", entityType: "Deal",   entityId: "deal-001",    oldValue: JSON.stringify({ status: "FINANCE_APPROVED" }),   newValue: JSON.stringify({ status: "EXECUTIVE_APPROVED" }) },
    { tenantId: demoTenant.id, userId: "demo-admin-001",   action: "CREATE",  entityType: "Tenant", entityId: demoTenant.id, newValue: JSON.stringify({ companyName: demoTenant.companyName }) },
  ]});
  console.log("✅ Audit logs created");

  // ─── Industry Templates ──────────────────────────────────────────────────────
  const industryTemplates = [
    {
      id: "ind-tmpl-001",
      code: "IT_CONSULTING",
      name: "IT Consulting",
      description: "Software, managed services, and technology consulting companies tracking contract-based commission on closed deals.",
    },
    {
      id: "ind-tmpl-002",
      code: "RECRUITMENT",
      name: "Recruitment",
      description: "Staffing and recruitment agencies earning placement fees when a candidate successfully starts with a client.",
    },
    {
      id: "ind-tmpl-003",
      code: "INSURANCE",
      name: "Insurance",
      description: "Insurance brokers and agents earning commission on new policies once the policy is active and the first premium is collected.",
    },
    {
      id: "ind-tmpl-004",
      code: "VEHICLE_DEALERSHIP",
      name: "Vehicle Dealership",
      description: "Motor vehicle dealers tracking commission per unit sold, triggered when the vehicle is delivered to the buyer.",
    },
    {
      id: "ind-tmpl-005",
      code: "PROPERTY_SALES",
      name: "Property Sales",
      description: "Real estate agents and agencies earning commission on property sales, triggered upon transfer registration.",
    },
    {
      id: "ind-tmpl-006",
      code: "RENTAL_MANAGEMENT",
      name: "Rental Management",
      description: "Property rental agents earning commission on new leases, triggered when the lease is signed or the first rental is collected.",
    },
    {
      id: "ind-tmpl-007",
      code: "TELECOM",
      name: "Telecom",
      description: "Telecommunications sales agents earning commission on new service activations and contract upgrades.",
    },
    {
      id: "ind-tmpl-008",
      code: "SAAS",
      name: "SaaS",
      description: "Software-as-a-Service companies tracking commission on new subscriptions and expansions when the customer is activated.",
    },
    {
      id: "ind-tmpl-009",
      code: "CUSTOM",
      name: "Custom",
      description: "Fully configurable industry for organisations with unique commission structures not covered by the standard templates.",
    },
  ];

  for (const tmpl of industryTemplates) {
    await prisma.industryTemplate.upsert({
      where: { code: tmpl.code },
      update: { name: tmpl.name, description: tmpl.description, isActive: true },
      create: { id: tmpl.id, code: tmpl.code, name: tmpl.name, description: tmpl.description, isActive: true },
    });
  }
  console.log("✅ Industry templates created:", industryTemplates.length);

  // ─── Deal Field Definitions ──────────────────────────────────────────────────
  type FieldDef = {
    id: string;
    industryTemplateId: string;
    fieldKey: string;
    fieldLabel: string;
    fieldType: string;
    isRequired: boolean;
    displayOrder: number;
    calculationRole?: string | null;
    optionsJson?: string[] | null;
    isActive?: boolean;
  };

  const fieldDefs: FieldDef[] = [
    // ── IT Consulting ──────────────────────────────────────────────────────────
    { id: "fld-itc-001", industryTemplateId: "ind-tmpl-001", fieldKey: "customerName",          fieldLabel: "Customer Name",          fieldType: "text",       isRequired: true,  displayOrder: 1  },
    { id: "fld-itc-002", industryTemplateId: "ind-tmpl-001", fieldKey: "opportunityName",        fieldLabel: "Opportunity Name",        fieldType: "text",       isRequired: true,  displayOrder: 2  },
    { id: "fld-itc-003", industryTemplateId: "ind-tmpl-001", fieldKey: "projectStartDate",       fieldLabel: "Project Start Date",      fieldType: "date",       isRequired: true,  displayOrder: 3  },
    { id: "fld-itc-004", industryTemplateId: "ind-tmpl-001", fieldKey: "projectEndDate",         fieldLabel: "Project End Date",        fieldType: "date",       isRequired: true,  displayOrder: 4  },
    { id: "fld-itc-005", industryTemplateId: "ind-tmpl-001", fieldKey: "revenue",                fieldLabel: "Revenue",                 fieldType: "currency",   isRequired: true,  displayOrder: 5,  calculationRole: "REVENUE" },
    { id: "fld-itc-006", industryTemplateId: "ind-tmpl-001", fieldKey: "costOfSale",             fieldLabel: "Cost of Sale",            fieldType: "currency",   isRequired: true,  displayOrder: 6,  calculationRole: "COST" },
    { id: "fld-itc-007", industryTemplateId: "ind-tmpl-001", fieldKey: "grossProfit",            fieldLabel: "Gross Profit",            fieldType: "calculated", isRequired: false, displayOrder: 7  },
    { id: "fld-itc-008", industryTemplateId: "ind-tmpl-001", fieldKey: "grossProfitPercentage",  fieldLabel: "Gross Profit %",          fieldType: "calculated", isRequired: false, displayOrder: 8  },
    { id: "fld-itc-009", industryTemplateId: "ind-tmpl-001", fieldKey: "dealType",               fieldLabel: "Deal Type",               fieldType: "select",     isRequired: true,  displayOrder: 9,  optionsJson: ["Net New", "Renewal", "Upsell", "Cross-sell"] },

    // ── Recruitment ────────────────────────────────────────────────────────────
    { id: "fld-rec-001", industryTemplateId: "ind-tmpl-002", fieldKey: "clientName",             fieldLabel: "Client Name",             fieldType: "text",       isRequired: true,  displayOrder: 1  },
    { id: "fld-rec-002", industryTemplateId: "ind-tmpl-002", fieldKey: "candidateName",          fieldLabel: "Candidate Name",          fieldType: "text",       isRequired: true,  displayOrder: 2  },
    { id: "fld-rec-003", industryTemplateId: "ind-tmpl-002", fieldKey: "placementType",          fieldLabel: "Placement Type",          fieldType: "select",     isRequired: true,  displayOrder: 3,  optionsJson: ["Permanent", "Contract"] },
    { id: "fld-rec-004", industryTemplateId: "ind-tmpl-002", fieldKey: "startDate",              fieldLabel: "Start Date",              fieldType: "date",       isRequired: true,  displayOrder: 4  },
    { id: "fld-rec-005", industryTemplateId: "ind-tmpl-002", fieldKey: "annualSalary",           fieldLabel: "Annual Salary",           fieldType: "currency",   isRequired: false, displayOrder: 5  },
    { id: "fld-rec-006", industryTemplateId: "ind-tmpl-002", fieldKey: "placementFeePercentage", fieldLabel: "Placement Fee %",         fieldType: "percentage", isRequired: false, displayOrder: 6  },
    { id: "fld-rec-007", industryTemplateId: "ind-tmpl-002", fieldKey: "placementFee",           fieldLabel: "Placement Fee",           fieldType: "currency",   isRequired: false, displayOrder: 7,  calculationRole: "REVENUE" },
    { id: "fld-rec-008", industryTemplateId: "ind-tmpl-002", fieldKey: "monthlyBillRate",        fieldLabel: "Monthly Bill Rate",       fieldType: "currency",   isRequired: false, displayOrder: 8  },
    { id: "fld-rec-009", industryTemplateId: "ind-tmpl-002", fieldKey: "monthlyCost",            fieldLabel: "Monthly Cost",            fieldType: "currency",   isRequired: false, displayOrder: 9  },
    { id: "fld-rec-010", industryTemplateId: "ind-tmpl-002", fieldKey: "monthlyGrossProfit",     fieldLabel: "Monthly Gross Profit",    fieldType: "calculated", isRequired: false, displayOrder: 10 },
    { id: "fld-rec-011", industryTemplateId: "ind-tmpl-002", fieldKey: "guaranteePeriodDays",    fieldLabel: "Guarantee Period (days)", fieldType: "number",     isRequired: false, displayOrder: 11 },

    // ── Insurance ──────────────────────────────────────────────────────────────
    { id: "fld-ins-001", industryTemplateId: "ind-tmpl-003", fieldKey: "clientName",             fieldLabel: "Client Name",             fieldType: "text",       isRequired: true,  displayOrder: 1  },
    { id: "fld-ins-002", industryTemplateId: "ind-tmpl-003", fieldKey: "policyNumber",           fieldLabel: "Policy Number",           fieldType: "text",       isRequired: false, displayOrder: 2  },
    { id: "fld-ins-003", industryTemplateId: "ind-tmpl-003", fieldKey: "productType",            fieldLabel: "Product Type",            fieldType: "select",     isRequired: true,  displayOrder: 3,  optionsJson: ["Life Cover", "Short-Term", "Funeral", "Investment", "Medical"] },
    { id: "fld-ins-004", industryTemplateId: "ind-tmpl-003", fieldKey: "insurerName",            fieldLabel: "Insurer Name",            fieldType: "text",       isRequired: true,  displayOrder: 4  },
    { id: "fld-ins-005", industryTemplateId: "ind-tmpl-003", fieldKey: "monthlyPremium",         fieldLabel: "Monthly Premium",         fieldType: "currency",   isRequired: true,  displayOrder: 5,  calculationRole: "REVENUE" },
    { id: "fld-ins-006", industryTemplateId: "ind-tmpl-003", fieldKey: "annualPremium",          fieldLabel: "Annual Premium",          fieldType: "calculated", isRequired: false, displayOrder: 6  },
    { id: "fld-ins-007", industryTemplateId: "ind-tmpl-003", fieldKey: "commissionType",         fieldLabel: "Commission Type",         fieldType: "select",     isRequired: true,  displayOrder: 7,  optionsJson: ["Upfront", "Ongoing", "Hybrid"] },
    { id: "fld-ins-008", industryTemplateId: "ind-tmpl-003", fieldKey: "policyStartDate",        fieldLabel: "Policy Start Date",       fieldType: "date",       isRequired: true,  displayOrder: 8  },
    { id: "fld-ins-009", industryTemplateId: "ind-tmpl-003", fieldKey: "firstPremiumCollected",  fieldLabel: "First Premium Collected", fieldType: "boolean",    isRequired: true,  displayOrder: 9  },

    // ── Vehicle Dealership ─────────────────────────────────────────────────────
    { id: "fld-veh-001", industryTemplateId: "ind-tmpl-004", fieldKey: "customerName",           fieldLabel: "Customer Name",           fieldType: "text",       isRequired: true,  displayOrder: 1  },
    { id: "fld-veh-002", industryTemplateId: "ind-tmpl-004", fieldKey: "vehicleMake",            fieldLabel: "Vehicle Make",            fieldType: "text",       isRequired: true,  displayOrder: 2  },
    { id: "fld-veh-003", industryTemplateId: "ind-tmpl-004", fieldKey: "vehicleModel",           fieldLabel: "Vehicle Model",           fieldType: "text",       isRequired: true,  displayOrder: 3  },
    { id: "fld-veh-004", industryTemplateId: "ind-tmpl-004", fieldKey: "vehicleYear",            fieldLabel: "Vehicle Year",            fieldType: "number",     isRequired: false, displayOrder: 4  },
    { id: "fld-veh-005", industryTemplateId: "ind-tmpl-004", fieldKey: "vinNumber",              fieldLabel: "VIN Number",              fieldType: "text",       isRequired: false, displayOrder: 5  },
    { id: "fld-veh-006", industryTemplateId: "ind-tmpl-004", fieldKey: "salePrice",              fieldLabel: "Sale Price",              fieldType: "currency",   isRequired: true,  displayOrder: 6,  calculationRole: "REVENUE" },
    { id: "fld-veh-007", industryTemplateId: "ind-tmpl-004", fieldKey: "costPrice",              fieldLabel: "Cost Price",              fieldType: "currency",   isRequired: true,  displayOrder: 7,  calculationRole: "COST" },
    { id: "fld-veh-008", industryTemplateId: "ind-tmpl-004", fieldKey: "vehicleGrossProfit",     fieldLabel: "Gross Profit",            fieldType: "calculated", isRequired: false, displayOrder: 8  },
    { id: "fld-veh-009", industryTemplateId: "ind-tmpl-004", fieldKey: "financeDealIncluded",    fieldLabel: "Finance Deal Included",   fieldType: "boolean",    isRequired: false, displayOrder: 9  },
    { id: "fld-veh-010", industryTemplateId: "ind-tmpl-004", fieldKey: "financeCommissionAmount",fieldLabel: "Finance Commission",      fieldType: "currency",   isRequired: false, displayOrder: 10 },
    { id: "fld-veh-011", industryTemplateId: "ind-tmpl-004", fieldKey: "insuranceProductSold",   fieldLabel: "Insurance Product Sold",  fieldType: "boolean",    isRequired: false, displayOrder: 11 },
    { id: "fld-veh-012", industryTemplateId: "ind-tmpl-004", fieldKey: "warrantySold",           fieldLabel: "Warranty Sold",           fieldType: "boolean",    isRequired: false, displayOrder: 12 },
    { id: "fld-veh-013", industryTemplateId: "ind-tmpl-004", fieldKey: "deliveryDate",           fieldLabel: "Delivery Date",           fieldType: "date",       isRequired: true,  displayOrder: 13 },

    // ── Property Sales ─────────────────────────────────────────────────────────
    { id: "fld-prp-001", industryTemplateId: "ind-tmpl-005", fieldKey: "sellerName",                  fieldLabel: "Seller Name",                   fieldType: "text",       isRequired: true,  displayOrder: 1 },
    { id: "fld-prp-002", industryTemplateId: "ind-tmpl-005", fieldKey: "buyerName",                   fieldLabel: "Buyer Name",                    fieldType: "text",       isRequired: true,  displayOrder: 2 },
    { id: "fld-prp-003", industryTemplateId: "ind-tmpl-005", fieldKey: "propertyAddress",             fieldLabel: "Property Address",              fieldType: "text",       isRequired: true,  displayOrder: 3 },
    { id: "fld-prp-004", industryTemplateId: "ind-tmpl-005", fieldKey: "salePrice",                   fieldLabel: "Sale Price",                    fieldType: "currency",   isRequired: true,  displayOrder: 4, calculationRole: "REVENUE" },
    { id: "fld-prp-005", industryTemplateId: "ind-tmpl-005", fieldKey: "agencyCommissionPercentage",  fieldLabel: "Agency Commission %",           fieldType: "percentage", isRequired: true,  displayOrder: 5 },
    { id: "fld-prp-006", industryTemplateId: "ind-tmpl-005", fieldKey: "agencyCommissionAmount",      fieldLabel: "Agency Commission Amount",      fieldType: "calculated", isRequired: false, displayOrder: 6 },
    { id: "fld-prp-007", industryTemplateId: "ind-tmpl-005", fieldKey: "agentSplitPercentage",        fieldLabel: "Agent Split %",                 fieldType: "percentage", isRequired: true,  displayOrder: 7 },
    { id: "fld-prp-008", industryTemplateId: "ind-tmpl-005", fieldKey: "transferDate",                fieldLabel: "Transfer Date",                 fieldType: "date",       isRequired: false, displayOrder: 8 },
    { id: "fld-prp-009", industryTemplateId: "ind-tmpl-005", fieldKey: "saleStatus",                  fieldLabel: "Sale Status",                   fieldType: "select",     isRequired: true,  displayOrder: 9, optionsJson: ["Offer Accepted", "Bond Approved", "Transfer Registered"] },

    // ── Rental Management ──────────────────────────────────────────────────────
    { id: "fld-rnt-001", industryTemplateId: "ind-tmpl-006", fieldKey: "landlordName",           fieldLabel: "Landlord Name",           fieldType: "text",       isRequired: true,  displayOrder: 1 },
    { id: "fld-rnt-002", industryTemplateId: "ind-tmpl-006", fieldKey: "tenantName",             fieldLabel: "Tenant Name",             fieldType: "text",       isRequired: true,  displayOrder: 2 },
    { id: "fld-rnt-003", industryTemplateId: "ind-tmpl-006", fieldKey: "propertyAddress",        fieldLabel: "Property Address",        fieldType: "text",       isRequired: true,  displayOrder: 3 },
    { id: "fld-rnt-004", industryTemplateId: "ind-tmpl-006", fieldKey: "monthlyRental",          fieldLabel: "Monthly Rental",          fieldType: "currency",   isRequired: true,  displayOrder: 4, calculationRole: "REVENUE" },
    { id: "fld-rnt-005", industryTemplateId: "ind-tmpl-006", fieldKey: "leaseTermMonths",        fieldLabel: "Lease Term (months)",     fieldType: "number",     isRequired: true,  displayOrder: 5 },
    { id: "fld-rnt-006", industryTemplateId: "ind-tmpl-006", fieldKey: "placementFeeType",       fieldLabel: "Placement Fee Type",      fieldType: "select",     isRequired: true,  displayOrder: 6, optionsJson: ["One Month Rental", "Percentage of Annual Rental", "Fixed Fee"] },
    { id: "fld-rnt-007", industryTemplateId: "ind-tmpl-006", fieldKey: "managementFeePercentage",fieldLabel: "Management Fee %",        fieldType: "percentage", isRequired: false, displayOrder: 7 },
    { id: "fld-rnt-008", industryTemplateId: "ind-tmpl-006", fieldKey: "leaseStartDate",         fieldLabel: "Lease Start Date",        fieldType: "date",       isRequired: true,  displayOrder: 8 },
    { id: "fld-rnt-009", industryTemplateId: "ind-tmpl-006", fieldKey: "firstRentalCollected",   fieldLabel: "First Rental Collected",  fieldType: "boolean",    isRequired: false, displayOrder: 9 },

    // ── Telecom ────────────────────────────────────────────────────────────────
    { id: "fld-tel-001", industryTemplateId: "ind-tmpl-007", fieldKey: "customerName",           fieldLabel: "Customer Name",           fieldType: "text",       isRequired: true,  displayOrder: 1 },
    { id: "fld-tel-002", industryTemplateId: "ind-tmpl-007", fieldKey: "productType",            fieldLabel: "Product Type",            fieldType: "select",     isRequired: true,  displayOrder: 2, optionsJson: ["Fibre", "Mobile Contract", "Data Contract", "Voice", "Cloud PBX", "LTE"] },
    { id: "fld-tel-003", industryTemplateId: "ind-tmpl-007", fieldKey: "monthlyContractValue",   fieldLabel: "Monthly Contract Value",  fieldType: "currency",   isRequired: true,  displayOrder: 3, calculationRole: "REVENUE" },
    { id: "fld-tel-004", industryTemplateId: "ind-tmpl-007", fieldKey: "contractTermMonths",     fieldLabel: "Contract Term (months)",  fieldType: "number",     isRequired: true,  displayOrder: 4 },
    { id: "fld-tel-005", industryTemplateId: "ind-tmpl-007", fieldKey: "totalContractValue",     fieldLabel: "Total Contract Value",    fieldType: "calculated", isRequired: false, displayOrder: 5 },
    { id: "fld-tel-006", industryTemplateId: "ind-tmpl-007", fieldKey: "activationFee",          fieldLabel: "Activation Fee",          fieldType: "currency",   isRequired: false, displayOrder: 6 },
    { id: "fld-tel-007", industryTemplateId: "ind-tmpl-007", fieldKey: "activationDate",         fieldLabel: "Activation Date",         fieldType: "date",       isRequired: false, displayOrder: 7 },
    { id: "fld-tel-008", industryTemplateId: "ind-tmpl-007", fieldKey: "activationStatus",       fieldLabel: "Activation Status",       fieldType: "select",     isRequired: true,  displayOrder: 8, optionsJson: ["Pending", "Activated", "Cancelled"] },

    // ── SaaS ───────────────────────────────────────────────────────────────────
    { id: "fld-sas-001", industryTemplateId: "ind-tmpl-008", fieldKey: "customerName",              fieldLabel: "Customer Name",              fieldType: "text",       isRequired: true,  displayOrder: 1 },
    { id: "fld-sas-002", industryTemplateId: "ind-tmpl-008", fieldKey: "productName",               fieldLabel: "Product Name",               fieldType: "text",       isRequired: true,  displayOrder: 2 },
    { id: "fld-sas-003", industryTemplateId: "ind-tmpl-008", fieldKey: "subscriptionType",          fieldLabel: "Subscription Type",          fieldType: "select",     isRequired: true,  displayOrder: 3, optionsJson: ["Monthly", "Annual", "Multi-Year"] },
    { id: "fld-sas-004", industryTemplateId: "ind-tmpl-008", fieldKey: "monthlyRecurringRevenue",   fieldLabel: "Monthly Recurring Revenue",  fieldType: "currency",   isRequired: true,  displayOrder: 4, calculationRole: "REVENUE" },
    { id: "fld-sas-005", industryTemplateId: "ind-tmpl-008", fieldKey: "contractTermMonths",        fieldLabel: "Contract Term (months)",     fieldType: "number",     isRequired: true,  displayOrder: 5 },
    { id: "fld-sas-006", industryTemplateId: "ind-tmpl-008", fieldKey: "annualRecurringRevenue",    fieldLabel: "Annual Recurring Revenue",   fieldType: "calculated", isRequired: false, displayOrder: 6 },
    { id: "fld-sas-007", industryTemplateId: "ind-tmpl-008", fieldKey: "totalContractValue",        fieldLabel: "Total Contract Value",       fieldType: "calculated", isRequired: false, displayOrder: 7 },
    { id: "fld-sas-008", industryTemplateId: "ind-tmpl-008", fieldKey: "customerActivationDate",    fieldLabel: "Customer Activation Date",   fieldType: "date",       isRequired: false, displayOrder: 8 },
    { id: "fld-sas-009", industryTemplateId: "ind-tmpl-008", fieldKey: "subscriptionStatus",        fieldLabel: "Subscription Status",        fieldType: "select",     isRequired: true,  displayOrder: 9, optionsJson: ["Signed", "Activated", "Cancelled"] },

    // ── Custom ─────────────────────────────────────────────────────────────────
    { id: "fld-cus-001", industryTemplateId: "ind-tmpl-009", fieldKey: "eventTitle",             fieldLabel: "Event Title",             fieldType: "text",       isRequired: true,  displayOrder: 1 },
    { id: "fld-cus-002", industryTemplateId: "ind-tmpl-009", fieldKey: "customerName",           fieldLabel: "Customer Name",           fieldType: "text",       isRequired: false, displayOrder: 2 },
    { id: "fld-cus-003", industryTemplateId: "ind-tmpl-009", fieldKey: "commissionBaseAmount",   fieldLabel: "Commission Base Amount",  fieldType: "currency",   isRequired: true,  displayOrder: 3, calculationRole: "REVENUE" },
    { id: "fld-cus-004", industryTemplateId: "ind-tmpl-009", fieldKey: "commissionPercentage",   fieldLabel: "Commission %",            fieldType: "percentage", isRequired: true,  displayOrder: 4 },
    { id: "fld-cus-005", industryTemplateId: "ind-tmpl-009", fieldKey: "eventDate",              fieldLabel: "Event Date",              fieldType: "date",       isRequired: true,  displayOrder: 5 },
    { id: "fld-cus-006", industryTemplateId: "ind-tmpl-009", fieldKey: "notes",                  fieldLabel: "Notes",                   fieldType: "textarea",   isRequired: false, displayOrder: 6 },
  ];

  let fieldCount = 0;
  for (const f of fieldDefs) {
    await prisma.dealFieldDefinition.upsert({
      where: { industryTemplateId_fieldKey: { industryTemplateId: f.industryTemplateId, fieldKey: f.fieldKey } },
      update: {
        fieldLabel: f.fieldLabel,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        displayOrder: f.displayOrder,
        calculationRole: f.calculationRole ?? null,
        optionsJson: f.optionsJson ?? null,
        isActive: true,
      },
      create: {
        id: f.id,
        industryTemplateId: f.industryTemplateId,
        fieldKey: f.fieldKey,
        fieldLabel: f.fieldLabel,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        displayOrder: f.displayOrder,
        calculationRole: f.calculationRole ?? null,
        optionsJson: f.optionsJson ?? null,
        isActive: true,
      },
    });
    fieldCount++;
  }
  console.log("✅ Deal field definitions created:", fieldCount);

  // ─── Default Clawback Policies by Industry ─────────────────────────────────
  const clawbackPolicies = [
    // ── IT Consulting ──────────────────────────────────────────────────────────
    {
      id: "cb-pol-001",
      industryTemplateId: "ind-tmpl-001",
      policyName: "IT Consulting — Pro-Rata by Contract Term",
      appliesToEventType: null,
      clawbackMethod: "PRO_RATA_BY_TERM" as const,
      clawbackWindowDays: null,         // window = contract term (from event dates)
      noClawbackAfterDays: null,        // no hard cutoff — full term applies
      recoveryMethodPriorityJson: ["WALLET_DEDUCTION", "FUTURE_COMMISSION_OFFSET"],
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
    // ── Recruitment — Permanent ────────────────────────────────────────────────
    {
      id: "cb-pol-002",
      industryTemplateId: "ind-tmpl-002",
      policyName: "Recruitment — Permanent Placement Sliding Scale",
      appliesToEventType: "PERMANENT",
      clawbackMethod: "SLIDING_SCALE" as const,
      clawbackWindowDays: 90,
      noClawbackAfterDays: 90,
      recoveryMethodPriorityJson: {
        method: "SLIDING_SCALE",
        brackets: [
          { fromDay: 0,  toDay: 30,  percentage: 100 },
          { fromDay: 31, toDay: 60,  percentage: 50  },
          { fromDay: 61, toDay: 90,  percentage: 25  },
          { fromDay: 91, toDay: null, percentage: 0  },
        ],
        recoveryPriority: ["WALLET_DEDUCTION", "FUTURE_COMMISSION_OFFSET"],
      },
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
    // ── Recruitment — Contract ─────────────────────────────────────────────────
    {
      id: "cb-pol-003",
      industryTemplateId: "ind-tmpl-002",
      policyName: "Recruitment — Contract Placement (Monthly Earned)",
      appliesToEventType: "CONTRACT",
      clawbackMethod: "NONE" as const,
      clawbackWindowDays: null,
      noClawbackAfterDays: null,
      recoveryMethodPriorityJson: {
        note: "Commission is earned monthly as contractor works. Manual clawback available for unpaid invoices only.",
        recoveryPriority: ["MANUAL_PAYMENT", "FUTURE_COMMISSION_OFFSET"],
      },
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: false,
    },
    // ── Insurance ──────────────────────────────────────────────────────────────
    {
      id: "cb-pol-004",
      industryTemplateId: "ind-tmpl-003",
      policyName: "Insurance — Pro-Rata or Full (First Premium Not Collected)",
      appliesToEventType: null,
      clawbackMethod: "PRO_RATA_BY_TERM" as const,
      clawbackWindowDays: 365,
      noClawbackAfterDays: 365,
      recoveryMethodPriorityJson: {
        method: "PRO_RATA_BY_TERM",
        fullClawbackCondition: "FIRST_PREMIUM_NOT_COLLECTED",
        recoveryPriority: ["FUTURE_COMMISSION_OFFSET", "WALLET_DEDUCTION"],
      },
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
    // ── Vehicle Dealership ─────────────────────────────────────────────────────
    {
      id: "cb-pol-005",
      industryTemplateId: "ind-tmpl-004",
      policyName: "Vehicle Dealership — Component-Based Clawback",
      appliesToEventType: null,
      clawbackMethod: "COMPONENT_BASED" as const,
      clawbackWindowDays: 90,
      noClawbackAfterDays: 180,
      recoveryMethodPriorityJson: {
        method: "COMPONENT_BASED",
        components: [
          { key: "vehicle_gp",           label: "Vehicle GP Commission",        clawbackEligible: true  },
          { key: "finance_commission",    label: "Finance Commission",           clawbackEligible: true  },
          { key: "insurance_commission",  label: "Insurance Product Commission", clawbackEligible: true  },
          { key: "warranty_commission",   label: "Warranty Commission",          clawbackEligible: true  },
          { key: "service_plan",          label: "Service Plan Commission",      clawbackEligible: true  },
        ],
        recoveryPriority: ["WALLET_DEDUCTION", "FUTURE_COMMISSION_OFFSET"],
      },
      allowPartialRecovery: true,
      allowWaiver: false,
      requiresApproval: true,
      isDefault: true,
    },
    // ── Property Sales ─────────────────────────────────────────────────────────
    {
      id: "cb-pol-006",
      industryTemplateId: "ind-tmpl-005",
      policyName: "Property Sales — Manual Reversal Only",
      appliesToEventType: null,
      clawbackMethod: "NONE" as const,
      clawbackWindowDays: null,
      noClawbackAfterDays: null,
      recoveryMethodPriorityJson: {
        note: "Commission only becomes available after transfer registration. Manual reversal permitted if paid in error.",
        recoveryPriority: ["MANUAL_PAYMENT", "WALLET_DEDUCTION"],
      },
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
    // ── Rental Management ──────────────────────────────────────────────────────
    {
      id: "cb-pol-007",
      industryTemplateId: "ind-tmpl-006",
      policyName: "Rental Management — Pro-Rata by Lease Term",
      appliesToEventType: null,
      clawbackMethod: "PRO_RATA_BY_TERM" as const,
      clawbackWindowDays: null,         // window = lease term (from event dates)
      noClawbackAfterDays: null,
      recoveryMethodPriorityJson: ["WALLET_DEDUCTION", "FUTURE_COMMISSION_OFFSET"],
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
    // ── Telecom ────────────────────────────────────────────────────────────────
    {
      id: "cb-pol-008",
      industryTemplateId: "ind-tmpl-007",
      policyName: "Telecom — Pro-Rata by Contract Term (max 180 days)",
      appliesToEventType: null,
      clawbackMethod: "PRO_RATA_BY_TERM" as const,
      clawbackWindowDays: 180,
      noClawbackAfterDays: 180,
      recoveryMethodPriorityJson: ["FUTURE_COMMISSION_OFFSET", "WALLET_DEDUCTION"],
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
    // ── SaaS ───────────────────────────────────────────────────────────────────
    {
      id: "cb-pol-009",
      industryTemplateId: "ind-tmpl-008",
      policyName: "SaaS — Pro-Rata by Contract Term (max 12 months)",
      appliesToEventType: null,
      clawbackMethod: "PRO_RATA_BY_TERM" as const,
      clawbackWindowDays: 365,
      noClawbackAfterDays: 365,
      recoveryMethodPriorityJson: ["WALLET_DEDUCTION", "FUTURE_COMMISSION_OFFSET"],
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
    // ── Custom ─────────────────────────────────────────────────────────────────
    {
      id: "cb-pol-010",
      industryTemplateId: "ind-tmpl-009",
      policyName: "Custom — Manual Adjustment",
      appliesToEventType: null,
      clawbackMethod: "MANUAL" as const,
      clawbackWindowDays: null,
      noClawbackAfterDays: null,
      recoveryMethodPriorityJson: ["WALLET_DEDUCTION", "FUTURE_COMMISSION_OFFSET", "MANUAL_PAYMENT"],
      allowPartialRecovery: true,
      allowWaiver: true,
      requiresApproval: true,
      isDefault: true,
    },
  ];

  for (const policy of clawbackPolicies) {
    await prisma.clawbackPolicy.upsert({
      where: { id: policy.id },
      update: {
        policyName:                policy.policyName,
        appliesToEventType:        policy.appliesToEventType,
        clawbackMethod:            policy.clawbackMethod,
        clawbackWindowDays:        policy.clawbackWindowDays,
        noClawbackAfterDays:       policy.noClawbackAfterDays,
        recoveryMethodPriorityJson: policy.recoveryMethodPriorityJson,
        allowPartialRecovery:      policy.allowPartialRecovery,
        allowWaiver:               policy.allowWaiver,
        requiresApproval:          policy.requiresApproval,
        isDefault:                 policy.isDefault,
        isActive:                  true,
      },
      create: {
        id:                        policy.id,
        industryTemplateId:        policy.industryTemplateId,
        policyName:                policy.policyName,
        appliesToEventType:        policy.appliesToEventType,
        clawbackMethod:            policy.clawbackMethod,
        clawbackWindowDays:        policy.clawbackWindowDays,
        noClawbackAfterDays:       policy.noClawbackAfterDays,
        recoveryMethodPriorityJson: policy.recoveryMethodPriorityJson,
        allowPartialRecovery:      policy.allowPartialRecovery,
        allowWaiver:               policy.allowWaiver,
        requiresApproval:          policy.requiresApproval,
        isDefault:                 policy.isDefault,
        isActive:                  true,
      },
    });
  }
  console.log("✅ Clawback policies seeded:", clawbackPolicies.length);

  console.log("\n🎉 Seed complete!");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log("Demo login credentials (all use Password123!):");
  console.log("  ─── Platform ───────────────────────────────────────────────────");
  console.log("  Super Admin:     superadmin@commissionwallet.co.za");
  console.log("  ─── TechSales ZA ───────────────────────────────────────────────");
  console.log("  Admin:           admin@techsalesza.co.za");
  console.log("  Manager:         manager@techsalesza.co.za");
  console.log("  Finance:         finance@techsalesza.co.za");
  console.log("  Sales Exec 1:    james@techsalesza.co.za");
  console.log("  Sales Exec 2:    nomsa@techsalesza.co.za");
  console.log("  Sales Exec 3:    ruan@techsalesza.co.za");
  console.log("  ─── Demo Corp ──────────────────────────────────────────────────");
  console.log("  Admin:           admin@demo.co.za");
  console.log("  Sales Exec:      sales@demo.co.za");
  console.log("  Manager:         manager@demo.co.za");
  console.log("  Finance:         finance@demo.co.za");
  console.log("  Executive:       executive@demo.co.za");
  console.log("  Payroll:         payroll@demo.co.za");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
