# nihas/V1.0.42 changelog

## Features

## Bug fixes
- Standard driving licences with a 6-digit serial (14 characters, e.g. WB01 2003692449) now pass Continue. The check only allowed 7 or 8 serial digits, so older West Bengal cards were rejected.

## Chore
- chore: start V1.0.42

## What
- Standard DL validation accepts a 6, 7, or 8 digit serial (14–16 characters). WB01 2003692449 is valid on the Standard format.

## Why
- New driver rejected that licence with "Use a valid DL number" even though the card number was typed in full.

## Areas
- Driving licence input (new driver form and the licence keypad).

## Migrations
- None

## Tested
- Jest DL suites pass, including WB01 2003692449. lint 101, typecheck 331 (baseline 350), cycles 94, lib-files 178, navigation-policy 64 pass. Full jest 5372 passed; IndentStagePoolView hit a worker SIGSEGV once and passed on rerun. Not clicked through in the UI.
