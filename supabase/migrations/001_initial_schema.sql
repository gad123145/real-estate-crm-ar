-- Migration: Initial Schema for Real Estate CRM
-- Created: 2026-05-31

-- ============================================
-- 1. جدول الملاك والعقارات
-- ============================================
create table if not exists property_owners (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  property_code text,
  owner_name text not null,
  phone text not null,
  whatsapp text,
  property_type text not null default 'شقة',
  listing_intent text not null default 'بيع',
  building_name text,
  unit_number text,
  city text,
  district text,
  address text,
  price text,
  area text,
  bedrooms text,
  bathrooms text,
  reception_rooms text,
  floor text,
  finishing text,
  furnishing text,
  view_description text,
  license_status text,
  delivery_date text,
  payment_plan text,
  amenities text,
  map_url text,
  virtual_tour_url text,
  availability text,
  status text default 'جديد',
  source text,
  notes text
);

-- ============================================
-- 2. جدول العملاء الطالبين
-- ============================================
create table if not exists demand_clients (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  request_intent text not null default 'شراء',
  property_type text not null default 'شقة',
  city text,
  preferred_areas text,
  budget text,
  payment_method text,
  urgency text default 'عادي',
  status text default 'جديد',
  details text not null,
  notes text
);

-- ============================================
-- 3. جدول المواعيد والمعاينات
-- ============================================
create table if not exists appointments (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  appointment_type text not null default 'معاينة',
  client_kind text default 'general',
  linked_client_id uuid,
  client_name text not null,
  phone text not null,
  appointment_date date not null,
  appointment_time time not null,
  duration_minutes int default 60,
  location text,
  status text default 'مؤكد',
  notes text
);

-- ============================================
-- 4. جدول وسائط العقارات
-- ============================================
create table if not exists property_media (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  owner_id uuid references property_owners(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size int not null,
  media_kind text not null,
  storage_path text not null,
  public_url text not null
);

-- ============================================
-- 5. تفعيل Row Level Security (RLS)
-- ============================================
alter table property_owners enable row level security;
alter table demand_clients enable row level security;
alter table appointments enable row level security;
alter table property_media enable row level security;

-- ============================================
-- 6. سياسات RLS
-- ============================================

-- property_owners
create policy "Users can view their own owners"
  on property_owners for select using (auth.uid() = user_id);
create policy "Users can insert their own owners"
  on property_owners for insert with check (auth.uid() = user_id);
create policy "Users can update their own owners"
  on property_owners for update using (auth.uid() = user_id);
create policy "Users can delete their own owners"
  on property_owners for delete using (auth.uid() = user_id);

-- demand_clients
create policy "Users can view their own clients"
  on demand_clients for select using (auth.uid() = user_id);
create policy "Users can insert their own clients"
  on demand_clients for insert with check (auth.uid() = user_id);
create policy "Users can update their own clients"
  on demand_clients for update using (auth.uid() = user_id);
create policy "Users can delete their own clients"
  on demand_clients for delete using (auth.uid() = user_id);

-- appointments
create policy "Users can view their own appointments"
  on appointments for select using (auth.uid() = user_id);
create policy "Users can insert their own appointments"
  on appointments for insert with check (auth.uid() = user_id);
create policy "Users can update their own appointments"
  on appointments for update using (auth.uid() = user_id);
create policy "Users can delete their own appointments"
  on appointments for delete using (auth.uid() = user_id);

-- property_media
create policy "Users can view their own media"
  on property_media for select using (auth.uid() = user_id);
create policy "Users can insert their own media"
  on property_media for insert with check (auth.uid() = user_id);
create policy "Users can delete their own media"
  on property_media for delete using (auth.uid() = user_id);

-- ============================================
-- 7. Storage Bucket للوسائط
-- ============================================
-- قم بإنشاء Bucket يدوياً من لوحة التحكم باسم: property-media
-- واجعله public

-- ============================================
-- 8. Functions & Triggers
-- ============================================

-- Function: auto-set user_id on insert
create or replace function public.set_user_id()
returns trigger as $$
begin
  new.user_id = auth.uid();
  return new;
end;
$$ language plpgsql security definer;

-- Triggers for auto-setting user_id
create trigger set_user_id_property_owners
  before insert on property_owners
  for each row execute function public.set_user_id();

create trigger set_user_id_demand_clients
  before insert on demand_clients
  for each row execute function public.set_user_id();

create trigger set_user_id_appointments
  before insert on appointments
  for each row execute function public.set_user_id();

create trigger set_user_id_property_media
  before insert on property_media
  for each row execute function public.set_user_id();

-- ============================================
-- 9. Indexes for performance
-- ============================================
create index if not exists idx_property_owners_user_id on property_owners(user_id);
create index if not exists idx_property_owners_status on property_owners(status);
create index if not exists idx_demand_clients_user_id on demand_clients(user_id);
create index if not exists idx_demand_clients_status on demand_clients(status);
create index if not exists idx_appointments_user_id on appointments(user_id);
create index if not exists idx_appointments_date on appointments(appointment_date);
create index if not exists idx_property_media_owner_id on property_media(owner_id);
