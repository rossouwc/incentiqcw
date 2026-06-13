import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod/v4";

export const taxProfileRouter = Router();

taxProfileRouter.get("/", requireAuth, async (req, res) => {
  const profile = await prisma.taxProfile.findUnique({
    where: { userId: req.user!.id },
  });
  res.json(profile ?? null);
});

const upsertSchema = z.object({
  monthlySalary:          z.number().min(0),
  annualSalary:           z.number().min(0),
  medicalAidCredits:      z.number().min(0),
  retirementContribution: z.number().min(0),
  taxYear:                z.number().int().min(2020).max(2099),
});

taxProfileRouter.put("/", requireAuth, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  const data = parsed.data;
  const profile = await prisma.taxProfile.upsert({
    where: { userId: req.user!.id },
    create: {
      tenantId:               req.user!.tenantId,
      userId:                 req.user!.id,
      monthlySalary:          data.monthlySalary,
      annualSalary:           data.annualSalary,
      medicalAidCredits:      data.medicalAidCredits,
      retirementContribution: data.retirementContribution,
      taxYear:                data.taxYear,
    },
    update: {
      monthlySalary:          data.monthlySalary,
      annualSalary:           data.annualSalary,
      medicalAidCredits:      data.medicalAidCredits,
      retirementContribution: data.retirementContribution,
      taxYear:                data.taxYear,
    },
  });
  res.json(profile);
});
