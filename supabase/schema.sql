-- =====================================================================
-- Tea Craft: Supabase schema
-- Run once in: Supabase dashboard > SQL Editor > New query > paste > Run
-- Safe to re-run: it only creates things that don't exist yet.
-- =====================================================================

-- ---------- Admin accounts ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins for select to authenticated using (user_id = auth.uid());

-- ---------- Site information (always exactly one row) ----------
create table if not exists public.site_info (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Tea Craft',
  tagline text not null default 'Sip · Create · Inspire',
  email text not null default 'teacraftnz@gmail.com',
  phone text not null default '',
  address text not null default E'Beachside location\nNew Zealand',
  hours_text text not null default 'Every day · 10am–7pm',
  open_hour int not null default 10 check (open_hour between 0 and 23),
  close_hour int not null default 19 check (close_hour between 1 and 24),
  announcement_enabled boolean not null default false,
  announcement_text text not null default '',
  ordering_enabled boolean not null default true,
  payments_mode text not null default 'mock' check (payments_mode in ('mock','in_store','stripe')),
  instagram_url text not null default '',
  tiktok_url text not null default '',
  facebook_url text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.site_info (id) values (1) on conflict (id) do nothing;
alter table public.site_info enable row level security;
drop policy if exists "site info is public" on public.site_info;
create policy "site info is public" on public.site_info for select to anon, authenticated using (true);
drop policy if exists "admin edits site info" on public.site_info;
create policy "admin edits site info" on public.site_info for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists site_info_touch on public.site_info;
create trigger site_info_touch before update on public.site_info for each row execute function public.touch_updated_at();

-- ---------- Menu ----------
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 300),
  category text not null default 'milk' check (category in ('milk','fruit','matcha','dessert')),
  price numeric(8,2) not null check (price >= 0 and price < 1000),
  image_url text not null default '',
  badge text not null default '' check (length(badge) <= 24),
  is_active boolean not null default true,      -- false = hidden from the menu
  is_available boolean not null default true,   -- false = shown as "Sold out"
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;
drop policy if exists "public sees active menu" on public.menu_items;
create policy "public sees active menu" on public.menu_items for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "admin manages menu" on public.menu_items;
create policy "admin manages menu" on public.menu_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists menu_items_touch on public.menu_items;
create trigger menu_items_touch before update on public.menu_items for each row execute function public.touch_updated_at();

-- ---------- Sizes and toppings ----------
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('size','topping')),
  name text not null check (length(trim(name)) between 1 and 40),
  price numeric(8,2) not null default 0 check (price >= 0 and price < 100),
  is_active boolean not null default true,
  sort_order int not null default 100,
  unique (kind, name)
);
alter table public.addons enable row level security;
drop policy if exists "public sees active addons" on public.addons;
create policy "public sees active addons" on public.addons for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "admin manages addons" on public.addons;
create policy "admin manages addons" on public.addons for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Orders (created only through create_order()) ----------
create sequence if not exists public.order_seq start 1001;
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('TC-' || nextval('public.order_seq')),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  pickup_time text not null default 'As soon as possible',
  notes text not null default '',
  items jsonb not null,
  total numeric(10,2) not null,
  status text not null default 'new' check (status in ('new','preparing','ready','completed','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','failed','refunded')),
  payment_method text not null default 'counter' check (payment_method in ('card','counter')),
  payment_provider text check (payment_provider in ('mock','stripe')),
  payment_ref text,
  card_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders (created_at desc);
alter table public.orders enable row level security;
drop policy if exists "admin reads orders" on public.orders;
create policy "admin reads orders" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "admin updates orders" on public.orders;
create policy "admin updates orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- ---------- Bookings ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, phone text not null default '',
  activity text not null, booking_date date not null, booking_time text not null,
  guests text not null default '1', notes text not null default '',
  status text not null default 'new' check (status in ('new','confirmed','declined')),
  created_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
