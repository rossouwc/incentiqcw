import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/customers — all authenticated users (for autocomplete)
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };
  try {
    const customers = await prisma.customer.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(search && {
          name: { contains: search, mode: "insensitive" },
        }),
      },
      orderBy: { name: "asc" },
    });
    res.json(customers);
  } catch (err) {
    logger.error({ err }, "ListCustomers error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/customers — ADMIN+ only
router.post("/", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const customer = await prisma.customer.create({
      data: { tenantId: req.user!.tenantId, name: name.trim() },
    });
    res.status(201).json(customer);
  } catch (err: any) {
    if (err?.code === "P2002") {
      res.status(409).json({ error: "Customer already exists" });
      return;
    }
    logger.error({ err }, "CreateCustomer error");
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/customers/:id — ADMIN+ only
router.patch("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Customer not found" }); return; }
    const customer = await prisma.customer.update({
      where: { id: req.params.id as string },
      data: { name: name.trim() },
    });
    res.json(customer);
  } catch (err: any) {
    if (err?.code === "P2002") {
      res.status(409).json({ error: "A customer with that name already exists" });
      return;
    }
    logger.error({ err }, "UpdateCustomer error");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/customers/:id — ADMIN+ only
router.delete("/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId },
    });
    if (!existing) { res.status(404).json({ error: "Customer not found" }); return; }
    await prisma.customer.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Customer deleted" });
  } catch (err) {
    logger.error({ err }, "DeleteCustomer error");
    res.status(500).json({ error: "Server error" });
  }
});

export { router as customersRouter };
