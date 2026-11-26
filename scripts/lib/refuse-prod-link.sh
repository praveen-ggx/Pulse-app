# shellcheck shell=bash
# Refuse accidental production-target CLI operations.
# Source from db-preflight / db-push / db-push-set.

refuse_prod_link() {
  local root="${1:-.}"
  local ref_file="$root/supabase/.temp/project-ref"
  local prod_ref="nafxpivddesgsrthmosv"
  local preprod_ref="xbisiveavvbifbzyfhgy"

  if [[ ! -f "$ref_file" ]]; then
    echo "ERROR: no linked Supabase project-ref (supabase/.temp/project-ref missing)." >&2
    echo "Relink ONLY to preprod ${preprod_ref} for Chat V2 / release work. Never link production ${prod_ref}." >&2
    return 1
  fi

  local ref
  ref="$(tr -d '[:space:]' <"$ref_file")"
  if [[ "$ref" == "$prod_ref" ]]; then
    echo "ERROR: linked project-ref is PRODUCTION (${prod_ref}). Refusing." >&2
    echo "Quarantine/relink to preprod ${preprod_ref} before db:preflight / db:push." >&2
    return 1
  fi
  return 0
}
