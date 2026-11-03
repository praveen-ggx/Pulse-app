# nihas/V1.0.40 changelog

## Trip report export redesign
- feat: new 12-column TripOps report contract (SR ID, TRIP ID, LR NO, CLIENT, SOURCE, DESTINATION, SUPPLIER, TRIP STATUS, ASSIGNED DATE, PICKUP, ARRIVED AT DROP, SOFT COPY UPLOADED BY) — replaces old 18-column layout
- feat: SR ID maps to indent_reference_code / source_indent_code (the sales/sourcing reference), not a sequential number
- feat: export date picker modal — user must select a date range (max 90 days) before downloading, preventing unbounded "all time" queries that hammered the DB
- feat: "SOFT COPY UPLOADED BY" column — batch-loads trip_documents.uploaded_by → profiles.full_name for POD/soft-copy uploads
- perf: removed unused driver phone enrichment queries from the ops preview table, reducing DB load on the Ledger Export modal
- fix: DateRangePickerModal labels now configurable (was hardcoded "AUDIT MATRIX" / "APPLY MIRROR")
- security: Excel formula injection protection — user-controlled cell values starting with =, +, -, @ are prefixed with a leading apostrophe
