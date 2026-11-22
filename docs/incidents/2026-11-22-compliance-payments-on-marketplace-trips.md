# Compliance payments on Marketplace trips stayed in "Pending"

**Date:** 22 Nov 2026 · **Reported by:** Dhira (Finance) · **Fix:** nihas V1.0.67, migration `20261122124730`

## What Finance saw

On some trips, Finance entered the UTR and clicked **Confirm payment** in Compliance. The trip did not move to **Paid**. It stayed in **Pending** and no UTR showed. Clicking again gave an error like *"over_settlement: ₹42,700 would take recorded payments to ₹85,400 against an agreed ₹48,000"*.

## What actually happened

The payment **was saved**, but in a different place.

These are **Marketplace (Pulse Exchange) trips**, where the supplier won the load through the marketplace. For these trips the system has a rule: a payment to the marketplace supplier is first recorded as a **claim** in Pulse Exchange. The supplier must then **confirm** it, and only after that is the payment posted to Finance. This is the "two-gate" design: payer claims, payee confirms.

So when Finance clicked Confirm payment:

1. The app turned the payment into an Exchange **claim** with the amount and UTR. Example: TRP002681, ₹42,220, UTR HSBCN32309042576, recorded by Dhira at 10:49 on 22 Nov, status **claimed**.
2. The Compliance screen did not know about this "waiting for supplier" state. It showed nothing and left the trip in Pending.
3. No supplier confirmed any claim, so nothing was ever posted.
4. Clicking again tried to claim the same money twice, so the over-settlement check stopped it. That check is correct.

## Who changed what, and when (with proof)

| When | Who | Change | Proof |
|---|---|---|---|
| 16 Sep 2026 | Vasanth | Compliance "Confirm payment" saves through the shared Finance save function (`createLedgerEntry`) | commit `e7faf3fae` "finalize trip compliance and settlement workflow" |
| 7 Oct 2026 | Vasanth | Pulse Exchange: on a Marketplace trip, a payment to the counterparty is turned into an Exchange claim instead of a Finance entry (app), and the database refuses a direct entry (guard `tg_transactions_pulse_exchange_guard`) | app commit `6f1915013` "canonical Marketplace counterparty accounts", released to prod in `7a2e008f8` (7 Oct); migrations `20271006144616_pulse_exchange_default_party_and_two_gate_payments`, `20271006184500_pulse_exchange_canonical_counterparty_accounts`, both applied on prod |

Each change was correct for its own feature. Together they mean: **Compliance payments on Marketplace trips silently become claims that wait for the supplier.** Compliance was never updated for this. Nobody changed this behaviour recently: the 18–21 Nov releases did not touch this path.

## Why it showed up only now, not on 7 Oct

The rule has been live since 7 Oct, but it only matters when a **Marketplace trip reaches advance payment**. That almost never happened until mid-November.

**Advances approved per day, and how many were Marketplace trips (prod):**

| Days | Advances approved | Marketplace trips |
|---|---|---|
| 24 Oct – 6 Nov | 7–45 per day | **0 every day** |
| 7 Nov | 19 | 1 |
| 9–15 Nov | 5–58 per day | 0 |
| 16 Nov | 29 | 3 |
| 17 Nov | 48 | **20** |
| 18 Nov | 62 | **16** |
| 19–21 Nov | 27–33 per day | 1–3 |

**Exchange claims created by Compliance payments (prod, all by Dhira, all still "claimed", none confirmed):**

| Date | Claims |
|---|---|
| 7 Nov | 1 (TRP002125) |
| 17 Nov | 3 (TRP002537, TRP002531, TRP002525) |
| 22 Nov | 38 |

Two more things made today the first time it was clearly seen:

- From 18 Nov evening **no advance could be paid at all**, because of a separate bug in the payment check (fixed 21 Nov, migration `20261121113052`). The Marketplace trips approved on 17–18 Nov waited until today.
- Today Finance paid the backlog at once: **128 normal advances posted fine**, and the **38 Marketplace trips** in the same run all became unconfirmed claims.

The 4 earlier claims (7 and 17 Nov) went unnoticed. Those trips are still unpaid in Compliance.

## Decision

Vasanth, 22 Nov: **option (b)**. GOGOVAN books these payments in its own ledger. There is no shared ledger with the supplier, so no supplier confirmation is needed.

## The fix

1. **App** (`features/finance/services/finance.service.ts`): Compliance advance and balance payments are no longer turned into Exchange claims, even on Marketplace trips. Other payments to the marketplace supplier still go through Exchange as before.
2. **Database** (migration `20261122124730`, set `compliance-direct-on-exchange-trips`): the Exchange guard lets `compliance_advance` and `compliance_balance` through. Exchange entries, the Marketplace fee party, and other direct payments to the marketplace supplier stay blocked. The function is the live prod version with only that one exception added.
3. **Clean-up** (same migration): the 42 open claims created by Compliance payments are set to **cancelled**, the same thing "withdraw claim" does. Without this, a supplier could still confirm an old claim later and create a **second** payment once Finance re-posts.

## Proof the fix works (preprod, inside a transaction that was rolled back)

| Test | Old guard | New guard |
|---|---|---|
| Compliance advance to the marketplace supplier on a Marketplace trip | Blocked ("Marketplace partner you are not connected to…") | **Posts** |
| Ordinary payment to the same supplier | Blocked | Still blocked |
| Exchange entry (`EXCHANGE_PAYMENT`) | Blocked | Still blocked |

Preprod was unchanged after the test. App tests cover the same rules (`createLedgerEntry.pulseExchange.test.ts`).

## After release: what Finance does

The 42 cancelled claims must be **paid again in Compliance**: Confirm payment with the same amount and UTR. All 42 amounts match the approved advance. Finance has the list with trip, supplier, amount, UTR and date (shared separately; it is not in the repo because it holds UTRs). No re-approval is needed.

## Rollback

Prod's current guard is saved (`tg_transactions_pulse_exchange_guard`, captured 22 Nov before the change). Running it restores the old rule. Cancelled claims stay cancelled.
