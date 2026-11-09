create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  phone text,
  saldo_cents bigint not null default 0 check (saldo_cents between 0 and 9007199254740991),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('panel_hosting', 'script_bot', 'vps', 'game_topup', 'subdomain', 'premium_app')),
  name text not null,
  description text not null default '',
  price_cents bigint not null check (price_cents > 0),
  stock integer not null default 0 check (stock >= 0),
  status text not null default 'available' check (status in ('available', 'unavailable')),
  image_path text,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  user_id uuid not null references public.users(id),
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('tng_qr', 'maybank')),
  receipt_path text,
  receipt_hash text unique,
  status text not null default 'awaiting_receipt' check (status in ('awaiting_receipt', 'pending', 'approved', 'rejected', 'expired')),
  bank_reference_no text,
  admin_id uuid references public.users(id),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (receipt_path is null and receipt_hash is null and status in ('awaiting_receipt', 'expired'))
    or (receipt_path is not null and receipt_hash is not null and status in ('pending', 'approved', 'rejected', 'expired'))
  )
);

create unique index if not exists deposit_requests_bank_reference_unique
  on public.deposit_requests (lower(bank_reference_no))
  where bank_reference_no is not null;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  user_id uuid not null references public.users(id),
  type text not null check (type in ('deposit', 'purchase')),
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text,
  deposit_request_id uuid unique references public.deposit_requests(id),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deposit_requests_user_created_idx on public.deposit_requests (user_id, created_at desc);
create index if not exists deposit_requests_status_created_idx on public.deposit_requests (status, created_at);
create index if not exists transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists products_category_status_idx on public.products (category, status);

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.deposit_requests enable row level security;
alter table public.transactions enable row level security;
alter table public.refresh_sessions enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.users, public.products, public.deposit_requests, public.transactions,
  public.refresh_sessions, public.notifications, public.audit_logs from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts-private', 'receipts-private', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.create_refresh_session(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.refresh_sessions (user_id, token_hash, expires_at)
  values (p_user_id, p_token_hash, p_expires_at);
$$;

create or replace function public.rotate_refresh_session(
  p_token_hash text,
  p_new_token_hash text,
  p_expires_at timestamptz
) returns table (user_id uuid, username text, email text, role text, saldo_cents bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.refresh_sessions%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_session
  from public.refresh_sessions
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    return;
  end if;

  select * into v_user from public.users where id = v_session.user_id;
  if not found then
    return;
  end if;

  update public.refresh_sessions set revoked_at = now() where id = v_session.id;
  insert into public.refresh_sessions (user_id, token_hash, expires_at)
  values (v_session.user_id, p_new_token_hash, p_expires_at);
  return query select v_user.id, v_user.username, v_user.email, v_user.role, v_user.saldo_cents, v_user.created_at;
end;
$$;

create or replace function public.revoke_refresh_session(p_token_hash text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.refresh_sessions
  set revoked_at = coalesce(revoked_at, now())
  where token_hash = p_token_hash and revoked_at is null;
$$;

create or replace function public.approve_deposit(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_bank_reference_no text
) returns public.deposit_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.deposit_requests%rowtype;
  v_user public.users%rowtype;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'admin_required';
  end if;
  if length(trim(coalesce(p_bank_reference_no, ''))) = 0 then
    raise exception 'bank_reference_required';
  end if;

  select * into v_request
  from public.deposit_requests
  where id = p_deposit_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'deposit_not_pending';
  end if;

  select * into v_user from public.users where id = v_request.user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_user.saldo_cents > 9007199254740991 - v_request.amount_cents then
    raise exception 'balance_limit_reached';
  end if;

  update public.deposit_requests
  set status = 'approved',
      bank_reference_no = trim(p_bank_reference_no),
      admin_id = p_admin_id,
      reviewed_at = now()
  where id = p_deposit_id
  returning * into v_request;

  update public.users
  set saldo_cents = saldo_cents + v_request.amount_cents
  where id = v_request.user_id;

  insert into public.transactions (order_id, user_id, type, deposit_request_id, amount_cents, status)
  values (v_request.reference_code, v_request.user_id, 'deposit', v_request.id, v_request.amount_cents, 'completed');

  insert into public.notifications (user_id, type, message)
  values (v_request.user_id, 'deposit_approved', 'Deposit ' || v_request.reference_code || ' telah diluluskan dan saldo anda dikemas kini.');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_admin_id, 'deposit.approve', 'deposit_request', v_request.id,
    jsonb_build_object('reference_code', v_request.reference_code, 'bank_reference_no', trim(p_bank_reference_no), 'amount_cents', v_request.amount_cents));

  return v_request;
end;
$$;

create or replace function public.reject_deposit(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_admin_note text
) returns public.deposit_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.deposit_requests%rowtype;
  v_reason text := trim(coalesce(p_admin_note, ''));
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'admin_required';
  end if;
  if length(v_reason) = 0 then
    raise exception 'rejection_reason_required';
  end if;

  select * into v_request
  from public.deposit_requests
  where id = p_deposit_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'deposit_not_pending';
  end if;

  update public.deposit_requests
  set status = 'rejected', admin_id = p_admin_id, admin_note = v_reason, reviewed_at = now()
  where id = p_deposit_id
  returning * into v_request;

  insert into public.notifications (user_id, type, message)
  values (v_request.user_id, 'deposit_rejected', 'Deposit ' || v_request.reference_code || ' ditolak: ' || v_reason);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_admin_id, 'deposit.reject', 'deposit_request', v_request.id,
    jsonb_build_object('reference_code', v_request.reference_code, 'reason', v_reason));

  return v_request;
end;
$$;

