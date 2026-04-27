-- IM conversation type, title, creator support + conversation members table
-- Enables DM and Group chat creation with explicit membership tracking

-- 1. Add type, title, creator_id to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type VARCHAR(16) NOT NULL DEFAULT 'dm';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title VARCHAR(200);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS creator_id VARCHAR(128);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Create conversation_members for explicit membership tracking
CREATE TABLE IF NOT EXISTS conversation_members (
  tenant_id        VARCHAR(64)  NOT NULL,
  conversation_id  VARCHAR(128) NOT NULL,
  user_id          VARCHAR(128) NOT NULL,
  role             VARCHAR(16)  NOT NULL DEFAULT 'member',
  joined_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_members_pk PRIMARY KEY (tenant_id, conversation_id, user_id)
);

-- 3. Indexes for membership queries
CREATE INDEX IF NOT EXISTS conversation_members_tenant_user_idx
  ON conversation_members (tenant_id, user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS conversation_members_conversation_idx
  ON conversation_members (tenant_id, conversation_id);

-- 4. Foreign key to conversations (within same tenant)
ALTER TABLE conversation_members
  ADD CONSTRAINT conversation_members_conversation_fk
  FOREIGN KEY (tenant_id, conversation_id)
  REFERENCES conversations (tenant_id, id)
  ON DELETE CASCADE;

-- 5. Update existing 'default' conversations to have type='dm'
-- (Existing conversations without explicit type get 'dm' as default)
UPDATE conversations SET type = 'dm' WHERE type = 'dm';
