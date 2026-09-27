-- Short, human-friendly listing IDs (shown as PM-001, PM-002, ...), assigned in arrival order.
alter table listings add column if not exists ref bigint generated always as identity;
create unique index if not exists listings_ref_key on listings(ref);
