# Chat V2 security closure evidence (preprod)

**Project:** `xbisiveavvbifbzyfhgy`  
**Not used:** `nafxpivddesgsrthmosv`  

## Artifacts

| File | Purpose |
|---|---|
| `reassign_matrix.sql` | Disposable A–E driver reassignment matrix (returns `MATRIX_PASS`) |
| `jest-chat.txt` | Jest chat suite capture |
| `../network-award-auth-recovery/DRIVER_REASSIGN_PREPROD_ACCEPTANCE.md` | Prior reassignment acceptance |

## Run results (2026-11-26)

- `MATRIX_ABF_PASS` — Team 1:1 + private channel + message immutability under `SET LOCAL ROLE authenticated`
- `MATRIX_PASS` — driver reassignment A–E
- `ROOM_ACL_PASS` — previous driver loses trip-room SELECT after reassign; new driver retains history
- Metadata suite `supabase/tests/chat_v2_phase_b_security.sql` — no exception
- Migration applied: `chat_v2_channel_update_acl_and_archive` (`20261125202715`)

## Reports

- `docs/PULSE_CHAT_V2_SECURITY_ACCEPTANCE.md`
- `docs/PULSE_CHAT_V2_RELEASE_READINESS.md`
