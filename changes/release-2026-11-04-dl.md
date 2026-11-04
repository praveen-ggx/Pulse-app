# release/2026-11-04-dl — 14-character driving licences

Base: Vasanth `V1.0.1` (`ffdbc54f`). This branch is only the driving-licence fix.

## What
- Standard DL validation accepts a 6, 7, or 8 digit serial (14–16 characters). `WB01 2003692449` is valid on the Standard format.

## Why
- New driver rejected that licence with "Use a valid DL number". The card is state + RTO + year + a 6-digit serial (14 characters). The check only allowed 7 or 8 serial digits.

## Areas
- Driving licence input (new driver form and the licence keypad).

## Migrations
- None

## Tested
- Jest DL suites pass, including `WB01 2003692449`. Not clicked through in the UI.
