---
name: pendingBalance bug
description: Wallet.pendingBalance was being corrupted by the payout creation route; correct behaviour and how to avoid re-introducing the bug.
---

## Rule
`Wallet.pendingBalance` must **only** be updated by the commission-events workflow (deal submission adds, deal approval removes). The payouts route must **never** read or write `pendingBalance`.

## Why
`payouts.ts` POST (create payout) was doing `pendingBalance: wallet.pendingBalance + amount`, which added the payout amount to `pendingBalance`. The wallet page then showed R 105,000 labelled "Pending Commission — Awaiting approval in the workflow" when those amounts were actually PAYROLL_APPROVED payouts awaiting bank transfer — nothing to do with the commission approval pipeline.

## How to apply
- In `payouts.ts`, wallet updates on payout REQUEST, REJECT, PAY must only touch `availableBalance`, `deferredBalance`, and `paidOutBalance` — never `pendingBalance`.
- `pendingBalance` = sum of `calculatedCommissionAmount` for deals currently in the approval pipeline (PENDING_APPROVAL → EXECUTIVE_APPROVED) that have not yet been credited to the wallet. Managed exclusively in `commission-events.ts`.
- If `pendingBalance` gets out of sync, fix it by setting it to 0 and letting the commission-events route repopulate it naturally as new deals are submitted.

## Related fix
- Removed `pendingBalance` writes from lines 168, 373, 471, 568 of `payouts.ts`
- Reset Joe Soap's `pendingBalance` to 0 via direct DB update after the corrupted value was discovered
