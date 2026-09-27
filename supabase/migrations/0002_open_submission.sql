-- Anyone can send a listing to the bot (no linked identity needed), so keep the sender's display name.
alter table listings add column if not exists submitted_by_name text;
