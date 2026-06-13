import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding SA PAYE tax brackets...");

  // ─── 2024/2025 — taxYear 2025 ─────────────────────────────────────────────
  const brackets2025 = [
    { taxYear: 2025, fromIncome: 0,         toIncome: 226000,    rate: 18, baseAmount: 0,       description: "18% on R0 – R226,000" },
    { taxYear: 2025, fromIncome: 226000,     toIncome: 353100,    rate: 26, baseAmount: 40680,   description: "26% on R226,001 – R353,100" },
    { taxYear: 2025, fromIncome: 353100,     toIncome: 488700,    rate: 31, baseAmount: 73726,   description: "31% on R353,101 – R488,700" },
    { taxYear: 2025, fromIncome: 488700,     toIncome: 641400,    rate: 36, baseAmount: 115762,  description: "36% on R488,701 – R641,400" },
    { taxYear: 2025, fromIncome: 641400,     toIncome: 817600,    rate: 39, baseAmount: 170734,  description: "39% on R641,401 – R817,600" },
    { taxYear: 2025, fromIncome: 817600,     toIncome: 1731600,   rate: 41, baseAmount: 239452,  description: "41% on R817,601 – R1,731,600" },
    { taxYear: 2025, fromIncome: 1731600,    toIncome: null,      rate: 45, baseAmount: 614192,  description: "45% on R1,731,601+" },
  ];

  // ─── 2025/2026 — taxYear 2026 ─────────────────────────────────────────────
  const brackets2026 = [
    { taxYear: 2026, fromIncome: 0,         toIncome: 237100,    rate: 18, baseAmount: 0,       description: "18% on R0 – R237,100" },
    { taxYear: 2026, fromIncome: 237100,     toIncome: 370500,    rate: 26, baseAmount: 42678,   description: "26% on R237,101 – R370,500" },
    { taxYear: 2026, fromIncome: 370500,     toIncome: 512800,    rate: 31, baseAmount: 77362,   description: "31% on R370,501 – R512,800" },
    { taxYear: 2026, fromIncome: 512800,     toIncome: 673000,    rate: 36, baseAmount: 121475,  description: "36% on R512,801 – R673,000" },
    { taxYear: 2026, fromIncome: 673000,     toIncome: 857900,    rate: 39, baseAmount: 179147,  description: "39% on R673,001 – R857,900" },
    { taxYear: 2026, fromIncome: 857900,     toIncome: 1817000,   rate: 41, baseAmount: 251258,  description: "41% on R857,901 – R1,817,000" },
    { taxYear: 2026, fromIncome: 1817000,    toIncome: null,      rate: 45, baseAmount: 644489,  description: "45% on R1,817,001+" },
  ];

  for (const b of [...brackets2025, ...brackets2026]) {
    await prisma.taxBracket.upsert({
      where: {
        id: `bracket-${b.taxYear}-${b.fromIncome}`,
      },
      update: { toIncome: b.toIncome, rate: b.rate, baseAmount: b.baseAmount, description: b.description },
      create: {
        id: `bracket-${b.taxYear}-${b.fromIncome}`,
        ...b,
      },
    });
  }

  // ─── Rebates ──────────────────────────────────────────────────────────────
  const rebates = [
    { taxYear: 2025, type: "PRIMARY",   amount: 16425  },
    { taxYear: 2025, type: "SECONDARY", amount: 9000   },
    { taxYear: 2025, type: "TERTIARY",  amount: 2997   },
    { taxYear: 2026, type: "PRIMARY",   amount: 17235  },
    { taxYear: 2026, type: "SECONDARY", amount: 9444   },
    { taxYear: 2026, type: "TERTIARY",  amount: 3145   },
  ];

  for (const r of rebates) {
    await prisma.taxRebate.upsert({
      where: { id: `rebate-${r.taxYear}-${r.type}` },
      update: { amount: r.amount },
      create: { id: `rebate-${r.taxYear}-${r.type}`, ...r },
    });
  }

  console.log("✅ Tax brackets + rebates seeded for 2025 and 2026.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
