Task 3.1 implemented the plan-specified agent ID helper and agent service.

The service encrypts Linear client secrets, webhook secrets, and Hermes connector configuration before writing to SQLite, and decrypts those fields only through `getBySlugWithSecrets`. Summary reads intentionally omit secret fields.