create or replace function public.purchase_product(p_user_id uuid, p_product_id uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_user public.users%rowtype;
  v_transaction public.transactions%rowtype;
  v_order_id text := 'ORD-' || upper(replace(gen_random_uuid()::text, '-', ''));
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found or v_product.status <> 'available' or v_product.stock < 1 then
    raise exception 'product_unavailable';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_user.saldo_cents < v_product.price_cents then
    raise exception 'insufficient_balance';
  end if;

  update public.users set saldo_cents = saldo_cents - v_product.price_cents where id = p_user_id;
  update public.products set stock = stock - 1, updated_at = now() where id = p_product_id;
  insert into public.transactions (order_id, user_id, type, product_id, product_name_snapshot, amount_cents, status)
  values (v_order_id, p_user_id, 'purchase', p_product_id, v_product.name, v_product.price_cents, 'completed')
  returning * into v_transaction;

  return v_transaction;
end;
$$;

create or replace function public.save_admin_product(
  p_admin_id uuid,
  p_product_id uuid,
  p_category text,
  p_name text,
  p_description text,
  p_price_cents bigint,
  p_stock integer,
  p_status text,
  p_metadata jsonb
) returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_action text;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'admin_required';
  end if;
  if p_category not in ('panel_hosting', 'script_bot', 'vps', 'game_topup', 'subdomain', 'premium_app')
    or p_price_cents <= 0 or p_stock < 0 or p_status not in ('available', 'unavailable') then
    raise exception 'invalid_product';
  end if;

  if p_product_id is null then
    insert into public.products (category, name, description, price_cents, stock, status, metadata)
    values (p_category, trim(p_name), coalesce(p_description, ''), p_price_cents, p_stock, p_status, coalesce(p_metadata, '{}'::jsonb))
    returning * into v_product;
    v_action := 'product.create';
  else
    update public.products
    set category = p_category, name = trim(p_name), description = coalesce(p_description, ''),
        price_cents = p_price_cents, stock = p_stock, status = p_status,
        metadata = coalesce(p_metadata, '{}'::jsonb), updated_at = now()
    where id = p_product_id
    returning * into v_product;
    if not found then
      raise exception 'product_not_found';
    end if;
    v_action := 'product.update';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_admin_id, v_action, 'product', v_product.id,
    jsonb_build_object('name', v_product.name, 'category', v_product.category, 'price_cents', v_product.price_cents, 'stock', v_product.stock, 'status', v_product.status));

  return v_product;
end;
$$;

create or replace function public.delete_admin_product(p_admin_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'admin_required';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_admin_id, 'product.delete', 'product', v_product.id, jsonb_build_object('name', v_product.name));
  delete from public.products where id = p_product_id;
end;
$$;

create or replace function public.set_admin_product_image(
  p_admin_id uuid,
  p_product_id uuid,
  p_image_path text,
  p_image_url text
) returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'admin_required';
  end if;

  update public.products
  set image_path = p_image_path, image_url = p_image_url, updated_at = now()
  where id = p_product_id
  returning * into v_product;
  if not found then
    raise exception 'product_not_found';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_admin_id, 'product.image.update', 'product', v_product.id,
    jsonb_build_object('image_path', p_image_path));

  return v_product;
end;
$$;

create or replace function public.expire_pending_deposits()
returns table (deposit_id uuid, user_id uuid, reference_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.deposit_requests%rowtype;
begin
  for v_request in
    select * from public.deposit_requests
    where status in ('awaiting_receipt', 'pending') and created_at < now() - interval '24 hours'
    for update skip locked
  loop
    update public.deposit_requests set status = 'expired' where id = v_request.id;
    insert into public.notifications (user_id, type, message)
    values (v_request.user_id, 'deposit_expired',
      'Permintaan deposit ' || v_request.reference_code || ' telah luput selepas 24 jam. Sila buat permintaan baharu jika anda masih mahu membuat deposit.');
    return query select v_request.id, v_request.user_id, v_request.reference_code;
  end loop;
end;
$$;

create or replace function public.admin_stats(p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'admin_required';
  end if;

  return jsonb_build_object(
    'users_count', (select count(*) from public.users where role = 'user'),
    'products_count', (select count(*) from public.products),
    'pending_deposits_count', (select count(*) from public.deposit_requests where status = 'pending'),
    'approved_deposits_cents', coalesce((select sum(amount_cents) from public.deposit_requests where status = 'approved'), 0),
    'completed_purchases_count', (select count(*) from public.transactions where type = 'purchase' and status = 'completed')
  );
end;
$$;

revoke all on function public.create_refresh_session(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.rotate_refresh_session(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_refresh_session(text) from public, anon, authenticated;
revoke all on function public.approve_deposit(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_deposit(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.purchase_product(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_admin_product(uuid, uuid, text, text, text, bigint, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_admin_product(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_admin_product_image(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.expire_pending_deposits() from public, anon, authenticated;
revoke all on function public.admin_stats(uuid) from public, anon, authenticated;

grant execute on function public.create_refresh_session(uuid, text, timestamptz) to service_role;
grant execute on function public.rotate_refresh_session(text, text, timestamptz) to service_role;
grant execute on function public.revoke_refresh_session(text) to service_role;
grant execute on function public.approve_deposit(uuid, uuid, text) to service_role;
grant execute on function public.reject_deposit(uuid, uuid, text) to service_role;
grant execute on function public.purchase_product(uuid, uuid) to service_role;
grant execute on function public.save_admin_product(uuid, uuid, text, text, text, bigint, integer, text, jsonb) to service_role;
grant execute on function public.delete_admin_product(uuid, uuid) to service_role;
grant execute on function public.set_admin_product_image(uuid, uuid, text, text) to service_role;
grant execute on function public.expire_pending_deposits() to service_role;
grant execute on function public.admin_stats(uuid) to service_role;
