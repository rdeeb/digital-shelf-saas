ALTER TABLE "users"
    ADD COLUMN "email" TEXT,
    ADD COLUMN "passwordHash" TEXT,
    ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
    ADD COLUMN "activationState" TEXT NOT NULL DEFAULT 'account_created';

UPDATE "users"
SET
    "email" = "id" || '@steam.placeholder.local',
    "passwordHash" = 'steam-only-migrated-account',
    "activationState" = CASE
        WHEN "steamId64" IS NULL THEN 'pending_activation'
        ELSE 'active'
    END
WHERE "email" IS NULL;

ALTER TABLE "users"
    ALTER COLUMN "email" SET NOT NULL,
    ALTER COLUMN "passwordHash" SET NOT NULL,
    ALTER COLUMN "steamId64" DROP NOT NULL;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "account_completion_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_completion_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_completion_tokens_tokenHash_key" ON "account_completion_tokens"("tokenHash");
CREATE INDEX "account_completion_tokens_userId_purpose_idx" ON "account_completion_tokens"("userId", "purpose");

ALTER TABLE "account_completion_tokens"
    ADD CONSTRAINT "account_completion_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
