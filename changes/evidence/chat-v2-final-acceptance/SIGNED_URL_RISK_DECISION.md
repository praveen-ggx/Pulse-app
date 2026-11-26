# Signed URL risk decision — Chat V2 preprod

**Date:** 2026-11-26  
**Scope:** Trip / chat attachment signed URLs (`features/chat/utils/resolveChatDocumentUrl.util.ts`)  
**Environment:** Preprod only (`xbisiveavvbifbzyfhgy`)  
**Production:** not authorized by this decision

## Fact

- `SIGNED_EXPIRY_SEC = 3600` (one hour).
- Client cache TTL is 50 minutes to avoid serving near-expiry URLs.
- Driver reassignment / ACL revoke does **not** invalidate already-issued signed URLs; Storage signatures remain valid until expiry.
- New URL minting after revoke is blocked by storage/path authorization (Gate E PASS).

## Options considered

1. **Accept 3600s residual window** — document risk; rely on private bucket + short TTL + no public URLs.
2. **Remediate** — shorten TTL (e.g. 900s) and retest chat document open/cache paths.

## Decision (preprod release assurance)

**ACCEPT option 1 for preprod Chat V2 release assurance.**

Rationale:
- Attachments are on private `trip-documents`; URLs are not directory-listable.
- Residual exposure is time-bounded (≤60 minutes) for holders of a previously minted URL.
- Shortening TTL is a product/security tradeoff (more re-sign traffic, more broken mid-view links) and was not required to close preprod functional gates.
- Production ships only after a separate security countersignature of this same decision or a tested shorter-TTL change.

## Residual risk statement

A party who obtained a signed attachment URL while authorized may continue to fetch that object for up to one hour after authorization is revoked.

## Required for production GO

- Security owner countersigns this acceptance, **or**
- Shorter TTL is implemented, deployed, and retested on preprod.

## Sign-off

| Role | Name | Status |
|---|---|---|
| Release assurance (this session) | Agent on `release/chat-v2-preprod` | **ACCEPTED for preprod** |
| Security owner | — | **PENDING for production** |
