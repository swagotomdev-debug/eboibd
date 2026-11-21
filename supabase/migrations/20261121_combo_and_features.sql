-- ============================================================================
-- Migration: 20261121_combo_and_features.sql
-- Adds:
-- 1. Combo bundle row & bundle_items table
-- 2. Real sales counts including bundle sales: book_sales_counts()
-- 3. Manual offline orders support in orders table (source = 'manual')
-- 4. Admin reviews management with proof upload and custom sources
-- 5. Offer countdown & dynamic settings table
-- ============================================================================

-- 1. Alter Books Table for Bundles & Sales
alter table public.books add column if not exists is_bundle boolean not null default false;
alter table public.books add column if not exists sale_price_bdt numeric(10, 2);
alter table public.books add column if not exists sale_ends_at timestamptz;

-- Set correct regular prices for the 4 core books
update public.books set price_bdt = 299.00 where slug = 'ai-income';
update public.books set price_bdt = 249.00 where slug = 'freelancer-payment';
update public.books set price_bdt = 349.00 where slug = 'facebook-business';
update public.books set price_bdt = 299.00 where slug = 'ai-video-editing';

-- Insert or Update Combo Bundle
insert into public.books (slug, title, short_description, description, page_count, price_bdt, cover_url, file_path, is_active, is_bundle)
values (
  'combo-all-4',
  '৪টা বইয়ের মেগা কম্বো',
  '৪টি সম্পূর্ণ ইবুক একসাথে: AI ইনকাম, ফ্রিল্যান্সার পেমেন্ট, ফেসবুক বিজনেস এবং AI ভিডিও এডিটিং।',
  'সবগুলো ক্যারিয়ার ও ইনকাম হ্যান্ডবুক একসাথে মেগা অফারে। সর্বমোট ১১৪ পৃষ্ঠা ও চারটি সম্পূর্ণ প্র্যাকটিক্যাল গাইড।',
  114,
  149.00,
  '/assets/images/bundle-hero.webp',
  'ebooks/combo-all-4.pdf',
  true,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  price_bdt = 149.00,
  is_bundle = true,
  is_active = true;

-- 2. Bundle Items Mapping Table
create table if not exists public.bundle_items (
  bundle_id uuid not null references public.books(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bundle_id, book_id)
);

alter table public.bundle_items enable row level security;
drop policy if exists "Public view bundle items" on public.bundle_items;
create policy "Public view bundle items" on public.bundle_items for select using (true);

-- Link the 4 books to combo-all-4
insert into public.bundle_items (bundle_id, book_id)
select 
  (select id from public.books where slug = 'combo-all-4'),
  b.id
from public.books b
where b.slug in ('ai-income', 'freelancer-payment', 'facebook-business', 'ai-video-editing')
on conflict do nothing;

-- 3. Orders Table: Add source for manual offline orders
alter table public.orders add column if not exists source text not null default 'online';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_source_check') then
    alter table public.orders add constraint orders_source_check check (source in ('online', 'manual'));
  end if;
end $$;

-- 4. Reviews Table: Allow admin manual reviews & proof uploads
alter table public.reviews alter column order_id drop not null;
alter table public.reviews add column if not exists source text not null default 'buyer';
alter table public.reviews add column if not exists proof_path text;
alter table public.reviews add column if not exists review_date date not null default current_date;

create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.admins
    where email = auth.jwt() ->> 'email'
  );
$$;

drop policy if exists "Public can view approved reviews" on public.reviews;
create policy "Public can view approved reviews"
  on public.reviews for select
  using (approved = true);

drop policy if exists "Admins full access to reviews" on public.reviews;
create policy "Admins full access to reviews"
  on public.reviews for all
  using (public.is_admin());

-- 5. Settings Table: Handles and replaces any legacy conflicting table automatically
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'settings'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'settings' and column_name = 'key'
  ) then
    drop table public.settings cascade;
  end if;
end $$;

create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;
drop policy if exists "Public can view settings" on public.settings;
create policy "Public can view settings" on public.settings for select using (true);

drop policy if exists "Admins can manage settings" on public.settings;
create policy "Admins can manage settings" on public.settings for all using (public.is_admin());

insert into public.settings (key, value)
values 
  ('combo_active', 'true'),
  ('banner_text', '৪টা বই একসাথে মেগা কম্বো মাত্র ৳১৪৯! সীমিত সময়ের বিশেষ অফার'),
  ('offer_ends_at', '')
on conflict (key) do update set
  value = excluded.value;

-- Also create site_settings for redundant compatibility
create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
drop policy if exists "Public can view site settings" on public.site_settings;
create policy "Public can view site settings" on public.site_settings for select using (true);

drop policy if exists "Admins can manage site settings" on public.site_settings;
create policy "Admins can manage site settings" on public.site_settings for all using (public.is_admin());

insert into public.site_settings (key, value)
values 
  ('combo_active', 'true'),
  ('banner_text', '৪টা বই একসাথে মেগা কম্বো মাত্র ৳১৪৯! সীমিত সময়ের বিশেষ অফার'),
  ('offer_ends_at', '')
on conflict (key) do update set
  value = excluded.value;

-- 6. Private Bucket for Review Proofs (Admin only)
insert into storage.buckets (id, name, public)
values ('review-proofs', 'review-proofs', false)
on conflict (id) do nothing;

drop policy if exists "Admins manage review proofs" on storage.objects;
create policy "Admins manage review proofs"
  on storage.objects for all
  using (bucket_id = 'review-proofs' and public.is_admin());

-- 7. Real Sold Count Security-Definer Function
create or replace function public.book_sales_counts()
returns table (slug text, sold bigint)
language sql security definer set search_path = public as $$
  with combo_orders as (
    select count(o.id) as combo_count
    from public.orders o
    join public.books b on b.id = o.book_id
    where b.slug = 'combo-all-4' and o.status = 'paid'
  ),
  book_direct_orders as (
    select b.slug, count(o.id) as direct_count
    from public.books b
    left join public.orders o on o.book_id = b.id and o.status = 'paid'
    where b.is_bundle = false
    group by b.slug
  )
  select 
    bdo.slug,
    (bdo.direct_count + (select combo_count from combo_orders)) as sold
  from book_direct_orders bdo
  union all
  select 
    'combo-all-4' as slug,
    (select combo_count from combo_orders) as sold;
$$;

grant execute on function public.book_sales_counts() to anon, authenticated;
