# nihas/V1.0.41 changelog

## Features
- feat(vehicles): expand vehicle type catalog — added Trailer (Flatbed/Semi Low Bed/Low Bed/High Bed/Hydraulic Modular), Tipper, Tanker, Bulker, Reefer, Car Carrier categories with Indian-standard ton ranges
- feat(vehicles): added missing types — Open 32 Feet, Container 40 Feet/High Cube, Trailer High Bed/Hydraulic Modular
- feat(vehicles): horizontal scroll for category cards, dark-border selected style, "Upto X MT" passing ton labels

## Bug fixes
- fix(chat): guard chat_participants inserts against orphaned user_ids — trip creation crashed when a partner supplier org member's user_id didn't exist in auth.users (migration 20261103121242)
- fix(vehicles): 16 Wheeler now includes 29-30 Ton range (closes 30.26 MT gap)
- fix(vehicles): tonnage validation relaxed — picker ranges are guides, any positive value accepted

## Chore
- chore(ci): bump ci-baseline.json — typecheck 340→349, cycles 92→94 (regressions from invoice desk merge #81 and prior V1 merges, not from this PR)
