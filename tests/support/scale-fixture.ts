// The scale of NFR-SCALE-01 for the index benchmark (T-16), as SQL statements for a throwaway
// database, each with the dealer's id as its one parameter where it names one. One dealer has 1,000
// public cars: 900 published, 50 reserved and 50 sold inside its 14-day window. Beside them are the
// rows a public read must skip: 100 sales inside the SQL's 60-day bound but past the window, 1,500
// older sales, 300 archived cars, 100 drafts and 200 cars in 10 demo sessions, half of them copies
// of live cars (BR-31). Media stay under 50,000 rows: 30 photos per public car with an og image, a
// report, most with a clip, 250 spins of 36 frames, 4 photos per older sale, and deleted, pending
// and sandbox photos. Ids derive from md5, so a statement can name another's rows. Every date is
// set from the clock the caller passes, the test's own (SRS §16.1), never the database's.

import { createHash } from "node:crypto";

export type FixtureStatement = { readonly text: string; readonly params: readonly string[] };

const PUBLIC_CARS = 1000;

const BLOB = "https://abcdefghijklmnop.public.blob.vercel-storage.com";
const id = (prefix: string, expr: string) => `md5('${prefix}' || (${expr})::text)::uuid`;
const session = (expr: string) => `'demo' || lpad((${expr})::text, 18, '0')`;

// The caller's clock, kept as a setting of the session, which the statements read in place of now()
const CLOCK = `create function pg_temp.fixture_now() returns timestamptz language sql stable as $$
  select current_setting('fixture.now')::timestamptz $$`;
const NOW = "pg_temp.fixture_now()";

// The reference code alphabet of BR-15, for codes made from a row's number
const CODE4 = `create function pg_temp.code4(i int) returns text language sql immutable as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', ((i / (31 ^ k)::int) % 31) + 1, 1), '' order by k desc)
  from generate_series(0, 3) k $$`;

const CATALOG = [
  `insert into make (key, name_en, name_ar)
   select 'make' || m, 'Make ' || m, 'صانع ' || m from generate_series(1, 25) m`,
  `insert into model (key, make_key, name_en, name_ar)
   select 'make' || m || '-model' || n, 'make' || m, 'Model ' || n, 'طراز ' || n
   from generate_series(1, 25) m, generate_series(1, 6) n`,
  `insert into demo_session (id, token_hash)
   select ${session("s")}, md5('a' || s) || md5('b' || s) from generate_series(1, 10) s`,
];

