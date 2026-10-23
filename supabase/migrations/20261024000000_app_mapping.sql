-- Growth metric mapping per app: what detection found, and what people set by hand.
alter table public.apps add column mapping jsonb, add column detected jsonb;