drop policy if exists "admin manages bookings" on public.bookings;
create policy "admin manages bookings" on public.bookings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Newsletter ----------
create table if not exists public.subscribers (
  email text primary key, created_at timestamptz not null default now()
);
alter table public.subscribers enable row level security;
drop policy if exists "admin manages subscribers" on public.subscribers;
create policy "admin manages subscribers" on public.subscribers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- Public actions (the website calls these; they validate everything and
-- work out prices on the server so nobody can change a price in the browser)
-- =====================================================================
create or replace function public.create_order(
  p_name text, p_email text, p_phone text, p_pickup text, p_notes text, p_items jsonb, p_pay_method text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_info public.site_info%rowtype; it jsonb; v_item public.menu_items%rowtype;
  v_size public.addons%rowtype; v_top public.addons%rowtype; v_topname text;
  v_unit numeric; v_qty int; v_total numeric := 0; v_lines jsonb := '[]'::jsonb;
  v_tops jsonb; v_sizename text; v_sweet text; v_order public.orders%rowtype;
begin
  select * into v_info from public.site_info where id = 1;
  if not v_info.ordering_enabled then raise exception 'Online ordering is paused right now. Please order at the counter.'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Please enter your name.'; end if;
  if coalesce(p_email,'') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(p_email) > 120 then raise exception 'Please enter a valid email address.'; end if;
  if p_pay_method not in ('card','counter') then raise exception 'Unknown payment option.'; end if;
  if p_pay_method = 'card' and v_info.payments_mode = 'in_store' then raise exception 'Online payment is not available. Please pay at the counter.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Your order is empty.'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_item from public.menu_items where id = (it->>'item_id')::uuid and is_active and is_available;
    if not found then raise exception 'Sorry, an item in your order is no longer available.'; end if;
    v_qty := coalesce((it->>'qty')::int, 1);
    if v_qty not between 1 and 20 then raise exception 'Please choose between 1 and 20 of each drink.'; end if;
    v_unit := v_item.price;
    v_sizename := coalesce(nullif(it->>'size',''), 'Regular');
    if v_sizename <> 'Regular' then
      select * into v_size from public.addons where kind = 'size' and name = v_sizename and is_active;
      if not found then raise exception 'That size is not available.'; end if;
      v_unit := v_unit + v_size.price;
    end if;
    v_tops := '[]'::jsonb;
    if jsonb_array_length(coalesce(it->'toppings','[]'::jsonb)) > 5 then raise exception 'Too many toppings on one drink.'; end if;
    for v_topname in select jsonb_array_elements_text(coalesce(it->'toppings','[]'::jsonb)) loop
      select * into v_top from public.addons where kind = 'topping' and name = v_topname and is_active;
      if not found then raise exception 'A topping in your order is no longer available.'; end if;
      v_unit := v_unit + v_top.price; v_tops := v_tops || to_jsonb(v_topname);
    end loop;
    v_sweet := case when it->>'sweet' in ('100%','70%','50%','30%') then it->>'sweet' else '100%' end;
    v_total := v_total + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object('item_id', v_item.id, 'name', v_item.name, 'size', v_sizename,
      'sweet', v_sweet, 'toppings', v_tops, 'qty', v_qty, 'unit_price', v_unit);
  end loop;

  insert into public.orders (customer_name, customer_email, customer_phone, pickup_time, notes, items, total, payment_method)
  values (trim(p_name), trim(p_email), left(coalesce(p_phone,''), 30), left(coalesce(nullif(p_pickup,''),'As soon as possible'), 40),
          left(coalesce(p_notes,''), 300), v_lines, v_total, p_pay_method)
  returning * into v_order;

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total,
                            'payment_method', v_order.payment_method, 'payment_status', v_order.payment_status);
end $$;

-- TEST-MODE payment. Only works while Site info > payments mode is "mock".
-- When real Stripe goes live this function is switched off automatically
-- (mode changes to "stripe") and the stripe-webhook function marks orders paid instead.
create or replace function public.mock_pay_order(p_order_id uuid, p_card_last4 text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mode text; v_order public.orders%rowtype;
begin
  select payments_mode into v_mode from public.site_info where id = 1;
  if v_mode <> 'mock' then raise exception 'Test payments are switched off.'; end if;
  update public.orders
     set payment_status = 'paid', payment_method = 'card', payment_provider = 'mock',
         payment_ref = 'mock_pi_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
         card_last4 = left(regexp_replace(coalesce(p_card_last4,''), '\D', '', 'g'), 4)
   where id = p_order_id and payment_status in ('unpaid','failed')
   returning * into v_order;
  if not found then raise exception 'This order can''t be paid.'; end if;
  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'payment_status', v_order.payment_status, 'payment_ref', v_order.payment_ref);
end $$;

