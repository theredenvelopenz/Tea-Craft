-- Changes applied to the live "Tea Craft" Supabase project AFTER schema.sql, in order.
-- schema.sql alone does not rebuild the current database; run schema.sql and then this file if you ever start a new project.

-- 1. security_hardening_validation_and_rate_limits
alter table public.menu_items add constraint menu_image_url_safe check (image_url = '' or image_url ~ '^(https://|assets/)');
alter table public.site_info
  add constraint site_text_lengths check (length(business_name) <= 80 and length(tagline) <= 120 and length(email) <= 120 and length(phone) <= 30
    and length(address) <= 300 and length(hours_text) <= 300 and length(announcement_text) <= 200),
  add constraint site_social_https check ((instagram_url = '' or instagram_url ~ '^https://') and (tiktok_url = '' or tiktok_url ~ '^https://')
    and (facebook_url = '' or facebook_url ~ '^https://') and length(instagram_url) <= 200 and length(tiktok_url) <= 200 and length(facebook_url) <= 200),
  add constraint site_hours_order check (close_hour > open_hour);

create table if not exists public.rate_limits (ip text not null, action text not null, window_start timestamptz not null, hits int not null default 1, primary key (ip, action, window_start));
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.client_ip() returns text language sql stable set search_path = public as $$
  select coalesce(nullif(nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip', ''),
                  nullif(trim(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1)), ''))
$$;
create or replace function public.enforce_rate_limit(p_action text, p_max int, p_window_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare v_ip text := public.client_ip(); v_start timestamptz; v_hits int;
begin
  if v_ip is null then return; end if;
  v_start := date_bin((p_window_minutes || ' minutes')::interval, now(), timestamptz 'epoch');
  insert into public.rate_limits (ip, action, window_start) values (v_ip, p_action, v_start)
  on conflict (ip, action, window_start) do update set hits = public.rate_limits.hits + 1 returning hits into v_hits;
  if v_hits > p_max then raise exception 'Too many requests. Please wait a few minutes and try again.'; end if;
  if random() < 0.02 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
end $$;
create or replace function public.trg_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit(tg_argv[0], tg_argv[1]::int, tg_argv[2]::int); return new; end $$;
revoke execute on function public.client_ip(), public.enforce_rate_limit(text,int,int), public.trg_rate_limit() from public, anon, authenticated;
create trigger orders_rate before insert on public.orders for each row execute function public.trg_rate_limit('order', '8', '10');
create trigger bookings_rate before insert on public.bookings for each row execute function public.trg_rate_limit('booking', '5', '60');
create trigger subscribers_rate before insert on public.subscribers for each row execute function public.trg_rate_limit('subscribe', '5', '60');
create trigger orders_pay_rate before update on public.orders for each row
  when (new.payment_provider = 'mock' and old.payment_status is distinct from 'paid' and new.payment_status = 'paid') execute function public.trg_rate_limit('pay', '12', '10');

-- 2. newsletter_unsubscribe_function (final version)
create or replace function public.unsubscribe(p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(coalesce(p_email, '')));
begin
  perform public.enforce_rate_limit('unsubscribe', 10, 60);
  if v !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v) > 120 then raise exception 'Please enter a valid email address.'; end if;
  delete from public.subscribers where email = v;
  return true;
end $$;
revoke execute on function public.unsubscribe(text) from public;
grant execute on function public.unsubscribe(text) to anon, authenticated;

-- 3. admin login by username, two-step enforcement, informative-only mode
alter table public.admins add column if not exists username text;
update public.admins set username = 'admin' where username is null;
alter table public.admins add constraint admins_username_format check (username is null or username ~ '^[a-z0-9_.-]{3,32}$');
create unique index if not exists admins_username_key on public.admins (lower(username));

create or replace function public.admin_login_email(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  perform public.enforce_rate_limit('admin_login', 15, 10);
  select u.email into v_email from public.admins a join auth.users u on u.id = a.user_id where lower(a.username) = lower(trim(coalesce(p_username, '')));
  return coalesce(v_email, 'no-such-account@invalid.example');
end $$;
revoke execute on function public.admin_login_email(text) from public;
grant execute on function public.admin_login_email(text) to anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid() and not a.must_change_password
    and ((auth.jwt() ->> 'aal') = 'aal2' or not exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified')))
$$;

alter table public.site_info add column if not exists show_prices boolean not null default false;
update public.site_info set show_prices = false, ordering_enabled = false, payments_mode = 'in_store' where id = 1;
revoke execute on function public.create_order(text,text,text,text,text,jsonb,text) from anon, authenticated;
revoke execute on function public.mock_pay_order(uuid,text) from anon, authenticated;
revoke execute on function public.get_order(uuid) from anon, authenticated;
revoke execute on function public.create_booking(text,text,text,text,date,text,text,text) from anon, authenticated;
-- (earlier) the admin account's password is set directly in Supabase and is NOT stored in any file.