const DEALER = [
  `insert into dealer (id, slug) values ($1, 'scale')`,
  `insert into dealer_settings (id, dealer_id, brand_name_ar, brand_name_en, sold_visible_days)
   values (gen_random_uuid(), $1, 'مفتاح', 'Muftah', 14)`,
  `insert into dealer_settings (id, dealer_id, demo_session_id, brand_name_ar, brand_name_en, sold_visible_days)
   select gen_random_uuid(), $1, ${session("s")}, 'مفتاح', 'Sandbox', 60 from generate_series(1, 10) s`,
  // Live cars 1 to 3,000: the public 1,000 first, then the rows the reads skip
  `insert into car (id, dealer_id, ref_code, slug, status, make_key, model_key, trim, model_year, price_jod,
     mileage_km, fuel_type, transmission, body_type, regional_specs, customs_status, license_status,
     insurance_type, payment_methods, seats, color_family, owners_count, features, battery_soh_pct,
     battery_soh_source, published_at, sold_at, archived_at, updated_at)
   select ${id("car", "i")}, $1, 'MU-' || pg_temp.code4(i),
     'make' || (1 + i % 25) || '-model' || (1 + i % 6) || '-' || (2005 + i % 20) || '-mu-' || lower(pg_temp.code4(i)),
     (case when i <= 900 then 'published' when i <= 950 then 'reserved' when i <= 2600 then 'sold'
           when i <= 2900 then 'archived' else 'draft' end)::car_status,
     case when i <= 2900 then 'make' || (1 + i % 25) end,
     case when i <= 2900 then 'make' || (1 + i % 25) || '-model' || (1 + i % 6) end,
     case when i % 3 = 0 then 'Limited Edition ' || (i % 7) when i % 3 = 1 then 'فل كامل' end,
     case when i <= 2900 then 2005 + i % 20 end,
     case when i <= 2900 then 5000 + (i * 37) % 60000 end,
     case when i <= 2900 then (i * 1234) % 300000 end,
     case when i <= 2900 then (array['gasoline','diesel','electric','hybrid','mild_hybrid','plugin_hybrid'])[1 + i % 6]::fuel_type end,
     case when i <= 2900 then (case when i % 5 = 0 then 'manual' else 'automatic' end)::transmission end,
     case when i <= 2900 then (array['suv','sedan','hatchback','pickup','coupe','convertible','van','truck'])[1 + i % 8]::body_type end,
     case when i <= 2900 then (array['american','european','gcc','chinese','korean','japanese','agency','other'])[1 + i % 8]::regional_specs end,
     case when i <= 2900 then 'cleared'::customs_status end,
     case when i <= 2900 then 'licensed'::license_status end,
     case when i <= 2900 then 'comprehensive'::insurance_type end,
     case when i % 2 = 0 then '{cash,instalments}'::payment_method[] else '{cash}'::payment_method[] end,
     case when i <= 2900 then 5 end,
     (array['white','black','silver','gray','blue','red','green'])[1 + i % 7]::color_family,
     case when i <= 2900 then 1 + i % 3 end,
     (array['airbags','abs','carplay','android_auto','rear_camera','cruise_control','bluetooth','sunroof',
            'leather_seats','navigation','keyless_entry','led_lights'])[1:(4 + i % 9)]::varchar(40)[],
     case when i <= 2900 and i % 6 = 2 then 80 + i % 20 end,
     case when i <= 2900 and i % 6 = 2 then 'diagnostic_scan'::soh_source end,
     case when i <= 2900 then ${NOW} - make_interval(days => case when i <= 950 then i % 120 else 70 + i % 700 end, mins => i) end,
     case when i between 951 and 1000 then ${NOW} - make_interval(days => 1 + i % 13, mins => i)
          when i between 1001 and 1100 then ${NOW} - make_interval(days => 15 + i % 45, mins => i)
          when i between 1101 and 2600 then ${NOW} - make_interval(days => 61 + i % 700, mins => i) end,
     case when i between 2601 and 2900 then ${NOW} - make_interval(days => 1 + i % 300) end,
     ${NOW} - make_interval(mins => i)
   from generate_series(1, 3000) i`,
  // Demo cars 3,001 to 3,200: odd ones copy live car i - 3,000 with its code and slug, even ones are new
  `insert into car (id, dealer_id, demo_session_id, copied_from_car_id, ref_code, slug, status, make_key, model_key,
     model_year, price_jod, mileage_km, fuel_type, transmission, body_type, regional_specs, customs_status,
     license_status, insurance_type, seats, owners_count, published_at, updated_at)
   select ${id("car", "i")}, $1, ${session("1 + i % 10")}, case when i % 2 = 1 then ${id("car", "i - 3000")} end,
     'MU-' || pg_temp.code4(c),
     'make' || (1 + c % 25) || '-model' || (1 + c % 6) || '-' || (2005 + c % 20) || '-mu-' || lower(pg_temp.code4(c)),
     'published', 'make' || (1 + i % 25), 'make' || (1 + i % 25) || '-model' || (1 + i % 6), 2015, 1000, 1000,
     'gasoline', 'automatic', 'suv', 'gcc', 'cleared', 'licensed', 'comprehensive', 5, 1,
     ${NOW} - interval '1 hour', ${NOW}
   from generate_series(3001, 3200) i, lateral (select case when i % 2 = 1 then i - 3000 else i end as c) copied`,
  `insert into media (id, dealer_id, car_id, kind, photo_group, sort_order, width, height, mime, variants,
     placeholder, dominant_color, client_upload_id, status, bytes, storage_prefix)
   select ${id("photo", "i || '-' || n")}, $1, ${id("car", "i")}, 'photo',
     (array['exterior','interior','engine','imperfection'])[1 + n % 4]::photo_group, n, 2560, 1707, 'image/webp',
     jsonb_build_object(
       '480', '${BLOB}/cars/' || ${id("car", "i")} || '/photo/' || ${id("photo", "i || '-' || n")} || '-480-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5.webp',
       '960', '${BLOB}/cars/' || ${id("car", "i")} || '/photo/' || ${id("photo", "i || '-' || n")} || '-960-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5.webp',
       '1200', '${BLOB}/x-1200.webp', '1600', '${BLOB}/x-1600.webp', '2560', '${BLOB}/x-2560.webp'),
     '3OcRJYB4d3h/iIeHeEh3eIhw+j3A' || lpad((n % 100)::text, 4, '0'), '#a1b2c3', gen_random_uuid(), 'ready',
     400000, 'cars/' || i || '/'
   from generate_series(1, 2600) i, generate_series(0, 29) n
   where i <= 1000 or (i > 1100 and n < 4)`,
  // A deleted and a pending photo on every tenth public car, a sandbox photo on every twentieth
  `insert into media (id, dealer_id, demo_session_id, car_id, kind, photo_group, sort_order, width, height, mime,
     variants, client_upload_id, status, bytes, storage_prefix, deleted_at)
   select gen_random_uuid(), $1, case when k = 2 then ${session("1 + i % 10")} end, ${id("car", "i")}, 'photo',
     'exterior', 0, 2560, 1707, 'image/webp',
     case when k <> 1 then jsonb_build_object('480', '${BLOB}/x-480.webp', '960', '${BLOB}/x-960.webp') end,
     gen_random_uuid(), (case when k = 1 then 'pending' else 'ready' end)::media_status,
     case when k <> 1 then 1000 end, 'cars/', case when k = 0 then ${NOW} - interval '1 day' end
   from generate_series(1, 1000) i, generate_series(0, 2) k
   where (k < 2 and i % 10 = 0) or (k = 2 and i % 20 = 0)`,
  `insert into media (id, dealer_id, car_id, kind, width, height, mime, variants, client_upload_id, status, bytes,
     storage_prefix)
   select ${id("og", "i")}, $1, ${id("car", "i")}, 'og_image', 1200, 630, 'image/jpeg',
     jsonb_build_object('src', '${BLOB}/og-' || i || '.jpg'), gen_random_uuid(), 'ready', 90000, 'cars/'
   from generate_series(1, 1000) i`,
  `insert into media (id, dealer_id, car_id, kind, mime, variants, client_upload_id, status, bytes, storage_prefix)
   select ${id("report", "i")}, $1, ${id("car", "i")}, 'inspection_report', 'application/pdf',
     jsonb_build_object('src', '${BLOB}/report-' || i || '.pdf'), gen_random_uuid(), 'ready', 900000, 'cars/'
   from generate_series(1, 1000) i`,
  `insert into media (id, dealer_id, car_id, kind, mime, variants, duration_ms, audio_source, audio_clip_type,
     client_upload_id, status, bytes, storage_prefix)
   select gen_random_uuid(), $1, ${id("car", "i")}, 'engine_audio', 'audio/wav',
     jsonb_build_object('src', '${BLOB}/clip-' || i || '.wav'), 12000, 'this_car', 'cold_start', gen_random_uuid(),
     'ready', 500000, 'cars/'
   from generate_series(1, 1000) i where i % 6 <> 2`,
  `insert into media (id, dealer_id, car_id, kind, sort_order, width, height, mime, variants, client_upload_id,
     status, bytes, storage_prefix)
   select gen_random_uuid(), $1, ${id("car", "i")}, 'spin_frame', f, 1600, 1067, 'image/webp',
     jsonb_build_object('1600', '${BLOB}/spin-' || i || '-' || f || '.webp'), gen_random_uuid(), 'ready', 150000,
     'cars/'
   from generate_series(1, 250) i, generate_series(0, 35) f`,
  `insert into media (id, dealer_id, demo_session_id, car_id, kind, photo_group, sort_order, width, height, mime,
     variants, client_upload_id, status, bytes, storage_prefix)
   select gen_random_uuid(), $1, ${session("1 + i % 10")}, ${id("car", "i")}, 'photo', 'exterior', 0, 2560, 1707,
     'image/webp', jsonb_build_object('480', '${BLOB}/d-480.webp'), gen_random_uuid(), 'ready', 1000, 'demo/'
   from generate_series(3001, 3200) i`,
  // Four public cars in five have a cover; the fifth shows its first photo (FR-06)
  `update car set cover_media_id = ${id("photo", "i || '-' || 2")}, og_media_id = ${id("og", "i")}
   from generate_series(1, 1000) i where car.id = ${id("car", "i")} and i % 5 <> 0 and car.dealer_id = $1`,
];

