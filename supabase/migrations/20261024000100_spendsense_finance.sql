-- SpendSense ledger: all application access uses the publishable key and authenticated RLS.
create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id text not null check (char_length(source_id) between 1 and 128),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (category in ('Income', 'Housing', 'Food & drink', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Other')),
  transaction_date date not null,
  amount_cents bigint not null check (amount_cents between 1 and 1000000000),
  type text not null check (type in ('income', 'expense')),
  note text check (note is null or char_length(note) <= 240),
  payment_method text check (payment_method is null or char_length(btrim(payment_method)) <= 48),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_transactions_category_matches_type check (
    (type = 'income' and category = 'Income') or
    (type = 'expense' and category <> 'Income')
  ),
  constraint finance_transactions_owner_source_unique unique (user_id, source_id)
);

create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id text not null check (char_length(source_id) between 1 and 128),
  category text not null check (category in ('Housing', 'Food & drink', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Other')),
  limit_cents bigint not null check (limit_cents between 1 and 1000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_budgets_owner_source_unique unique (user_id, source_id),
  constraint finance_budgets_owner_category_unique unique (user_id, category)
);

create index finance_transactions_user_date_idx on public.finance_transactions (user_id, transaction_date desc, id);
create index finance_transactions_user_category_date_idx on public.finance_transactions (user_id, category, transaction_date desc);
create index finance_budgets_user_idx on public.finance_budgets (user_id, category);

create function public.enforce_posted_transaction_date()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.transaction_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Posted transactions cannot be future dated.' using errcode = '22007';
  end if;
  return new;
end;
$$;

create trigger finance_transactions_posted_date
before insert or update of transaction_date on public.finance_transactions
for each row execute function public.enforce_posted_transaction_date();

create function public.touch_finance_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger finance_transactions_touch_updated_at
before update on public.finance_transactions
for each row execute function public.touch_finance_updated_at();
create trigger finance_budgets_touch_updated_at
before update on public.finance_budgets
for each row execute function public.touch_finance_updated_at();

alter table public.finance_transactions enable row level security;
alter table public.finance_budgets enable row level security;
alter table public.finance_transactions force row level security;
alter table public.finance_budgets force row level security;

grant usage on schema public to authenticated;
revoke all on table public.finance_transactions, public.finance_budgets from public, anon, authenticated;
grant select, delete on table public.finance_transactions, public.finance_budgets to authenticated;
grant insert (user_id, source_id, name, category, transaction_date, amount_cents, type, note, payment_method)
  on public.finance_transactions to authenticated;
grant update (name, category, transaction_date, amount_cents, type, note, payment_method)
  on public.finance_transactions to authenticated;
grant insert (user_id, source_id, category, limit_cents)
  on public.finance_budgets to authenticated;
grant update (category, limit_cents) on public.finance_budgets to authenticated;

create policy finance_transactions_select_own on public.finance_transactions
  for select to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy finance_transactions_insert_own on public.finance_transactions
  for insert to authenticated with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy finance_transactions_update_own on public.finance_transactions
  for update to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy finance_transactions_delete_own on public.finance_transactions
  for delete to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy finance_budgets_select_own on public.finance_budgets
  for select to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy finance_budgets_insert_own on public.finance_budgets
  for insert to authenticated with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy finance_budgets_update_own on public.finance_budgets
  for update to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy finance_budgets_delete_own on public.finance_budgets
  for delete to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create function public.replace_my_finance_data(p_transactions jsonb, p_budgets jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if jsonb_typeof(p_transactions) is distinct from 'array' then
    raise exception 'Invalid transaction import.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_transactions) > 20000 then
    raise exception 'Invalid transaction import.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_budgets) is distinct from 'array' then
    raise exception 'Invalid budget import.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_budgets) > 7 then
    raise exception 'Invalid budget import.' using errcode = '22023';
  end if;

  delete from public.finance_transactions where user_id = owner_id;
  delete from public.finance_budgets where user_id = owner_id;

  insert into public.finance_transactions (user_id, source_id, name, category, transaction_date, amount_cents, type, note, payment_method)
  select owner_id, value->>'source_id', value->>'name', value->>'category', (value->>'transaction_date')::date,
    (value->>'amount_cents')::bigint, value->>'type', nullif(value->>'note', ''), nullif(value->>'payment_method', '')
  from jsonb_array_elements(p_transactions) as entry(value);

  insert into public.finance_budgets (user_id, source_id, category, limit_cents)
  select owner_id, value->>'source_id', value->>'category', (value->>'limit_cents')::bigint
  from jsonb_array_elements(p_budgets) as entry(value);
end;
$$;

revoke all on function public.replace_my_finance_data(jsonb, jsonb) from public, anon;
grant execute on function public.replace_my_finance_data(jsonb, jsonb) to authenticated;
