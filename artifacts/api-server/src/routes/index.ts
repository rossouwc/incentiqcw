import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { authRouter } from "./auth";
import { tenantRouter } from "./tenant";
import { usersRouter } from "./users";
import { dealsRouter } from "./deals";
import { walletRouter } from "./wallet";
import { payoutsRouter } from "./payouts";
import { commissionRulesRouter } from "./commissionRules";
import { commissionRuleGroupsRouter } from "./commissionRuleGroups";
import { approvalsRouter } from "./approvals";
import { dashboardRouter } from "./dashboard";
import { reportsRouter } from "./reports";
import { notificationsRouter } from "./notifications";
import { auditRouter } from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/tenant", tenantRouter);
router.use("/users", usersRouter);
router.use("/deals", dealsRouter);
router.use("/wallet", walletRouter);
router.use("/payouts", payoutsRouter);
router.use("/commission-rules", commissionRulesRouter);
router.use("/commission-rule-groups", commissionRuleGroupsRouter);
router.use("/approvals", approvalsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/reports", reportsRouter);
router.use("/notifications", notificationsRouter);
router.use("/audit-logs", auditRouter);

export default router;
