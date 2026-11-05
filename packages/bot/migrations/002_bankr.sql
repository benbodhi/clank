-- Launches can now come from Bankr's feed, which has no block number.
ALTER TABLE launches ALTER COLUMN block_number DROP NOT NULL;
ALTER TABLE launches ADD COLUMN source text NOT NULL DEFAULT 'clanker';
CREATE INDEX launches_bankr_idx ON launches (launched_at DESC, token_address DESC) WHERE source = 'bankr';