const CHILDREN = [
  `insert into inspection (id, car_id, inspected_on, report_media_id, chassis_state, engine_state, gearbox_state,
     updated_at)
   select ${id("insp", "i")}, ${id("car", "i")}, ${NOW}::date - (i % 90),
     case when i <= 1000 then ${id("report", "i")} end, 'sound',
     (array['sound','notes','issue','unknown'])[1 + i % 4]::mech_state, 'sound', ${NOW} - make_interval(mins => i)
   from generate_series(1, 2600) i where i <= 1000 or i > 1100`,
  `insert into inspection_panel (id, inspection_id, panel_id, state, microns)
   select gen_random_uuid(), ${id("insp", "i")},
     (array['front_bumper','hood','roof','trunk','rear_bumper','fender_front_left','fender_front_right',
            'door_front_left','door_front_right','door_rear_left','door_rear_right','quarter_rear_left',
            'quarter_rear_right'])[p]::panel_id,
     (array['original','touch_up','repainted','replaced','unknown'])[1 + (i + p) % 5]::panel_state, 90 + (i * p) % 300
   from generate_series(1, 2600) i, generate_series(1, 13) p where i <= 1000 or i > 1100`,
  `insert into price_change (id, car_id, old_price_jod, new_price_jod, changed_at)
   select gen_random_uuid(), ${id("car", "i")}, 9000 + c * 500, 9000 + c * 500 - 250,
     ${NOW} - make_interval(days => c * 9)
   from generate_series(1, 1000) i, generate_series(1, 3) c where i % 5 = 1`,
  `insert into spin_set (id, car_id, frame_count, status)
   select gen_random_uuid(), ${id("car", "i")}, 36, (case when i <= 250 then 'ready' else 'processing' end)::spin_status
   from generate_series(1, 280) i`,
];

/** The public cars' ids, as the statements make them: md5('car' || i)::uuid for cars 1 to 1,000 */
export function publicCarIds(): string[] {
  return Array.from({ length: PUBLIC_CARS }, (_, index) =>
    createHash("md5")
      .update(`car${index + 1}`)
      .digest("hex")
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"),
  );
}

/** The fixture's statements, in order, for one connection (the clock and code4 are the session's) */
export function scaleFixture(dealerId: string, now: Date): readonly FixtureStatement[] {
  const plain = (text: string) => ({ text, params: [] });
  const dealer = (text: string) => ({ text, params: [dealerId] });
  return [
    { text: "select set_config('fixture.now', $1, false)", params: [now.toISOString()] },
    plain(CLOCK),
    plain(CODE4),
    ...CATALOG.map(plain),
    ...DEALER.map(dealer),
    ...CHILDREN.map(plain),
    dealer(`insert into car_slug_history (car_id, dealer_id, slug)
      select ${id("car", "i")}, $1, 'earlier-' || i || '-mu-' || lower(pg_temp.code4(i)) from generate_series(1, 300) i`),
  ];
}
