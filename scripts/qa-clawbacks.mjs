#!/usr/bin/env node
// QA: Full clawback + commission recovery test suite (14 scenarios)
// Run: node scripts/qa-clawbacks.mjs
//
// Design:
//  • Commission events are created AS SAM (sales@demo.co.za) so wallet
//    assertions always target Sam's wallet.
//  • If Sam's wallet is below the minimum needed for S9/S10, the setup phase
//    submits and approves one of her events to get the commission credited.
//  • T1 cross-tenant event is created as james@techsalesza.co.za.

const BASE = "http://localhost:80/api";
const PW   = "Password123!";

let PASS = 0, FAIL = 0, WARN = 0;
const results = [];

function pass(label, detail = "")  { PASS++; results.push(`  ✅ ${label}${detail ? " → " + detail : ""}`); }
function fail(label, detail = "")  { FAIL++; results.push(`  ❌ ${label}${detail ? " → " + detail : ""}`); }
function warn(label, detail = "")  { WARN++; results.push(`  ⚠️  ${label}${detail ? " → " + detail : ""}`); }
function section(s) { results.push(`\n── ${s} ──`); }

async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function login(email) {
  const r = await api("POST", "/auth/login", { email, password: PW });
  if (!r.data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

async function getWallet(token) {
  const r = await api("GET", "/wallet", null, token);
  return r.data;
}

async function getWalletTxs(token, limit = 200) {
  const r = await api("GET", `/wallet/transactions?limit=${limit}`, null, token);
  // API returns { data: [...], total, page }
  return Array.isArray(r.data) ? r.data : r.data.data ?? r.data.transactions ?? [];
}

// Create a commission event logged in as exec (salesExecutiveId = exec's userId)
async function createEventAsExec(execToken, label) {
  const r = await api("POST", "/commission-events", {
    eventTitle: `QA ${label} ${Date.now()}`,
    eventType:  "QA_TEST",
    eventDataJson: {
      revenueAmount:  600000,
      costAmount:     420000,
      placementFee:   100000,
      annualSalary:   500000,
      dealValue:      600000,
      premium:        60000,
      salePrice:      600000,
      customerName:   "QA Test Client",
    },
  }, execToken);
  if (r.status !== 201) { warn(`createEvent(${label})`, `${r.status} ${JSON.stringify(r.data)}`); return null; }
  return r.data; // { id, calculatedCommissionAmount, ... }
}

// Submit + fully approve a commission event as admin to credit the exec's wallet.
// Returns true if wallet was credited.
async function approveCommissionEvent(execToken, adminToken, eventId, commAmt) {
  // Submit via the event owner (exec)
  let submitR = await api("POST", `/commission-events/${eventId}/submit`, {}, execToken);
  if (submitR.status !== 200) {
    // Fallback: try admin
    submitR = await api("POST", `/commission-events/${eventId}/submit`, {}, adminToken);
  }
  if (submitR.status !== 200) return false;

  // Walk approval steps as admin (ADMIN bypasses all role checks)
  for (let i = 0; i < 8; i++) {
    const appR = await api("GET", `/approvals?dealId=${eventId}&status=PENDING`, null, adminToken);
    const apps = Array.isArray(appR.data) ? appR.data : [];
    if (apps.length === 0) break;

    const step = apps[0];
    const approveR = await api("POST", `/approvals/${step.id}/action`, {
      action: "APPROVE",
      ...(step.approverRole === "SALES_EXECUTIVE" ? { payoutAmount: commAmt } : {}),
    }, adminToken);
    if (approveR.status !== 200) break;
  }

  const wallet = await getWallet(execToken);
  return Number(wallet.availableBalance ?? 0) > 0;
}

// Full clawback approval: SUBMIT → walk all steps as admin
async function fullApprove(cbId, adminTok) {
  const s = await api("POST", `/clawbacks/${cbId}/action`, { action: "SUBMIT" }, adminTok);
  if (s.status !== 200) return { ok: false, step: "SUBMIT", detail: JSON.stringify(s.data) };

  for (let i = 0; i < 6; i++) {
    const fresh = await api("GET", `/clawbacks/${cbId}`, null, adminTok);
    const cb = fresh.data;
    if (cb.status === "APPROVED") return { ok: true, cb };
    if (!["PENDING_APPROVAL", "CHANGES_REQUESTED"].includes(cb.status))
      return { ok: false, step: `APPROVE-step${i}`, detail: `unexpected: ${cb.status}` };
    const a = await api("POST", `/clawbacks/${cbId}/action`, { action: "APPROVE", notes: "QA" }, adminTok);
    if (a.status !== 200) return { ok: false, step: `APPROVE-step${i}`, detail: JSON.stringify(a.data) };
  }
  return { ok: false, step: "loop", detail: "exceeded 6 steps" };
}

async function createCb(token, eventId, overrides = {}) {
  return api("POST", "/clawbacks", {
    commissionEventId: eventId,
    clawbackType:      "FULL",
    reasonCategory:    "CANCELLATION",
    reason:            "QA test clawback",
    clawbackAmount:    1000,
    ...overrides,
  }, token);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("Incentiq Clawback QA Suite\n");

  // ── Login all actors ───────────────────────────────────────────────────────
  let t1Admin, t1Finance, t1Manager, t1Exec;
  let t2Admin, t2Finance, t2Manager, t2Exec, t2Executive;
  try {
    t1Admin     = await login("admin@techsalesza.co.za");
    t1Finance   = await login("finance@techsalesza.co.za");
    t1Manager   = await login("manager@techsalesza.co.za");
    t1Exec      = await login("james@techsalesza.co.za");
    t2Admin     = await login("admin@demo.co.za");
    t2Finance   = await login("finance@demo.co.za");
    t2Manager   = await login("manager@demo.co.za");
    t2Exec      = await login("sales@demo.co.za");        // Sam Sales
    t2Executive = await login("executive@demo.co.za");
    pass("All actors logged in successfully");
  } catch (e) {
    fail("Login", e.message);
    console.log(results.join("\n"));
    return;
  }

  // ── Create T1 event for S14 cross-tenant test ──────────────────────────────
  const t1Event = await createEventAsExec(t1Exec, "T1-CrossTenant");
  if (t1Event) pass("T1 event created for cross-tenant test", `id=${t1Event.id}`);
  else warn("T1 event creation failed — S14 will be limited");

  // ── Create fresh commission events AS SAM ─────────────────────────────────
  const samEv1 = await createEventAsExec(t2Exec, "Sam-Ev1");
  const samEv2 = await createEventAsExec(t2Exec, "Sam-Ev2");
  const samEv3 = await createEventAsExec(t2Exec, "Sam-Ev3");

  if (!samEv1) { fail("Could not create Sam events — aborting"); console.log(results.join("\n")); return; }

  const samComm1 = Number(samEv1.calculatedCommissionAmount ?? 0);
  const samComm2 = Number(samEv2?.calculatedCommissionAmount ?? 0);
  const samComm3 = Number(samEv3?.calculatedCommissionAmount ?? 0);

  if (samComm1 > 0) pass("Sam commission events created", `ev1=R${samComm1} ev2=R${samComm2} ev3=R${samComm3}`);
  else              warn("Sam events have 0 commission — wallet tests will be limited");

  // ── Wallet top-up: approve samEv1 commission if Sam's wallet is too low ───
  // Sam's wallet must be >= 15 000 for S9 (small deduction) and S10 (partial).
  // We reserve samEv1 for top-up; S1-S8 use samEv1 for clawback CREATION only
  // (clawback creation doesn't check wallet balance).
  {
    const walletCheck = await getWallet(t2Exec);
    const currentBal  = Number(walletCheck.availableBalance ?? 0);
    if (currentBal < 15000 && samComm1 > 0) {
      const topped = await approveCommissionEvent(t2Exec, t2Admin, samEv1.id, samComm1);
      if (topped) {
        const newBal = Number((await getWallet(t2Exec)).availableBalance ?? 0);
        pass("Wallet top-up via commission approval", `balance=R${newBal}`);
      } else {
        warn("Wallet top-up failed — S9 may skip if wallet is too low");
      }
    }
  }

  // ── Baseline wallet snapshot ───────────────────────────────────────────────
  const baseWallet = await getWallet(t2Exec);
  const baseAvail  = Number(baseWallet.availableBalance ?? 0);
  pass("Baseline Sam wallet", `available=R${baseAvail}`);

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIOS 1–8: Industry-specific clawback types
  // ════════════════════════════════════════════════════════════════════════════
  section("Scenarios 1–8: Industry-Specific Clawback Types");

  async function industryScenario(label, token, eventId, overrides) {
    if (!eventId) { warn(label, "no event"); return null; }
    const cr = await createCb(token, eventId, overrides);
    if (cr.status !== 201) { fail(label + " (CREATE)", JSON.stringify(cr.data)); return null; }
    const cbId = cr.data.id;
    if (cr.data.status !== "DRAFT") { fail(label + " (DRAFT)", `status=${cr.data.status}`); return cbId; }
    const approve = await fullApprove(cbId, token);
    if (!approve.ok) { fail(label + " (APPROVE)", `${approve.step}: ${approve.detail}`); return cbId; }
    pass(label, `cbId=${cbId} status=${approve.cb?.status}`);
    return cbId;
  }

  // 1. IT Consulting — early termination (PRO_RATA)
  await industryScenario(
    "S1: IT Consulting — Early Termination (PRO_RATA)",
    t2Admin, samEv1.id,
    { clawbackType: "PRO_RATA", reasonCategory: "TERMINATION",
      reason: "IT contract terminated early",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.67, 20000)).toFixed(2),
      proRataFactor: 0.6667, notes: "Scenario 1" }
  );

  // 2. Recruitment — guarantee breach (FULL)
  await industryScenario(
    "S2: Recruitment — Guarantee Period Breach (FULL)",
    t2Admin, samEv2?.id ?? samEv1.id,
    { clawbackType: "FULL", reasonCategory: "LAPSE",
      reason: "Candidate resigned within 3-month guarantee",
      clawbackAmount: Math.max(1, Math.min(samComm2 || samComm1, 15000) * 0.5).toFixed(2),
      notes: "Scenario 2" }
  );

  // 3. Insurance — policy lapse; SUBMIT only; verify CLAWBACK_PENDING wallet tx
  section("Scenario 3: CLAWBACK_PENDING Wallet Visibility");
  {
    const cr3 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "FULL", reasonCategory: "LAPSE",
      reason: "Life policy lapsed at month 4",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.1, 5000)).toFixed(2),
    });
    if (cr3.status !== 201) {
      fail("S3: Create", JSON.stringify(cr3.data));
    } else {
      const cb3Id = cr3.data.id;
      const sr3 = await api("POST", `/clawbacks/${cb3Id}/action`, { action: "SUBMIT" }, t2Admin);
      if (sr3.status === 200 && sr3.data.status === "PENDING_APPROVAL") {
        pass("S3: SUBMIT → PENDING_APPROVAL", `cbId=${cb3Id}`);
        const txs = await getWalletTxs(t2Exec);
        const pendingTx = txs.find(t => t.transactionType === "CLAWBACK_PENDING" && t.referenceId === cb3Id);
        if (pendingTx) pass("S3: CLAWBACK_PENDING tx in Sam's wallet", `amount=R${pendingTx.amount}`);
        else           fail("S3: CLAWBACK_PENDING tx missing from Sam's wallet");
      } else {
        fail("S3: SUBMIT", `status=${sr3.status} ${JSON.stringify(sr3.data)}`);
      }
    }
  }

  // 4–8: Additional clawback types
  section("Scenarios 4–8: Additional Clawback Types");

  // 4. Component-based (vehicle)
  {
    const cr4 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "COMPONENT", reasonCategory: "REVERSAL",
      reason: "Vehicle sale reversed — finance and warranty components",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.4, 10000)).toFixed(2),
      componentDescription: "Finance commission R6,000 + Warranty commission R2,000",
    });
    if (cr4.status === 201) {
      pass("S4: Vehicle Component Reversal — DRAFT created", `amt=R${cr4.data.clawbackAmount}`);
      if (cr4.data.componentDescription) pass("S4: componentDescription stored");
      else fail("S4: componentDescription missing");
    } else {
      fail("S4: CREATE", JSON.stringify(cr4.data));
    }
  }

  // 5. Zero-amount rejection + valid property cancellation
  {
    const cr5zero = await api("POST", "/clawbacks", {
      commissionEventId: samEv1.id, clawbackType: "FULL",
      reasonCategory: "CANCELLATION", reason: "Property cancelled",
      clawbackAmount: 0,
    }, t2Admin);
    if (cr5zero.status === 400) pass("S5: Zero-amount correctly rejected (400)");
    else fail("S5: Zero-amount should be 400", `got ${cr5zero.status}`);

    const cr5 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "FULL", reasonCategory: "CANCELLATION",
      reason: "Property sale fell through",
      clawbackAmount: Math.max(1, Math.min(samComm1, 12000)).toFixed(2),
    });
    if (cr5.status === 201) pass("S5: Property Commission Reversal — DRAFT created");
    else fail("S5: Property CREATE", JSON.stringify(cr5.data));
  }

  // 6. Rental pro-rata
  {
    const cr6 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "PRO_RATA", reasonCategory: "TERMINATION",
      reason: "Residential lease terminated at month 5 of 12",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.25, 3500)).toFixed(2),
      proRataFactor: 0.5833,
    });
    if (cr6.status === 201) pass("S6: Rental Early Termination — DRAFT created", `proRata=${cr6.data.proRataFactor}`);
    else fail("S6: CREATE", JSON.stringify(cr6.data));
  }

  // 7. Telecom fixed
  {
    const cr7 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "FIXED_AMOUNT", reasonCategory: "CANCELLATION",
      reason: "Telecom activation cancelled at day 45",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.1, 2500)).toFixed(2),
    });
    if (cr7.status === 201) pass("S7: Telecom Fixed Chargeback — DRAFT created");
    else fail("S7: CREATE", JSON.stringify(cr7.data));
  }

  // 8. SaaS manual adjustment
  {
    const cr8 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "MANUAL_ADJUSTMENT", reasonCategory: "CANCELLATION",
      reason: "SaaS subscription cancelled at month 3 of 12",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.75, 18000)).toFixed(2),
    });
    if (cr8.status === 201) pass("S8: SaaS Subscription Cancellation — DRAFT created");
    else fail("S8: CREATE", JSON.stringify(cr8.data));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 9: Sufficient wallet — full wallet recovery
  // ════════════════════════════════════════════════════════════════════════════
  section("Scenario 9: Full Wallet Recovery (sufficient balance)");
  let cb9walletAfter = 0;
  {
    const walletBefore = await getWallet(t2Exec);
    const availBefore  = Number(walletBefore.availableBalance ?? 0);

    if (availBefore < 100) {
      warn("S9: Sam's wallet too low — reseed required", `current=R${availBefore}`);
    } else if (!samEv2?.id) {
      warn("S9: No second Sam event");
    } else {
      const smallAmt = Math.min(availBefore * 0.25, 2000);
      const cr9 = await createCb(t2Admin, samEv2.id, {
        clawbackType: "FULL", reasonCategory: "CANCELLATION",
        reason: "Scenario 9: wallet recovery test",
        clawbackAmount: Math.max(1, smallAmt).toFixed(2),
      });

      if (cr9.status !== 201) {
        fail("S9: Create", JSON.stringify(cr9.data));
      } else {
        const cb9Id = cr9.data.id;
        const appR = await fullApprove(cb9Id, t2Admin);
        if (!appR.ok) {
          fail("S9: fullApprove", `${appR.step}: ${appR.detail}`);
        } else {
          const execR = await api("POST", `/clawbacks/${cb9Id}/action`, { action: "EXECUTE" }, t2Admin);
          if (execR.status !== 200) {
            fail("S9: EXECUTE", JSON.stringify(execR.data));
          } else {
            const walletAfter = await getWallet(t2Exec);
            const availAfter  = Number(walletAfter.availableBalance ?? 0);
            cb9walletAfter    = availAfter;
            const deducted    = availBefore - availAfter;
            const cbAmt       = Number(execR.data.clawbackAmount);

            if (deducted > 0) pass("S9: Sam's wallet deducted", `before=R${availBefore} after=R${availAfter} deducted=R${deducted}`);
            else              fail("S9: No wallet deduction", `before=R${availBefore} after=R${availAfter}`);

            if (execR.data.status === "EXECUTED") pass("S9: status = EXECUTED");
            else fail("S9: expected EXECUTED", `got=${execR.data.status}`);

            if (execR.data.recoveryStatus) pass("S9: recoveryStatus set", execR.data.recoveryStatus);
            else fail("S9: recoveryStatus missing");

            const txs      = await getWalletTxs(t2Exec);
            const deductTx = txs.find(t => t.transactionType === "CLAWBACK_DEDUCTION" && t.referenceId === cb9Id);
            if (deductTx) pass("S9: CLAWBACK_DEDUCTION tx in Sam's wallet", `amount=R${deductTx.amount}`);
            else          fail("S9: CLAWBACK_DEDUCTION tx missing from Sam's wallet");

            if (availBefore >= cbAmt) {
              if (Number(execR.data.outstandingAmount) === 0) pass("S9: outstanding = 0 (fully recovered)");
              else fail("S9: outstanding should be 0", `outstanding=R${execR.data.outstandingAmount}`);
            }
          }
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 10: Insufficient wallet — partial + future commission offset
  // ════════════════════════════════════════════════════════════════════════════
  section("Scenario 10: Insufficient Wallet — Future Commission Offset");
  {
    const walletMid = await getWallet(t2Exec);
    const availMid  = Number(walletMid.availableBalance ?? 0);

    if (!samEv3?.id && !samEv1?.id) {
      warn("S10: No Sam event available");
    } else {
      const evId   = samEv3?.id ?? samEv1.id;
      const evComm = samComm3 || samComm1;

      // clawbackAmount must be > wallet balance but <= event commission
      const largeAmt = Math.min(availMid + 8000, evComm);

      if (largeAmt <= availMid || largeAmt <= 0) {
        warn("S10: Cannot test insufficient wallet", `wallet=R${availMid} commission=R${evComm}`);
      } else {
        const cr10 = await createCb(t2Admin, evId, {
          clawbackType: "FULL", reasonCategory: "NON_PAYMENT",
          reason: "Scenario 10: insufficient wallet — future offset",
          clawbackAmount: largeAmt.toFixed(2),
        });

        if (cr10.status !== 201) {
          fail("S10: Create", JSON.stringify(cr10.data));
        } else {
          const cb10Id = cr10.data.id;
          const appR = await fullApprove(cb10Id, t2Admin);
          if (!appR.ok) {
            fail("S10: fullApprove", `${appR.step}: ${appR.detail}`);
          } else {
            const execR = await api("POST", `/clawbacks/${cb10Id}/action`, { action: "EXECUTE" }, t2Admin);
            if (execR.status !== 200) {
              fail("S10: EXECUTE", JSON.stringify(execR.data));
            } else {
              if (execR.data.status === "EXECUTED") pass("S10: status = EXECUTED");
              else fail("S10: expected EXECUTED", `got=${execR.data.status}`);

              const outstanding = Number(execR.data.outstandingAmount);
              if (outstanding > 0) pass("S10: outstanding > 0 (partial recovery)", `R${outstanding}`);
              else fail("S10: outstanding should be > 0");

              const recovStatus = execR.data.recoveryStatus;
              if (["PARTIALLY_RECOVERED", "RECOVERY_IN_PROGRESS"].includes(recovStatus))
                pass("S10: recoveryStatus correct", recovStatus);
              else fail("S10: expected PARTIALLY_RECOVERED or RECOVERY_IN_PROGRESS", `got=${recovStatus}`);

              const cbFull    = await api("GET", `/clawbacks/${cb10Id}`, null, t2Admin);
              const recoveries = cbFull.data.recoveries ?? [];
              const futureOff  = recoveries.find(r => r.recoveryMethod === "FUTURE_COMMISSION_OFFSET");
              if (futureOff) pass("S10: FUTURE_COMMISSION_OFFSET record created", `amount=R${futureOff.amount}`);
              else           fail("S10: FUTURE_COMMISSION_OFFSET record missing");
            }
          }
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 11: Finance waives a clawback
  // ════════════════════════════════════════════════════════════════════════════
  section("Scenario 11: Finance Waives a Clawback");
  {
    const cr11 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "FULL", reasonCategory: "OTHER",
      reason: "Scenario 11: waive test",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.05, 2000)).toFixed(2),
    });

    if (cr11.status !== 201) {
      fail("S11: Create", JSON.stringify(cr11.data));
    } else {
      const cb11Id = cr11.data.id;
      const sr = await api("POST", `/clawbacks/${cb11Id}/action`, { action: "SUBMIT" }, t2Admin);
      if (sr.status !== 200) {
        fail("S11: SUBMIT", JSON.stringify(sr.data));
      } else {
        const wr = await api("POST", `/clawbacks/${cb11Id}/action`, {
          action: "WAIVE",
          waiveReason: "Sales executive experienced exceptional personal hardship — board approved",
        }, t2Finance);

        if (wr.status === 200 && wr.data.status === "WAIVED") {
          pass("S11: Finance WAIVE → WAIVED");
          const txs = await getWalletTxs(t2Exec);
          const pendingTx = txs.find(t => t.transactionType === "CLAWBACK_PENDING" && t.referenceId === cb11Id);
          if (!pendingTx) pass("S11: CLAWBACK_PENDING tx removed after waive");
          else            fail("S11: CLAWBACK_PENDING tx should be gone");
          if (wr.data.waiveReason?.includes("hardship")) pass("S11: waiveReason stored");
          else fail("S11: waiveReason not stored", wr.data.waiveReason);
        } else {
          fail("S11: WAIVE", `status=${wr.status} ${JSON.stringify(wr.data)}`);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 12: Sales exec disputes their own clawback
  // ════════════════════════════════════════════════════════════════════════════
  section("Scenario 12: Sales Executive Disputes Their Own Clawback");
  {
    const cr12 = await createCb(t2Admin, samEv1.id, {
      clawbackType: "FULL", reasonCategory: "CANCELLATION",
      reason: "Scenario 12: dispute test",
      clawbackAmount: Math.max(1, Math.min(samComm1 * 0.1, 3500)).toFixed(2),
    });

    if (cr12.status !== 201) {
      fail("S12: Create", JSON.stringify(cr12.data));
    } else {
      const cb12Id = cr12.data.id;
      const sr = await api("POST", `/clawbacks/${cb12Id}/action`, { action: "SUBMIT" }, t2Admin);
      if (sr.status !== 200) {
        fail("S12: SUBMIT", JSON.stringify(sr.data));
      } else {
        // Sam disputes her OWN clawback (salesExecutiveId = Sam)
        const dr = await api("POST", `/clawbacks/${cb12Id}/action`, {
          action: "DISPUTE",
          disputeNote: "The deal was not cancelled — client still active. Requesting review.",
        }, t2Exec);

        if (dr.status === 200 && dr.data.status === "DISPUTED") {
          pass("S12: Sam DISPUTE own clawback → DISPUTED");
          if (dr.data.disputeNote?.includes("still active")) pass("S12: disputeNote stored");
          else fail("S12: disputeNote not stored", dr.data.disputeNote);
          if (dr.data.disputedAt) pass("S12: disputedAt timestamp set");
          else fail("S12: disputedAt missing");
        } else {
          fail("S12: DISPUTE", `status=${dr.status} ${JSON.stringify(dr.data)}`);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 13: All clawback report endpoints return 200 + data
  // ════════════════════════════════════════════════════════════════════════════
  section("Scenario 13: Clawback Report Endpoints");
  {
    const reports = [
      "/reports/clawback-summary",
      "/reports/clawback-outstanding",
      "/reports/clawback-by-executive",
      "/reports/clawback-by-reason",
      "/reports/clawback-waived",
      "/reports/clawback-disputed",
      "/reports/clawback-by-industry",
      "/reports/clawback-transactions",
    ];

    for (const path of reports) {
      const r = await api("GET", path, null, t2Admin);
      const label = path.replace("/reports/", "");
      if (r.status === 200) pass(`S13: ${label} → 200`);
      else fail(`S13: ${label}`, `status=${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
    }

    // Disputed report returns { rows, totals } — rows have no .status field
    // (endpoint filters WHERE status=DISPUTED, so all rows are disputed by definition)
    const dispR = await api("GET", "/reports/clawback-disputed", null, t2Admin);
    const dispRows = dispR.data.rows ?? dispR.data.data ?? (Array.isArray(dispR.data) ? dispR.data : []);
    const hasDisputed = Array.isArray(dispRows) && dispRows.some(c => c.id && c.disputedAt);
    if (hasDisputed) pass("S13: DISPUTED clawback visible in disputed report", `count=${dispRows.length}`);
    else warn("S13: No DISPUTED clawback in disputed report yet");
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 14: Cross-tenant isolation
  // ════════════════════════════════════════════════════════════════════════════
  section("Scenario 14: Cross-Tenant Isolation");
  {
    if (!t1Event) {
      warn("S14: No T1 event — skipping");
    } else {
      // T2 admin cannot access T1 event
      const r = await api("GET", `/commission-events/${t1Event.id}`, null, t2Admin);
      if (r.status === 404) pass("S14: T2 cannot access T1 event (404)");
      else fail("S14: Cross-tenant event should be 404", `got ${r.status}`);

      // T2 admin cannot clawback a T1 event
      const cr = await createCb(t2Admin, t1Event.id, { clawbackAmount: 1000 });
      if (cr.status === 404 || cr.status === 403 || cr.status === 400)
        pass("S14: T2 cannot clawback T1 event", `status=${cr.status}`);
      else fail("S14: Should block cross-tenant clawback", `got=${cr.status}`);

      // T1 admin cannot see T2 clawbacks
      const t2CbsFromT1 = await api("GET", "/clawbacks", null, t1Admin);
      const t2CbList = Array.isArray(t2CbsFromT1.data) ? t2CbsFromT1.data : [];
      const leakage = t2CbList.some(c => c.tenantId === "demo-tenant-002");
      if (!leakage) pass("S14: T1 admin sees no T2 clawbacks");
      else          fail("S14: Tenant data leakage detected");
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ════════════════════════════════════════════════════════════════════════════
  console.log(results.join("\n"));
  console.log(`\n${"═".repeat(60)}`);
  console.log(`QA COMPLETE: ${PASS} passed  ${FAIL} failed  ${WARN} warnings`);
  console.log("═".repeat(60));
  if (FAIL > 0) process.exit(1);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
