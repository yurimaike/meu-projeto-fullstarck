-- Prevent concurrent requests from linking the same external identity
-- to multiple local users, or creating duplicate provider links for one user.
-- Before applying this migration to an existing database, check for duplicates:
-- SELECT providerId, accountId, COUNT(*) FROM account
-- GROUP BY providerId, accountId HAVING COUNT(*) > 1;
-- SELECT userId, providerId, COUNT(*) FROM account
-- GROUP BY userId, providerId HAVING COUNT(*) > 1;
-- Resolve any reported duplicates through an explicit account-reconciliation
-- process; do not automatically delete identity records.

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_provider_account
  ON account (providerId, accountId);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_user_provider
  ON account (userId, providerId);
