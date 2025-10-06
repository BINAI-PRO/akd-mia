BEGIN;

TRUNCATE TABLE
  public.bookings,
  public.membership_payments,
  public.membership_usages,
  public.memberships,
  public.membership_types,
  public.client_profiles,
  public.clients,
  public.session_apparatus,
  public.sessions,
  public.courses,
  public.instructors,
  public.rooms,
  public.class_types
RESTART IDENTITY CASCADE;

WITH class_type_data AS (
  SELECT * FROM (VALUES
    ('reformer_flow', 'Reformer Flow', 'Entrenamiento en reformer enfocado en control y fluidez'),
    ('mat_core', 'Mat Core Essentials', 'Secuencias en mat para fortalecer el centro y mejorar estabilidad'),
    ('tower_strength', 'Tower Strength', 'Clases con tower orientadas a fuerza y control postural')
  ) AS t(key, name, description)
),
inserted_class_types AS (
  INSERT INTO public.class_types (name, description)
  SELECT name, description
  FROM class_type_data
  RETURNING id, name
),
class_type_map AS (
  SELECT ict.id, d.key
  FROM inserted_class_types ict
  JOIN class_type_data d ON ict.name = d.name
),
instructor_data AS (
  SELECT * FROM (VALUES
    ('angie', 'Angie Morales', 'Especialista en pilates contemporaneo con mas de 10 anos guiando clases grupales.'),
    ('bruno', 'Bruno Diaz', 'Enfocado en fuerza funcional y progresiones seguras para alumnos avanzados.'),
    ('carla', 'Carla Suarez', 'Apasionada por el control postural y la respiracion consciente en cada sesion.')
  ) AS t(key, full_name, bio)
),
inserted_instructors AS (
  INSERT INTO public.instructors (full_name, bio)
  SELECT full_name, bio
  FROM instructor_data
  RETURNING id, full_name
),
instructor_map AS (
  SELECT ii.id, d.key
  FROM inserted_instructors ii
  JOIN instructor_data d ON ii.full_name = d.full_name
),
room_data AS (
  SELECT * FROM (VALUES
    ('studio_norte', 'Estudio Norte', 12),
    ('studio_sur', 'Estudio Sur', 8)
  ) AS t(key, name, capacity)
),
inserted_rooms AS (
  INSERT INTO public.rooms (name, capacity)
  SELECT name, capacity
  FROM room_data
  RETURNING id, name
),
room_map AS (
  SELECT ir.id, d.key
  FROM inserted_rooms ir
  JOIN room_data d ON ir.name = d.name
),
course_data AS (
  SELECT * FROM (VALUES
    ('reformer_foundations', 'Reformer Foundations', 'Programa de ocho sesiones para dominar los principios del reformer.', 'Domina la base del reformer y mejora tu fuerza de centro.', 1890.00, 'MXN', '8 sesiones (55 min)', 'Intermedio', 'Reformer', 8, 55, 'angie', 'reformer_flow', 'PUBLIC', 'PUBLISHED', ARRAY['reformer','grupo','intermedio']::text[], NULL),
    ('mat_energize', 'Mat Energize', 'Fortalece tu core con secuencias dinamicas en mat que conectan respiracion y control.', 'Sesiones energeticas para todos los niveles en mat.', 1290.00, 'MXN', '6 sesiones (50 min)', 'Todos los niveles', 'Mat', 6, 50, 'carla', 'mat_core', 'PUBLIC', 'PUBLISHED', ARRAY['mat','movilidad','control']::text[], NULL),
    ('tower_intensive', 'Tower Intensive', 'Ciclo avanzado orientado a fuerza y estabilidad utilizando tower y accesorios.', 'Retos progresivos enfocados en precision y potencia.', 2190.00, 'MXN', '10 sesiones (60 min)', 'Avanzado', 'Tower', 10, 60, 'bruno', 'tower_strength', 'PRIVATE', 'DRAFT', ARRAY['tower','fuerza','avanzado']::text[], NULL)
  ) AS t(
    key,
    title,
    description,
    short_description,
    price,
    currency,
    duration_label,
    level,
    category,
    session_count,
    session_duration_minutes,
    lead_instructor_key,
    class_type_key,
    visibility,
    status,
    tags,
    cover_image_url
  )
),
inserted_courses AS (
  INSERT INTO public.courses (
    title,
    description,
    short_description,
    price,
    currency,
    duration_label,
    level,
    category,
    session_count,
    session_duration_minutes,
    lead_instructor_id,
    visibility,
    status,
    tags,
    cover_image_url,
    class_type_id
  )
  SELECT
    d.title,
    d.description,
    d.short_description,
    d.price,
    d.currency,
    d.duration_label,
    d.level,
    d.category,
    d.session_count,
    d.session_duration_minutes,
    im.id,
    d.visibility::public.course_visibility,
    d.status::public.course_status,
    d.tags,
    d.cover_image_url,
    ctm.id
  FROM course_data d
  JOIN class_type_map ctm ON ctm.key = d.class_type_key
  LEFT JOIN instructor_map im ON im.key = d.lead_instructor_key
  RETURNING id, title, class_type_id
),
course_map AS (
  SELECT ic.id, d.key, ic.class_type_id, d.session_duration_minutes, d.lead_instructor_key
  FROM inserted_courses ic
  JOIN course_data d ON ic.title = d.title
),
session_data AS (
  SELECT * FROM (VALUES
    ('reformer_session_1', 'reformer_foundations', 'angie', 'studio_norte', date_trunc('day', now()) + interval '1 day' + interval '9 hour', 55, 10),
    ('reformer_session_2', 'reformer_foundations', 'angie', 'studio_norte', date_trunc('day', now()) + interval '3 day' + interval '9 hour', 55, 10),
    ('reformer_session_past', 'reformer_foundations', 'angie', 'studio_norte', date_trunc('day', now()) - interval '2 day' + interval '9 hour', 55, 10),
    ('mat_session_1', 'mat_energize', 'carla', 'studio_sur', date_trunc('day', now()) + interval '2 day' + interval '11 hour', 50, 8),
    ('mat_session_2', 'mat_energize', 'carla', 'studio_sur', date_trunc('day', now()) + interval '5 day' + interval '18 hour', 50, 8),
    ('tower_session_1', 'tower_intensive', 'bruno', 'studio_norte', date_trunc('day', now()) + interval '4 day' + interval '7 hour', 60, 6)
  ) AS t(
    key,
    course_key,
    instructor_key,
    room_key,
    start_time,
    duration_minutes,
    capacity
  )
),
prepared_sessions AS (
  SELECT
    d.key,
    cm.id AS course_id,
    cm.class_type_id,
    COALESCE(im.id, default_im.id) AS instructor_id,
    rm.id AS room_id,
    d.start_time,
    d.start_time + make_interval(mins => d.duration_minutes) AS end_time,
    d.capacity
  FROM session_data d
  JOIN course_map cm ON cm.key = d.course_key
  LEFT JOIN instructor_map im ON im.key = d.instructor_key
  LEFT JOIN instructor_map default_im ON default_im.key = cm.lead_instructor_key
  JOIN room_map rm ON rm.key = d.room_key
),
inserted_sessions AS (
  INSERT INTO public.sessions (
    course_id,
    class_type_id,
    instructor_id,
    room_id,
    start_time,
    end_time,
    capacity,
    current_occupancy
  )
  SELECT
    ps.course_id,
    ps.class_type_id,
    ps.instructor_id,
    ps.room_id,
    ps.start_time,
    ps.end_time,
    ps.capacity,
    0
  FROM prepared_sessions ps
  RETURNING id, course_id, start_time
),
session_map AS (
  SELECT ins.id, ps.key
  FROM inserted_sessions ins
  JOIN prepared_sessions ps ON ps.course_id = ins.course_id AND ps.start_time = ins.start_time
),
client_data AS (
  SELECT * FROM (VALUES
    ('paola', 'Paola Vazquez', 'paola.vazquez@example.com', '+52 55 1234 5678', 45),
    ('ricardo', 'Ricardo Hernandez', 'ricardo.hernandez@example.com', '+52 55 2233 8899', 32),
    ('sofia', 'Sofia Arias', 'sofia.arias@example.com', '+52 55 9988 7766', 18),
    ('mariana', 'Mariana Trejo', 'mariana.trejo@example.com', '+52 55 6677 3311', 60)
  ) AS t(key, full_name, email, phone, created_days_ago)
),
inserted_clients AS (
  INSERT INTO public.clients (full_name, email, phone, created_at)
  SELECT
    d.full_name,
    d.email,
    d.phone,
    now() - (d.created_days_ago || ' days')::interval
  FROM client_data d
  RETURNING id, email
),
client_map AS (
  SELECT ic.id, d.key
  FROM inserted_clients ic
  JOIN client_data d ON ic.email = d.email
),
client_profile_data AS (
  SELECT * FROM (VALUES
    ('paola', 'ACTIVE', 'Fanatica del reformer, asiste tres veces por semana.', 'Laura Vazquez', '+52 55 4455 6677'),
    ('ricardo', 'PAYMENT_FAILED', 'Requiere seguimiento para renovar plan mensual.', 'Javier Hernandez', '+52 55 7788 9900'),
    ('sofia', 'ON_HOLD', 'En pausa por viaje, regresa el proximo mes.', NULL, NULL),
    ('mariana', 'ACTIVE', 'Prefiere sesiones privadas los fines de semana.', 'Luis Trejo', '+52 55 3344 2211')
  ) AS t(client_key, status, notes, emergency_contact_name, emergency_contact_phone)
),
inserted_client_profiles AS (
  INSERT INTO public.client_profiles (
    client_id,
    status,
    notes,
    emergency_contact_name,
    emergency_contact_phone
  )
  SELECT
    cm.id,
    d.status::public.client_status,
    d.notes,
    d.emergency_contact_name,
    d.emergency_contact_phone
  FROM client_profile_data d
  JOIN client_map cm ON cm.key = d.client_key
  RETURNING client_id
),
membership_type_data AS (
  SELECT * FROM (VALUES
    ('ilimitado_mes', 'Membresia Ilimitada', 'Acceso ilimitado a clases grupales durante todo el mes.', 'MONTHLY', 'OPEN_CLASS', 1990.00, 'MXN', NULL, 7, true, true, true),
    ('pack_5', 'Paquete 5 Clases', 'Ideal para quienes desean flexibilidad con un paquete de creditos.', 'MONTHLY', 'FIXED_CLASS', 1290.00, 'MXN', 5, NULL, true, true, true),
    ('anual_pro', 'Plan Anual Pro', 'Acceso total a clases y cursos con el mejor precio anual.', 'ANNUAL', 'OPEN_CLASS', 19990.00, 'MXN', NULL, 14, true, true, true)
  ) AS t(
    key,
    name,
    description,
    billing_period,
    access_type,
    price,
    currency,
    class_quota,
    trial_days,
    access_classes,
    access_courses,
    is_active
  )
),
inserted_membership_types AS (
  INSERT INTO public.membership_types (
    name,
    description,
    billing_period,
    access_type,
    price,
    currency,
    class_quota,
    trial_days,
    access_classes,
    access_courses,
    is_active
  )
  SELECT
    d.name,
    d.description,
    d.billing_period::public.billing_period,
    d.access_type::public.access_type,
    d.price,
    d.currency,
    d.class_quota,
    d.trial_days,
    d.access_classes,
    d.access_courses,
    d.is_active
  FROM membership_type_data d
  RETURNING id, name
),
membership_type_map AS (
  SELECT imt.id, d.key
  FROM inserted_membership_types imt
  JOIN membership_type_data d ON imt.name = d.name
),
membership_data AS (
  SELECT * FROM (VALUES
    ('m_paola', 'paola', 'ilimitado_mes', 'ACTIVE', true, 40, 20, 20, NULL, 'Renovacion automatica cada mes.'),
    ('m_ricardo', 'ricardo', 'pack_5', 'PAUSED', false, 25, 5, NULL, 2, 'Pendiente de completar pagos.'),
    ('m_sofia', 'sofia', 'pack_5', 'ACTIVE', false, 90, -10, NULL, 1, 'Solicito reactivar en noviembre.'),
    ('m_mariana', 'mariana', 'anual_pro', 'ACTIVE', true, 200, 165, 30, NULL, 'Plan anual con entrenamientos personalizados.')
  ) AS t(
    key,
    client_key,
    membership_type_key,
    status,
    auto_renew,
    start_days_ago,
    end_in_days,
    next_billing_in_days,
    remaining_classes,
    notes
  )
),
prepared_memberships AS (
  SELECT
    d.key,
    cm.id AS client_id,
    mtm.id AS membership_type_id,
    d.status::public.membership_status,
    d.auto_renew,
    (current_date - d.start_days_ago) AS start_date,
    (current_date + d.end_in_days) AS end_date,
    CASE WHEN d.next_billing_in_days IS NOT NULL THEN current_date + d.next_billing_in_days ELSE NULL END AS next_billing_date,
    d.remaining_classes,
    d.notes
  FROM membership_data d
  JOIN client_map cm ON cm.key = d.client_key
  JOIN membership_type_map mtm ON mtm.key = d.membership_type_key
),
inserted_memberships AS (
  INSERT INTO public.memberships (
    client_id,
    membership_type_id,
    status,
    start_date,
    end_date,
    next_billing_date,
    auto_renew,
    remaining_classes,
    notes
  )
  SELECT
    pm.client_id,
    pm.membership_type_id,
    pm.status,
    pm.start_date,
    pm.end_date,
    pm.next_billing_date,
    pm.auto_renew,
    pm.remaining_classes,
    pm.notes
  FROM prepared_memberships pm
  RETURNING id, client_id, membership_type_id
),
membership_map AS (
  SELECT im.id, pm.key
  FROM inserted_memberships im
  JOIN prepared_memberships pm ON pm.client_id = im.client_id AND pm.membership_type_id = im.membership_type_id
),
membership_payments_data AS (
  SELECT * FROM (VALUES
    ('m_paola', 1990.00, 'MXN', 'SUCCESS', current_timestamp - interval '25 day', current_date - 30, current_date - 1, 'INV-1001', NULL),
    ('m_paola', 1990.00, 'MXN', 'SUCCESS', current_timestamp - interval '5 day', current_date - 2, current_date + 28, 'INV-1032', NULL),
    ('m_ricardo', 1290.00, 'MXN', 'PENDING', NULL, current_date - 5, current_date + 25, 'INV-2077', 'Pendiente de pago con tarjeta'),
    ('m_mariana', 19990.00, 'MXN', 'SUCCESS', current_timestamp - interval '70 day', current_date - 200, current_date + 165, 'INV-5500', 'Pago anual adelantado')
  ) AS t(
    membership_key,
    amount,
    currency,
    status,
    paid_at,
    period_start,
    period_end,
    provider_ref,
    notes
  )
),
inserted_membership_payments AS (
  INSERT INTO public.membership_payments (
    membership_id,
    amount,
    currency,
    status,
    paid_at,
    period_start,
    period_end,
    provider_ref,
    notes
  )
  SELECT
    mm.id,
    d.amount,
    d.currency,
    d.status::public.payment_status,
    COALESCE(d.paid_at, current_timestamp),
    d.period_start,
    d.period_end,
    d.provider_ref,
    d.notes
  FROM membership_payments_data d
  JOIN membership_map mm ON mm.key = d.membership_key
  RETURNING id
),
booking_data AS (
  SELECT * FROM (VALUES
    ('bkg_paola_1', 'reformer_session_1', 'paola', 'CONFIRMED', current_timestamp - interval '3 day'),
    ('bkg_paola_2', 'mat_session_1', 'paola', 'CONFIRMED', current_timestamp - interval '1 day'),
    ('bkg_ricardo_1', 'reformer_session_2', 'ricardo', 'PENDING', current_timestamp - interval '2 day'),
    ('bkg_sofia_1', 'mat_session_2', 'sofia', 'CONFIRMED', current_timestamp - interval '6 hour'),
    ('bkg_mariana_1', 'tower_session_1', 'mariana', 'CONFIRMED', current_timestamp - interval '12 hour')
  ) AS t(
    key,
    session_key,
    client_key,
    status,
    reserved_at
  )
)
INSERT INTO public.bookings (
  session_id,
  client_id,
  status,
  reserved_at
)
SELECT
  sm.id,
  cm.id,
  CASE
    WHEN bd.status = 'PENDING' THEN 'CONFIRMED'::public.booking_status
    ELSE bd.status::public.booking_status
  END,
  bd.reserved_at
FROM booking_data bd
JOIN session_map sm ON sm.key = bd.session_key
JOIN client_map cm ON cm.key = bd.client_key;

-- generar slugs amigables
UPDATE public.courses
SET slug = regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')
WHERE slug IS NULL;

-- recalcular ocupacion segun reservaciones confirmadas
WITH occupancy AS (
  SELECT session_id, COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS total
  FROM public.bookings
  GROUP BY session_id
)
UPDATE public.sessions s
SET current_occupancy = COALESCE(o.total, 0)
FROM occupancy o
WHERE s.id = o.session_id;

COMMIT;
