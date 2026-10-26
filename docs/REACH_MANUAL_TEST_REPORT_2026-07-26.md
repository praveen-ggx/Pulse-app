# Pulse Boost — Manual Testing Report

**Tested by:** Nihas
**Date:** 26 July 2026
**Branch:** `production` @ `ab4d6e74`
**What was tested:** The Reach / Boost feature from the last three merges
**Test accounts:** `nihas@gmail.com` (nihas logs) and `suresh@gmail.com` (Paperkraft)

Every finding below was checked against the live database, not just what the screen showed.

---

## Summary

| # | Finding | Severity |
|---|---|---|
| 1 | Cash boosts go live without anyone paying | 🔴 Blocker |
| 2 | Reward budget doesn't save the amount typed | 🟠 High |
| 3 | Credit balance shows a stale number until page refresh | 🟡 Medium |
| 4 | "Upgrade" shows on campaigns already at top plan | ⚪ Minor |
| 5 | Impressions count on render, not on actual viewing | ⚪ Known/intended |
| 6 | AJIO wallet is short 250 credits (pre-existing) | 🔴 Blocker |

---

## 1. Cash boosts go live without anyone paying 🔴

**What I did**
Boosted a load ("Rice Bags", Salem → Mumbai) and chose **Cash / Card** instead of credits.

**What happened**
The campaign went **live straight away** and started delivering. No money taken, no credits taken. The campaign list shows it as "Active" with "0 Credits" spent.

**Why it matters**
The payment record itself says "pending" — so the system knows it wasn't paid, but runs the campaign anyway. Anyone can pick Cash and get free advertising.

**Evidence**

| Field | Value | Should be |
|---|---|---|
| Purchase status | `pending : money` (unpaid) | — |
| Campaign status | `active` | `draft` |
| Published date | filled in | empty |
| Credits taken | 0 | 0 (correct, but shouldn't be live) |

**Where to look**
The publish function creates every campaign as active whichever payment method is picked. The earlier fix that kept cash boosts as "Draft" (migration `20261228000000`) was overwritten by a later migration.

---

## 2. Reward budget doesn't save what I typed 🟠

**What I did**
Boosted a load with driver rewards turned on. Reward per driver **500**, budget field **5000**.

**What happened**
The system saved the budget as **500**, not 5000. Only 500 was locked aside instead of 5000.

**Why it matters**
A customer setting a 5000 budget expecting 10 driver rewards would only get 1.

**Note:** Needs confirming whether the 5000 was typed in or left at the default — that decides whether this is data loss or just a wrong default value.

---

## 3. Credit balance shows a stale number until refresh 🟡

**What I did**
Boosted three loads one after another, watching the balance at the top of the Reach screen.

**What happened**
It kept showing **9,500** when the real balance was already down to **8,750**. Only a hard page refresh showed the correct number.

Same with the campaign counter — it read "150% live" until refresh, then corrected itself to "100% live".

**Why it matters**
Customers will believe they have more credits than they actually do.

---

## 4. Upgrade button shows at top plan ⚪

The "Upgrade" action still appears on campaigns already on the highest plan. Already noted in your own docs as non-blocking.

---

## 5. Impressions count on render ⚪

Impressions are counted the moment a story loads on screen, even if the user never scrolls to it. Numbers will read high. Documented as intended for now.

---

## 6. AJIO wallet is short 250 credits 🔴

Not from my testing — found while checking the database.

AJIO's wallet shows a balance of **4,500**, but earned minus spent works out to **4,250**. So **250 credits exist that were never paid for**.

This looks like the wallet integrity issue already documented in `PILOT_ENTRY_VALIDATION.md`. 1 of 6 wallets affected.

---

## What worked properly ✅

- **Boosting with credits** — exact right amount taken, every time
- **Campaign goes live** with the correct plan and 48-hour window
- **Load details** — name, route, vehicle, fare all display correctly on cards and detail screen
- **Driver reward escrow** — recorded as a separate reserved amount, not as spending. The concept is right.
- **Credit ledger** — adds up perfectly, no drift on the test org
- **Granting credits** from the admin console works, ledger row created correctly
- **Ad preview** and audience mix render fine

---

## Test results by area

| Area | Result |
|---|---|
| Boost with credits | ✅ Pass |
| Boost with cash | 🔴 **Fail** — goes live unpaid |
| Driver rewards + escrow | 🟠 Partial — mechanics right, budget value wrong |
| Campaign list and detail | ✅ Pass |
| Admin console — grant credits | ✅ Pass |
| Credit ledger accuracy | ✅ Pass |

---

## Couldn't test — and why

| What | Why |
|---|---|
| Driver recommend → fleet owner inbox → reward payout | The database doesn't allow drivers to be fleet members yet, so every driver shows as "independent" and the Recommend button never appears. This is the ADR-010 item in your own doc. |
| Counter-offer on quotes | Migration `20270111000000` is in the code but not applied to the database. |
| Referral invite links | Our test orgs don't have referral codes. |

---

## Still to test

- Cancel a campaign and confirm the reserved reward money comes back
- Delete a story that has a live campaign — check the warning dialog appears
- Upgrade a campaign and confirm only the price difference is charged
- Log in as a second org and confirm sponsored stories appear, and impressions stop reading zero
- Narrow screen / mobile width check
- Cron job health and escrow balance queries

---

## Test data created

Org **nihas logs** (`89427247-b09c-444b-ac85-17c1bf9fdf20`), granted 10,000 credits:

| Load | Route | Plan | Payment | Result |
|---|---|---|---|---|
| Steel Coils | Chennai → Bengaluru | Growth (500) | Credits | ✅ correct |
| Rice Bags | Salem → Mumbai | Starter (250) | Cash | 🔴 live unpaid |
| FMCG Cartons | Madurai → Hyderabad | Starter (250) | Credits + reward | 🟠 budget wrong |

Balance after testing: **8,750** (10,000 − 500 − 250 − 500 escrow)
