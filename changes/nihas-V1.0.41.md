# nihas/V1.0.41 changelog

## Bug fixes
- fix(chat): guard chat_participants inserts against orphaned user_ids — trip creation crashed when a partner supplier org member's user_id didn't exist in auth.users (migration 20261103121242)
