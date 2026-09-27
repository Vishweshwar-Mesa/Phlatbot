-- Bedrooms matter for three people: each person says whether they're OK sharing a bedroom.
alter table preferences add column if not exists ok_to_share_room boolean;