create or replace function public.get_order(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('order_number', order_number, 'status', status, 'payment_status', payment_status,
                            'total', total, 'pickup_time', pickup_time)
  from public.orders where id = p_id
$$;

create or replace function public.create_booking(
  p_name text, p_email text, p_phone text, p_activity text, p_date date, p_time text, p_guests text, p_notes text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if length(trim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Please enter your name.'; end if;
  if coalesce(p_email,'') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Please enter a valid email address.'; end if;
  if p_date is null or p_date < (now() at time zone 'Pacific/Auckland')::date then raise exception 'Please choose today or a later date.'; end if;
  if length(coalesce(p_activity,'')) not between 1 and 80 or length(coalesce(p_time,'')) not between 1 and 20 then raise exception 'Please choose an activity and time.'; end if;
  insert into public.bookings (name, email, phone, activity, booking_date, booking_time, guests, notes)
  values (trim(p_name), trim(p_email), left(coalesce(p_phone,''),30), p_activity, p_date, p_time, left(coalesce(p_guests,'1'),6), left(coalesce(p_notes,''),500))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.subscribe(p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_email,'') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(p_email) > 120 then raise exception 'Please enter a valid email address.'; end if;
  insert into public.subscribers (email) values (lower(trim(p_email))) on conflict do nothing;
  return true;
end $$;

-- Table privileges (row level security still decides who sees which rows)
revoke all on all tables in schema public from anon, authenticated;
grant select on public.site_info, public.menu_items, public.addons to anon;
grant select, update on public.site_info to authenticated;
grant select, insert, update, delete on public.menu_items, public.addons, public.bookings, public.subscribers to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.admins to authenticated;

revoke execute on function public.create_order(text,text,text,text,text,jsonb,text), public.mock_pay_order(uuid,text), public.get_order(uuid),
  public.create_booking(text,text,text,text,date,text,text,text), public.subscribe(text) from public;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.create_order(text,text,text,text,text,jsonb,text) to anon, authenticated;
grant execute on function public.mock_pay_order(uuid,text) to anon, authenticated;
grant execute on function public.get_order(uuid) to anon, authenticated;
grant execute on function public.create_booking(text,text,text,text,date,text,text,text) to anon, authenticated;
grant execute on function public.subscribe(text) to anon, authenticated;

-- ---------- Photo storage for menu images ----------
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true) on conflict (id) do nothing;
-- (the bucket is public, so photos load without a read policy; visitors cannot list the bucket)
drop policy if exists "admin uploads menu images" on storage.objects;
create policy "admin uploads menu images" on storage.objects for insert to authenticated with check (bucket_id = 'menu-images' and public.is_admin());
drop policy if exists "admin updates menu images" on storage.objects;
create policy "admin updates menu images" on storage.objects for update to authenticated using (bucket_id = 'menu-images' and public.is_admin());
drop policy if exists "admin deletes menu images" on storage.objects;
create policy "admin deletes menu images" on storage.objects for delete to authenticated using (bucket_id = 'menu-images' and public.is_admin());

-- ---------- Starting menu (matches the current website) ----------
insert into public.menu_items (name, description, category, price, image_url, badge, sort_order)
select * from (values
  ('Caramel Cookie Cloud','Brown sugar milk tea, salted caramel and cookie crumble.','milk',8.50,'assets/caramel.webp','Cloud series',10),
  ('Popcorn Matcha Cloud','Chilled matcha, cream and a crown of caramel popcorn.','matcha',8.90,'assets/popcorn.webp','Cloud series',20),
  ('Berry Cloud Milk Tea','Strawberry milk tea with berry compote and red velvet crumb.','fruit',8.50,'assets/berry.webp','Cloud series',30),
  ('Double Choc Cloud','Dark chocolate milk tea, cocoa crumb and a chocolate bar.','dessert',8.90,'assets/choco.webp','Cloud series',40),
  ('Taro Milk Tea','Sweet, dreamy and softly floral with a creamy finish.','milk',7.50,'','',50),
  ('Matcha Latte','Earthy Japanese matcha meets silky, chilled milk.','matcha',7.50,'','',60),
  ('Mango Fruit Tea','Tropical mango, bright tea and a splash of sunshine.','fruit',7.00,'','',70),
  ('Tea Craft Special','Our little secret blend. Ask us what''s brewing today.','milk',8.00,'','',80)
) as v(name, description, category, price, image_url, badge, sort_order)
where not exists (select 1 from public.menu_items);

insert into public.addons (kind, name, price, sort_order) values
  ('size','Large',1.00,10), ('topping','Boba pearls',0.80,10), ('topping','Cheese foam',1.20,20), ('topping','Popcorn',1.00,30)
on conflict (kind, name) do nothing;
