-- ============================================================================
-- eboibd.site - Supabase Schema, RLS, Storage, Functions, and Seed Data
-- ============================================================================

-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- 1. TABLES
-- ----------------------------------------------------------------------------

-- Table: books
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  short_description text,
  description text,
  highlights text[] default '{}',
  page_count integer not null default 0,
  price_bdt numeric(10, 2) not null check (price_bdt >= 0),
  cover_url text,
  file_path text, -- Private storage path inside 'ebooks' bucket
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Table: orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete restrict,
  customer_name text not null,
  email text not null,
  phone text not null,
  amount_bdt numeric(10, 2) not null check (amount_bdt >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  gateway_ref text, -- ZiniPay invoice_id / reference
  transaction_id text, -- Gateway confirmed TrxID
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Ensure all columns exist even if public.orders was created previously
alter table public.orders add column if not exists book_id uuid references public.books(id) on delete restrict;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists email text;
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists amount_bdt numeric(10, 2);
alter table public.orders add column if not exists status text default 'pending';
alter table public.orders add column if not exists gateway_ref text;
alter table public.orders add column if not exists transaction_id text;
alter table public.orders add column if not exists download_count integer not null default 0;
alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.orders add column if not exists paid_at timestamptz;

-- Unique index on orders.gateway_ref so one invoice can pay for only one order
create unique index if not exists orders_gateway_ref_unique_idx on public.orders (gateway_ref) where gateway_ref is not null;

-- Table: reviews
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Table: admins
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- 2. HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

-- Check if current authenticated user is an authorized admin
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.admins 
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Public RPC: Get real paid order counts per book slug (Real count, zero fake numbers)
create or replace function public.get_book_sales_counts()
returns table (slug text, paid_count bigint)
language sql security definer set search_path = public as $$
  select b.slug, count(o.id) as paid_count
  from public.books b
  left join public.orders o on o.book_id = b.id and o.status = 'paid'
  where b.is_active = true
  group by b.slug;
$$;

grant execute on function public.get_book_sales_counts() to anon, authenticated;

-- 3. VIEWS
-- ----------------------------------------------------------------------------

-- Public View: Approved reviews only (hides order details and unapproved reviews)
create or replace view public.approved_reviews as
select 
  r.id,
  r.name,
  r.rating,
  r.comment,
  r.created_at,
  b.slug as book_slug,
  b.title as book_title
from public.reviews r
join public.books b on b.id = r.book_id
where r.approved = true;

grant select on public.approved_reviews to anon, authenticated;

-- 4. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

alter table public.books enable row level security;
alter table public.orders enable row level security;
alter table public.reviews enable row level security;
alter table public.admins enable row level security;

-- Policies for `books`
drop policy if exists "Public can view active books" on public.books;
create policy "Public can view active books"
  on public.books for select
  using (is_active = true);

drop policy if exists "Admins full access to books" on public.books;
create policy "Admins full access to books"
  on public.books for all
  using (public.is_admin());

-- Policies for `orders`
drop policy if exists "Admins full access to orders" on public.orders;
create policy "Admins full access to orders"
  on public.orders for all
  using (public.is_admin());

drop policy if exists "Customers can view their order by id" on public.orders;
create policy "Customers can view their order by id"
  on public.orders for select
  using (true);

drop policy if exists "Anyone can create pending orders" on public.orders;
create policy "Anyone can create pending orders"
  on public.orders for insert
  with check (status = 'pending');

-- Policies for `reviews`
drop policy if exists "Public can view approved reviews" on public.reviews;
create policy "Public can view approved reviews"
  on public.reviews for select
  using (approved = true);

drop policy if exists "Admins full access to reviews" on public.reviews;
create policy "Admins full access to reviews"
  on public.reviews for all
  using (public.is_admin());

-- Policies for `admins`
drop policy if exists "Admins can view admins" on public.admins;
create policy "Admins can view admins"
  on public.admins for select
  using (public.is_admin());

-- 5. STORAGE BUCKETS SETUP
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values 
  ('covers', 'covers', true),
  ('ebooks', 'ebooks', false)
on conflict (id) do update set public = excluded.public;

-- Storage Policies:
drop policy if exists "Public view covers" on storage.objects;
create policy "Public view covers"
  on storage.objects for select
  using (bucket_id = 'covers');

drop policy if exists "Admins upload covers" on storage.objects;
create policy "Admins upload covers"
  on storage.objects for insert
  with check (bucket_id = 'covers' and public.is_admin());

drop policy if exists "Admins manage ebooks" on storage.objects;
create policy "Admins manage ebooks"
  on storage.objects for all
  using (bucket_id = 'ebooks' and public.is_admin());

-- 6. SEED DATA
-- ----------------------------------------------------------------------------

-- Seed Admin Email
insert into public.admins (email)
values ('team@eboibd.site')
on conflict (email) do nothing;

-- Seed the 4 Core Books
insert into public.books (slug, title, short_description, description, highlights, page_count, price_bdt, cover_url, file_path, is_active)
values
(
  'ai-income',
  'AI দিয়ে ঘরে বসে আয়: ৩০ দিনে প্রথম ইনকাম',
  'ChatGPT, Midjourney ও আধুনিক AI টুল ব্যবহার করে ফ্রিল্যান্সিং ও অনলাইন ইনকামের বাস্তবসম্মত অ্যাকশন প্ল্যান।',
  'কোনো অবাস্তব স্বপ্ন বা মিথ্যা আশ্বাস নয়। এই বইটিতে রয়েছে প্রতিদিনের সুনির্দিষ্ট অ্যাকশন প্ল্যান, টেস্টেড প্রম্পট এবং ফ্রিল্যান্সিং সার্ভিস বিক্রির দেশীয় ও আন্তর্জাতিক গাইডলাইন।',
  array['৩০ দিনের অ্যাকশন প্ল্যান', '২০+ টেস্টেড প্রম্পট', '৫টি মনেটাইজেবল AI সার্ভিস', 'পোর্টফোলিও টেমপ্লেট'],
  29,
  299.00,
  '/assets/images/ai-income-cover.webp',
  'ebooks/ai-income.pdf',
  true
),
(
  'freelancer-payment',
  'ফ্রিল্যান্সারের টাকা দেশে আনার পুরো গাইড ২০২৬',
  'Payoneer, Wise, Bank Transfer ও লোকাল গেটওয়ের মাধ্যমে কম ফি ও সর্বোচ্চ রেটে ডলার বৈধভাবে দেশে আনার ধাপে ধাপে গাইডলাইন।',
  'কষ্টের উপার্জিত ডলার যাতে অতিরিক্ত হিডেন চার্জ বা খারাপ এক্সচেঞ্জ রেটে নষ্ট না হয়, তার নিখুঁত ব্যাংকিং গাইড। সরকারি ২.৫% প্রণোদনা ও ট্যাক্স নিয়মাবলীর পূর্ণ বিবরণ।',
  array['সর্বনিম্ন ফি মেথড', 'Wise ও Payoneer গাইড', 'সরকারি ২.৫% প্রণোদনা', 'ট্যাক্স এক্সাম্পশন ক্লিয়ারেন্স'],
  24,
  249.00,
  '/assets/images/freelancer-payment-cover.webp',
  'ebooks/freelancer-payment.pdf',
  true
),
(
  'facebook-business',
  'ফেসবুক পেজ থেকে ব্যবসা: শূন্য থেকে প্রথম ১০০ অর্ডার',
  'বিনা খরচে অর্গানিক রিচ, কনটেন্ট প্ল্যান, সঠিক অডিয়েন্স টার্গেটিং ও কাস্টমার কনভার্সন বৃদ্ধির প্রমাণিত দেশীয় রোডম্যাপ।',
  'বুস্টিংয়ে টাকা না ঢেলে অর্গানিক রিলস, সঠিক কন্টেন্ট ক্যালেন্ডার এবং ইনবক্সে কাস্টমার কনভার্সন স্ক্রিপ্ট দিয়ে প্রথম ১০০টি সফল অর্ডার সম্পন্ন করার কার্যকর দেশীয় ফর্মুলা।',
  array['অর্গানিক ভাইরাল রিলস', 'ইনবক্স সেলস ক্লোজিং স্ক্রিপ্ট', 'কুরিয়ার রিটার্ন কমানোর টেকনিক', '১০০ কাস্টমার চেকলিস্ট'],
  23,
  349.00,
  '/assets/images/facebook-business-cover.webp',
  'ebooks/facebook-business.pdf',
  true
),
(
  'ai-video-editing',
  'AI দিয়ে ভিডিও এডিটিং: প্রম্পট ও স্কিল',
  'CapCut, Runway, ElevenLabs ও আধুনিক AI টুল দিয়ে ভাইরাল শর্টস ও প্রফেশনাল ভিডিও তৈরির কমপ্লিট হ্যান্ডবুক।',
  'ভারী পিসির ঝামেলা ছাড়া মোবাইল ও ল্যাপটপে AI ভয়েস, সিনেমাটিক ক্লিপ ও আকর্ষণীয় সাবটাইটেল দিয়ে ফেসলেস চ্যানেল ও সোশ্যাল মিডিয়ার জন্য ভিডিও বানানোর মাস্টারক্লাস।',
  array['CapCut সিক্রেট ফিচার', 'ElevenLabs ভয়েস ক্লোনিং', 'Runway সিনেমাটিক ক্লিপ', 'ইউটিউব মনেটাইজেশন ফ্রেমওয়ার্ক'],
  28,
  299.00,
  '/assets/images/ai-video-editing-cover.webp',
  'ebooks/ai-video-editing.pdf',
  true
),
(
  'combo-all-4',
  '৪টা বইয়ের মেগা কম্বো',
  '৪টি সম্পূর্ণ ইবুক একসাথে: AI ইনকাম, ফ্রিল্যান্সার পেমেন্ট, ফেসবুক বিজনেস এবং AI ভিডিও এডিটিং।',
  'সবগুলো ক্যারিয়ার ও ইনকাম হ্যান্ডবুক একসাথে মেগা অফারে। সর্বমোট ১১৪ পৃষ্ঠা ও চারটি সম্পূর্ণ প্র্যাকটিক্যাল গাইড।',
  array['৪টি সম্পূর্ণ ইবুক', '৮৮% স্পেশাল সাশ্রয়', 'সব রিসোর্স ও টেমপ্লেট', 'লাইফটাইম আপডেট'],
  104,
  149.00,
  '/assets/images/bundle-hero.webp',
  'ebooks/combo-all-4.pdf',
  true
)
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  description = excluded.description,
  page_count = excluded.page_count,
  price_bdt = excluded.price_bdt,
  cover_url = excluded.cover_url,
  file_path = excluded.file_path,
  is_active = excluded.is_active;

-- Books Table: Bundle & Sale Columns
alter table public.books add column if not exists is_bundle boolean not null default false;
alter table public.books add column if not exists sale_price_bdt numeric(10, 2);
alter table public.books add column if not exists sale_ends_at timestamptz;
update public.books set is_bundle = true where slug = 'combo-all-4';

-- Bundle Items Table
create table if not exists public.bundle_items (
  bundle_id uuid not null references public.books(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bundle_id, book_id)
);
alter table public.bundle_items enable row level security;
drop policy if exists "Public view bundle items" on public.bundle_items;
create policy "Public view bundle items" on public.bundle_items for select using (true);

insert into public.bundle_items (bundle_id, book_id)
select 
  (select id from public.books where slug = 'combo-all-4'),
  b.id
from public.books b
where b.slug in ('ai-income', 'freelancer-payment', 'facebook-business', 'ai-video-editing')
on conflict do nothing;

-- Orders Table: source column (online / manual)
alter table public.orders add column if not exists source text not null default 'online';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_source_check') then
    alter table public.orders add constraint orders_source_check check (source in ('online', 'manual'));
  end if;
end $$;

-- Reviews Table: support admin manual additions & proof uploads
alter table public.reviews alter column order_id drop not null;
alter table public.reviews add column if not exists source text not null default 'buyer';
alter table public.reviews add column if not exists proof_path text;
alter table public.reviews add column if not exists review_date date not null default current_date;

drop policy if exists "Public can view approved reviews" on public.reviews;
create policy "Public can view approved reviews" on public.reviews for select using (approved = true);
drop policy if exists "Admins full access to reviews" on public.reviews;
create policy "Admins full access to reviews" on public.reviews for all using (public.is_admin());

-- Settings Table (Handles and replaces any legacy conflicting table automatically)
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

-- Site Settings Table (Offer countdown & banner text)
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

-- Private Storage Bucket for Review Proofs
insert into storage.buckets (id, name, public)
values ('review-proofs', 'review-proofs', false)
on conflict (id) do nothing;

drop policy if exists "Admins manage review proofs" on storage.objects;
create policy "Admins manage review proofs"
  on storage.objects for all
  using (bucket_id = 'review-proofs' and public.is_admin());

-- Real Book Sales Count Security-Definer Function
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
