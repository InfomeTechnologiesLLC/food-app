# Development model cleanup — 13 October 2026

The project is in development and its database contains mock data. Schema changes should update that data directly, rather than leave runtime support for retired models or API responses.

A separate subagent audited the repository read-only. The following structural workarounds were removed in this change:

- Flat pantry rows plus a display grouping adapter: replaced by `PantryIngredient`, unique per user and normalized ingredient key, with explicit embedded stock batches.
- Zero-quantity records and hashed pantry IDs used for save retries: replaced by transactionally committed `StockOperation` receipts containing the purchase payload and batch references. Exhausted and deleted stock is physically removed.
- Persisted shopping requirements with `checked`/`stocked` flags and read-time rewrites: requirements are derived from remaining meals and current stock. Purchases are separate operations. GET requests do not save plans. Requirement IDs include the plan and stock-operation revision so a later identical requirement can be purchased again without replaying an earlier purchase.
- Loose meal ingredient fields, untyped plan settings, and empty-name/zero-quantity persistence fallbacks: meal ingredients and settings now have required schemas. Existing mock plans were validated and rewritten to the current model.
- Usage UI defaults that treated absent required limit fields as unlimited: removed. Only an explicit null limit means unlimited.
- Scan review quantity parsing silently substituted 1 for invalid quantities: removed, with an explicit positive-quantity validation message.
- Deprecated Mongoose `new: true` update options: replaced with `returnDocument: 'after'`.

The audit found no explicit old-version branches or alternate legacy models outside these areas. AI retries, unit aliases, plural normalization, Expo Go notification capability checks, optimistic rollback, and consumption snapshots for undo serve current product behavior and remain.

The configured development database was migrated transactionally: 21 retired pantry rows became 19 ingredients containing 20 positive stock batches. One exhausted banana row was removed; stock amounts were conserved. The two plans were updated, including a draft banana unit of `medium` corrected to `pcs`. Historical consumed quantities were preserved. The retired `pantryitems` collection was dropped. A pre-migration EJSON backup is saved locally at `/tmp/mealmind-stock-backup-1791865056893.ejson`.

Verification: unit tests plus integration tests (now MySQL, see `DATABASE.md`) in a disposable database cover uniqueness, concurrent additions, request replay, transaction rollback, scan confirmation, batch editing/deletion, shopping purchases, cooking, and undo. The integration database is dropped after the tests.

> Note (22 October 2026): the server moved from MongoDB/Mongoose to MySQL with Drizzle ORM. Collections are now tables; see `server/DATABASE.md`. The history above describes the MongoDB era.
