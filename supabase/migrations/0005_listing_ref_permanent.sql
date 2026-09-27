-- Listing IDs (PM-001, ...) follow arrival order and never change once assigned.
-- A number is given when a listing is saved into the pool (not while it's still a draft), so
-- abandoned drafts and duplicates don't burn numbers. Oldest listing = PM-001.

alter table listings alter column ref drop identity if exists;
alter table listings alter column ref drop not null;
create sequence if not exists listing_ref_seq;

-- One-time renumber of what's already there, oldest first (ties by dedupe_hash, which keeps
-- the seeded samples in their seed order). Drafts get no number yet.
update listings set ref = null;
with ordered as (
  select id, row_number() over (order by submitted_at, dedupe_hash nulls last, id) as n
  from listings where status <> 'draft'
)
update listings l set ref = o.n from ordered o where l.id = o.id;
select setval('listing_ref_seq', coalesce((select max(ref) from listings), 0) + 1, false);

create or replace function listings_ref_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.ref is not null and new.ref is distinct from old.ref then
    raise exception 'listing ref % is permanent', old.ref;
  end if;
  if new.ref is null and new.status <> 'draft' then
    new.ref := nextval('listing_ref_seq');
  end if;
  return new;
end $$;

drop trigger if exists listings_ref_guard on listings;
create trigger listings_ref_guard before insert or update on listings
  for each row execute function listings_ref_guard();
