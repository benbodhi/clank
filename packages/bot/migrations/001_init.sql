CREATE TABLE launches (
    chain_id          bigint NOT NULL,
    token_address     text NOT NULL,
    version           text NOT NULL,
    tx_hash           text NOT NULL,
    block_number      bigint NOT NULL,
    launched_at       timestamptz NOT NULL,

    name              text NOT NULL,
    symbol            text NOT NULL,
    image_url         text,
    pool_id           text,
    supply            text,
    buy_tax_percent   numeric(6, 3),
    sell_tax_percent  numeric(6, 3),

    deployer          text NOT NULL,
    -- False when the launch came through another contract, so the sender proves nothing.
    deployer_is_signer boolean NOT NULL,
    deployer_vetted   boolean NOT NULL,
    deployer_name     text,
    creator           text,
    -- Lowercase wallet of whoever is behind the launch, for counting their launches:
    -- the creator when a vetted wallet deployed on their behalf, otherwise the deployer.
    actor             text NOT NULL,
    fee_recipients    jsonb NOT NULL DEFAULT '[]',

    interface         text,
    platform          text,
    platform_trusted  boolean NOT NULL DEFAULT false,

    identity_kind     text NOT NULL,
    identity_verified boolean NOT NULL,
    identity_proof    text,
    fid               bigint,
    farcaster_username text,
    follower_count    integer,
    x_handle          text,
    x_post_url        text,
    cast_hash         text,
    linked_role       text,
    linked_wallet     text,
    conflicting_fid   bigint,

    posted            boolean NOT NULL DEFAULT false,
    skip_reason       text,
    created_at        timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (chain_id, token_address)
);

CREATE INDEX launches_feed_idx ON launches (launched_at DESC, token_address DESC);
CREATE INDEX launches_identified_idx ON launches (launched_at DESC, token_address DESC) WHERE identity_kind <> 'none';
CREATE INDEX launches_proven_idx ON launches (launched_at DESC, token_address DESC) WHERE identity_verified;
CREATE INDEX launches_actor_idx ON launches (actor, launched_at DESC);
CREATE INDEX launches_fid_idx ON launches (fid) WHERE fid IS NOT NULL;
CREATE INDEX launches_token_lower_idx ON launches (lower(token_address));
CREATE INDEX launches_deployer_lower_idx ON launches (lower(deployer));

CREATE TABLE watcher_state (
    chain_id   bigint PRIMARY KEY,
    next_block bigint NOT NULL,
    recent     jsonb NOT NULL DEFAULT '[]',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The web service LISTENs on this, so it needs no connection to the bot.
CREATE FUNCTION notify_new_launch() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('launches', NEW.chain_id || ':' || NEW.token_address);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER launches_notify AFTER INSERT ON launches
    FOR EACH ROW EXECUTE FUNCTION notify_new_launch();
