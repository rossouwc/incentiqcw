import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod/v4";

export const taxBracketsRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

function isAdmin(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function calcPAYE(
  taxableIncome: number,
  brackets: { fromIncome: number; toIncome: number | null; rate: number; baseAmount: number }[],
  primaryRebate: number,
  medAidCreditAnnual: number,
): number {
  if (taxableIncome <= 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.fromIncome - b.fromIncome);
  const bracket = sorted.filter((b) => taxableIncome > b.fromIncome).at(-1);
  if (!bracket) return 0;
  const gross = bracket.baseAmount + (taxableIncome - bracket.fromIncome) * (bracket.rate / 100);
  return Math.max(0, gross - primaryRebate - medAidCreditAnnual);
}

// ─── Tax Brackets CRUD ───────────────────────────────────────────────────────

taxBracketsRouter.get("/", requireAuth, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const brackets = await prisma.taxBracket.findMany({
    where: { taxYear: year },
    orderBy: { fromIncome: "asc" },
  });
  res.json(brackets);
});

const bracketSchema = z.object({
  taxYear:     z.number().int().min(2020).max(2099),
  fromIncome:  z.number().min(0),
  toIncome:    z.number().min(0).nullable().optional(),
  rate:        z.number().min(0).max(100),
  baseAmount:  z.number().min(0).default(0),
  description: z.string().optional(),
});

taxBracketsRouter.post("/", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  const parsed = bracketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  const bracket = await prisma.taxBracket.create({ data: parsed.data });
  res.status(201).json(bracket);
});

taxBracketsRouter.patch("/:id", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  const parsed = bracketSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  const bracket = await prisma.taxBracket.update({
    where: { id: req.params.id as string },
    data: parsed.data,
  });
  res.json(bracket);
});

taxBracketsRouter.delete("/:id", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  await prisma.taxBracket.delete({ where: { id: req.params.id as string } });
  res.status(204).send();
});

// ─── Tax Rebates CRUD ─────────────────────────────────────────────────────────

const rebateSchema = z.object({
  taxYear: z.number().int().min(2020).max(2099),
  type:    z.enum(["PRIMARY", "SECONDARY", "TERTIARY"]),
  amount:  z.number().min(0),
});

taxBracketsRouter.get("/rebates", requireAuth, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const rebates = await prisma.taxRebate.findMany({
    where: { taxYear: year },
    orderBy: { type: "asc" },
  });
  res.json(rebates);
});

taxBracketsRouter.post("/rebates", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  const parsed = rebateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  const rebate = await prisma.taxRebate.create({ data: parsed.data });
  res.status(201).json(rebate);
});

taxBracketsRouter.patch("/rebates/:id", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  const parsed = rebateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  const rebate = await prisma.taxRebate.update({
    where: { id: req.params.id as string },
    data: parsed.data,
  });
  res.json(rebate);
});

taxBracketsRouter.delete("/rebates/:id", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  await prisma.taxRebate.delete({ where: { id: req.params.id as string } });
  res.status(204).send();
});

// ─── PAYE Estimate ────────────────────────────────────────────────────────────

const estimateSchema = z.object({
  annualSalary:           z.number().min(0),
  commissionPayout:       z.number().min(0),
  medicalAidCredits:      z.number().min(0).default(0),
  retirementContribution: z.number().min(0).default(0),
  taxYear:                z.number().int().min(2020).max(2099),
});

taxBracketsRouter.post("/estimate", requireAuth, async (req, res) => {
  const parsed = estimateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  const { annualSalary, commissionPayout, medicalAidCredits, retirementContribution, taxYear } = parsed.data;

  const brackets = await prisma.taxBracket.findMany({
    where: { taxYear },
    orderBy: { fromIncome: "asc" },
  });
  if (brackets.length === 0) {
    res.status(422).json({ error: `No tax brackets configured for tax year ${taxYear}` });
    return;
  }

  const rebates = await prisma.taxRebate.findMany({ where: { taxYear } });
  const primaryRebate = rebates.find((r) => r.type === "PRIMARY")?.amount ?? 0;
  const medAidAnnual  = medicalAidCredits * 12;

  // SARS PAYE on variable income: annualize (monthly salary + commission), then divide tax difference by 12
  const monthlySalary = annualSalary / 12;
  const taxableBase   = Math.max(0, annualSalary - retirementContribution);
  const taxableWithC  = Math.max(0, (monthlySalary + commissionPayout) * 12 - retirementContribution);

  const annualTaxBase   = calcPAYE(taxableBase, brackets, primaryRebate, medAidAnnual);
  const annualTaxWithC  = calcPAYE(taxableWithC, brackets, primaryRebate, medAidAnnual);
  const additionalTax   = Math.max(0, (annualTaxWithC - annualTaxBase) / 12);
  const netPayout       = Math.max(0, commissionPayout - additionalTax);
  const effectiveRate   = commissionPayout > 0 ? (additionalTax / commissionPayout) * 100 : 0;

  // Expose derived values for transparency
  const netTaxBase  = annualTaxBase;
  const netTaxWithC = annualTaxWithC;

  res.json({
    taxYear,
    annualSalary,
    commissionPayout,
    retirementContribution,
    medicalAidCreditAnnual:       medAidAnnual,
    taxableIncomeBase:            taxableBase,
    taxableIncomeWithCommission:  taxableWithC,
    netTaxBase,
    netTaxWithCommission:         netTaxWithC,
    additionalTax,
    estimatedNetPayout:           netPayout,
    effectiveRateOnCommission:    Math.round(effectiveRate * 10) / 10,
    primaryRebateApplied:         primaryRebate,
  });
});
