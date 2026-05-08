Task 3.2 implemented the plan-specified AppContext, health routes, agent CRUD routes, server wiring, and index bootstrap.

The existing server test was adapted to the new `createServer(ctx)` signature with a minimal in-memory context using the actual logger, database, migration, and agent service modules available in this repo.
