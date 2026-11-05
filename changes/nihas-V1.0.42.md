# nihas/V1.0.42 changelog

## Features

## Bug fixes
- Standard driving licences with a 6-digit serial (14 characters, e.g. WB01 2003692449) now pass Continue. The check only allowed 7 or 8 serial digits, so older West Bengal cards were rejected.
- Release-set frozen check no longer rejects remote-history placeholder files (fixes preprod push when a frozen version is already applied).

## Chore
- chore: start V1.0.42
- Added preprod release set `preprod-2026-11-05-finance-driver-cancel` (11 migrations, SHA-256 pinned, Jest guard test). Applied to preprod.
- Added `/mir` slash command for MIR data analytics queries.
- Added `MIR/` to .gitignore.

## What
- Standard DL validation accepts a 6, 7, or 8 digit serial (14–16 characters). WB01 2003692449 is valid on the Standard format.

## Why
- New driver rejected that licence with "Use a valid DL number" even though the card number was typed in full.

## Areas
- Driving licence input (new driver form and the licence keypad).

## Migrations
- 11 applied to preprod via release set (chat auth guard, DCO self book, driver offline, invoice stack ×6, trip assigner audit, integrated cancel reason). None new in this branch.

## Tested
- Jest DL suites pass, including WB01 2003692449. lint 101, typecheck 331 (baseline 350), cycles 94, lib-files 178, navigation-policy 64 pass. Full jest 5372 passed; IndentStagePoolView hit a worker SIGSEGV once and passed on rerun. Not clicked through in the UI.
