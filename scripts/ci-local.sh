#!/usr/bin/env bash
# Run the same 7 jobs as .github/workflows/architecture-check.yml on this machine.
# Use when GitHub Actions can't run (billing). Run from the repo root of the commit you want to check.
#
#   bash scripts/ci-local.sh            # all jobs
#   bash scripts/ci-local.sh lint tsc   # only some: lint cycles lib v2 nav tsc jest
#
# Exit code 0 only if every selected job passes. Summary is printed at the end.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

jobs=("$@")
[ ${#jobs[@]} -eq 0 ] && jobs=(lib lint cycles v2 nav tsc jest)

declare -a names results
fail=0
run() {
  local key="$1" name="$2"; shift 2
  echo "=== $name"
  local start=$SECONDS
  if "$@"; then results+=("PASS  $name ($((SECONDS - start))s)")
  else results+=("FAIL  $name ($((SECONDS - start))s)"); fail=1; fi
}

for j in "${jobs[@]}"; do
  case "$j" in
    lib)    run lib    "lib/ root file count gate"       node scripts/ci-baseline.js lib-files ;;
    lint)   run lint   "Domain boundary lint"            env NODE_OPTIONS=--max-old-space-size=4096 node scripts/ci-baseline.js lint ;;
    cycles) run cycles "Circular dependency check"       node scripts/ci-baseline.js cycles ;;
    v2)     run v2     "Pulse V2 isolation (first slice)" env NODE_OPTIONS=--max-old-space-size=4096 npm run -s test:v2 ;;
    nav)    run nav    "Navigation policy gates"         env NODE_OPTIONS=--max-old-space-size=4096 npm run -s test:navigation-policy ;;
    tsc)    run tsc    "App TypeScript (strict)"         env NODE_OPTIONS=--max-old-space-size=8192 node scripts/ci-baseline.js typecheck ;;
    jest)   run jest   "App unit tests (Jest)"           env NODE_OPTIONS=--max-old-space-size=4096 npm test -s -- --ci --passWithNoTests --forceExit --silent ;;
    *) echo "unknown job: $j (use lint cycles lib v2 nav tsc jest)"; exit 2 ;;
  esac
done

echo
echo "===== Local Architecture Check @ $(git rev-parse --short HEAD) ====="
printf '%s\n' "${results[@]}"
[ $fail -eq 0 ] && echo "ALL GREEN" || echo "SOME FAILED"
exit $fail
