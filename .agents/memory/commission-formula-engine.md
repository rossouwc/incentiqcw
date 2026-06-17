---
name: Commission Formula Engine
description: Pure-TS formula engine for all 9 industry verticals; lives in both backend and frontend lib folders (duplicated, no shared lib needed).
---

## Location
- Backend: `artifacts/api-server/src/lib/commission-formula.ts`
- Frontend: `artifacts/incentiq/src/lib/commission-formula.ts` (identical copy)

## Key exports
- `calculateCommission(industryCode, formData, commissionPercentage)` → `CalcResult`
- `CalcResult.lineItems` — step-by-step breakdown for UI rendering
- `CalculationType` — 12 supported types

## Industry → CalcType mapping
| Industry code | CalcType |
|---|---|
| IT_CONSULTING | GP_PERCENTAGE |
| RECRUITMENT | PLACEMENT_FEE_PERCENTAGE (dispatches on `placementType` field: Permanent vs Contract) |
| INSURANCE | ANNUAL_PREMIUM_PERCENTAGE or MONTHLY_PREMIUM_PERCENTAGE (dispatches on `commissionType` field) |
| VEHICLE_DEALERSHIP | VEHICLE_GP_PLUS_PRODUCTS |
| PROPERTY_SALES | PROPERTY_AGENCY_SPLIT |
| RENTAL_MANAGEMENT | RENTAL_PLACEMENT_FEE (dispatches on `placementFeeType` field) |
| TELECOM | CONTRACT_VALUE_PERCENTAGE |
| SAAS | ARR_PERCENTAGE |
| CUSTOM | CUSTOM |

## Backend integration
- `POST /api/commission-events` calls `calculateCommission` and writes all financial fields to DB
- `GET /api/commission-events/field-config` now includes `defaultCommissionPct` (from user's commission rules lookup), allowing frontend live preview to use the real rate

## Frontend integration
- `CalcBreakdown` component in `deals.tsx` renders `CalcResult.lineItems` as a step-by-step panel
- `calcResult` useMemo calls `calculateCommission(fc.industryCode, formValues, fc.defaultCommissionPct)`

## Why duplicated (not a shared lib)
Avoided complexity of adding a composite lib package just for a dependency-free utility. Both copies are identical — if logic changes, update both.
