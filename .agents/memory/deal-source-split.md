---
name: Deal Source & Commission Split
description: Architecture and gotchas for the SELF/INTERNAL/EXTERNAL deal source tracking and automatic commission split feature
---

## What was built
- `ExternalProvider` model — ISP/partner directory per tenant (soft-delete via `isActive`)
- `CommissionSplitConfig` model — one row per tenant; `isEnabled` gates the whole feature
- `CommissionEvent` fields: `sourceType` (SELF/INTERNAL/EXTERNAL), `internalReferrerId`, `externalProviderId`, `splitReferrerName`, `splitDeductionAmount`
- Routes: `GET/POST/PUT/DELETE /api/external-providers`, `GET/PUT /api/commission-split-config`
- Split logic in `approvals.ts` → `computeAndApplySplit()`: runs before wallet credit; deducts from sales exec, credits referrer, records `COMMISSION_SPLIT_DEDUCTION` + `COMMISSION_SPLIT_CREDIT` transactions, stores `splitDeductionAmount` on the event

## Key rules
- Split only fires for `sourceType === "INTERNAL"` and when `CommissionSplitConfig.isEnabled === true`
- External provider source records the name but does NOT trigger a wallet split (no wallet for ISPs)
- `deductionType` is `PERCENTAGE` or `FLAT_AMOUNT`; for percentage, deduction = `calculatedCommission * (value/100)`, capped so sales exec net >= 0

**Why:** External providers don't have tenant user accounts, so they can't receive wallet credits. Only internal referrers have wallets.

## Frontend patterns
- `useAuth().user` returns the API /me shape; the user ID field is `.id` (not `.userId`)
- `ExternalProviderPicker` combobox: use `onMouseDown` with `e.preventDefault()` on dropdown items so the input `onBlur` doesn't fire before the click registers
- Deal source section in deals.tsx is hidden when `splitConfig?.isEnabled` is false — admin must enable it in Company Settings first
- `useSplitConfig`, `useTenantUsers`, `useExternalProviders` are standalone hooks in deals.tsx (not shared lib) — keep them close to their usage

## Adding new routes
After creating a new route file and registering it in `routes/index.ts`, the tsx dev server **must be restarted** to pick up the new file — hot-reload does not detect new module imports in index files.
