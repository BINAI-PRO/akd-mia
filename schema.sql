--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: access_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.access_type AS ENUM (
    'FIXED_CLASS',
    'OPEN_CLASS'
);


--
-- Name: billing_period; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_period AS ENUM (
    'MONTHLY',
    'ANNUAL'
);


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'CONFIRMED',
    'CANCELLED',
    'CHECKED_IN'
);


--
-- Name: membership_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.membership_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'PAUSED',
    'CANCELED'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'SUCCESS',
    'FAILED',
    'REFUNDED',
    'PENDING'
);


--
-- Name: renew_membership(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.renew_membership(p_membership_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  m   public.memberships%ROWTYPE;
  mt  public.membership_types%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership % not found', p_membership_id; END IF;

  SELECT * INTO mt FROM public.membership_types WHERE id = m.membership_type_id;

  IF m.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Membership % must be ACTIVE to renew', p_membership_id;
  END IF;

  -- Avanza periodo
  IF mt.billing_period = 'MONTHLY' THEN
    m.start_date := m.end_date;
    m.end_date   := (m.end_date + INTERVAL '1 month')::date;
  ELSE
    m.start_date := m.end_date;
    m.end_date   := (m.end_date + INTERVAL '1 year')::date;
  END IF;

  -- Próximo cobro
  IF m.auto_renew THEN
    m.next_billing_date := m.end_date;
  ELSE
    m.next_billing_date := NULL;
  END IF;

  -- Reseteo de créditos si aplica
  IF mt.class_quota IS NOT NULL THEN
    m.remaining_classes := mt.class_quota;
  ELSE
    m.remaining_classes := NULL;
  END IF;

  UPDATE public.memberships
     SET start_date = m.start_date,
         end_date = m.end_date,
         next_billing_date = m.next_billing_date,
         remaining_classes = m.remaining_classes
   WHERE id = p_membership_id;
END;
$$;


--
-- Name: set_membership_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_membership_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_period public.billing_period;
  v_quota  integer;
BEGIN
  SELECT billing_period, class_quota
    INTO v_period, v_quota
  FROM public.membership_types
  WHERE id = NEW.membership_type_id;

  -- end_date
  IF NEW.end_date IS NULL THEN
    IF v_period = 'MONTHLY' THEN
      NEW.end_date := (NEW.start_date + INTERVAL '1 month')::date;
    ELSIF v_period = 'ANNUAL' THEN
      NEW.end_date := (NEW.start_date + INTERVAL '1 year')::date;
    ELSE
      RAISE EXCEPTION 'Unsupported billing_period %', v_period;
    END IF;
  END IF;

  -- next_billing_date
  IF NEW.auto_renew AND NEW.next_billing_date IS NULL THEN
    NEW.next_billing_date := NEW.end_date;
  END IF;

  -- remaining_classes
  IF NEW.remaining_classes IS NULL THEN
    IF v_quota IS NOT NULL THEN
      NEW.remaining_classes := v_quota;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: apparatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apparatus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    client_id uuid NOT NULL,
    apparatus_id uuid,
    status public.booking_status DEFAULT 'CONFIRMED'::public.booking_status NOT NULL,
    reserved_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instructors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    bio text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: membership_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'MXN'::text NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status public.payment_status DEFAULT 'SUCCESS'::public.payment_status NOT NULL,
    provider_ref text,
    notes text,
    CONSTRAINT membership_payments_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: membership_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    billing_period public.billing_period NOT NULL,
    access_type public.access_type NOT NULL,
    price numeric(12,2) NOT NULL,
    currency text DEFAULT 'MXN'::text NOT NULL,
    class_quota integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT membership_types_class_quota_check CHECK ((class_quota >= 0)),
    CONSTRAINT membership_types_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: membership_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_usages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    session_id uuid NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    membership_type_id uuid NOT NULL,
    status public.membership_status DEFAULT 'ACTIVE'::public.membership_status NOT NULL,
    start_date date DEFAULT (now())::date NOT NULL,
    end_date date NOT NULL,
    next_billing_date date,
    auto_renew boolean DEFAULT true NOT NULL,
    assigned_session_id uuid,
    remaining_classes integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memberships_remaining_classes_check CHECK ((remaining_classes >= 0))
);


--
-- Name: qr_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_tokens (
    booking_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    capacity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rooms_capacity_check CHECK ((capacity > 0))
);


--
-- Name: session_apparatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_apparatus (
    session_id uuid NOT NULL,
    apparatus_id uuid NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT session_apparatus_quantity_check CHECK ((quantity >= 0))
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_type_id uuid NOT NULL,
    room_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    capacity integer NOT NULL,
    current_occupancy integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sessions_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT sessions_time CHECK ((end_time > start_time))
);


--
-- Name: apparatus apparatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus
    ADD CONSTRAINT apparatus_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_session_id_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_session_id_client_id_key UNIQUE (session_id, client_id);


--
-- Name: class_types class_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_types
    ADD CONSTRAINT class_types_pkey PRIMARY KEY (id);


--
-- Name: clients clients_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_email_key UNIQUE (email);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: instructors instructors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_pkey PRIMARY KEY (id);


--
-- Name: membership_payments membership_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_payments
    ADD CONSTRAINT membership_payments_pkey PRIMARY KEY (id);


--
-- Name: membership_types membership_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_types
    ADD CONSTRAINT membership_types_name_key UNIQUE (name);


--
-- Name: membership_types membership_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_types
    ADD CONSTRAINT membership_types_pkey PRIMARY KEY (id);


--
-- Name: membership_usages membership_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_usages
    ADD CONSTRAINT membership_usages_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: qr_tokens qr_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT qr_tokens_pkey PRIMARY KEY (booking_id);


--
-- Name: qr_tokens qr_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT qr_tokens_token_key UNIQUE (token);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: session_apparatus session_apparatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_apparatus
    ADD CONSTRAINT session_apparatus_pkey PRIMARY KEY (session_id, apparatus_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: bookings_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_client_id_idx ON public.bookings USING btree (client_id);


--
-- Name: bookings_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_session_id_idx ON public.bookings USING btree (session_id);


--
-- Name: membership_payments_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_payments_membership_idx ON public.membership_payments USING btree (membership_id);


--
-- Name: membership_payments_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_payments_period_idx ON public.membership_payments USING btree (period_start, period_end);


--
-- Name: membership_types_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_types_active_idx ON public.membership_types USING btree (is_active);


--
-- Name: membership_types_period_access_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_types_period_access_idx ON public.membership_types USING btree (billing_period, access_type);


--
-- Name: membership_usages_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_usages_membership_idx ON public.membership_usages USING btree (membership_id);


--
-- Name: membership_usages_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_usages_session_idx ON public.membership_usages USING btree (session_id);


--
-- Name: memberships_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_client_idx ON public.memberships USING btree (client_id);


--
-- Name: memberships_next_bill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_next_bill_idx ON public.memberships USING btree (next_billing_date);


--
-- Name: memberships_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_status_idx ON public.memberships USING btree (status);


--
-- Name: sessions_start_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_start_time_idx ON public.sessions USING btree (start_time);


--
-- Name: memberships trg_set_membership_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_membership_defaults BEFORE INSERT ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.set_membership_defaults();


--
-- Name: bookings bookings_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE RESTRICT;


--
-- Name: bookings bookings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;


--
-- Name: bookings bookings_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: membership_payments membership_payments_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_payments
    ADD CONSTRAINT membership_payments_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE CASCADE;


--
-- Name: membership_usages membership_usages_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_usages
    ADD CONSTRAINT membership_usages_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE CASCADE;


--
-- Name: membership_usages membership_usages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_usages
    ADD CONSTRAINT membership_usages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: memberships memberships_assigned_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_assigned_session_id_fkey FOREIGN KEY (assigned_session_id) REFERENCES public.sessions(id);


--
-- Name: memberships memberships_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_membership_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_membership_type_id_fkey FOREIGN KEY (membership_type_id) REFERENCES public.membership_types(id);


--
-- Name: qr_tokens qr_tokens_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT qr_tokens_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: session_apparatus session_apparatus_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_apparatus
    ADD CONSTRAINT session_apparatus_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE RESTRICT;


--
-- Name: session_apparatus session_apparatus_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_apparatus
    ADD CONSTRAINT session_apparatus_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_class_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_class_type_id_fkey FOREIGN KEY (class_type_id) REFERENCES public.class_types(id) ON DELETE RESTRICT;


--
-- Name: sessions sessions_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE RESTRICT;


--
-- Name: sessions sessions_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE RESTRICT;


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: class_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_types ENABLE ROW LEVEL SECURITY;

--
-- Name: instructors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships memberships_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_admin_all ON public.memberships USING (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean)) WITH CHECK (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean));


--
-- Name: memberships memberships_by_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_by_owner ON public.memberships FOR SELECT USING ((client_id = auth.uid()));


--
-- Name: bookings public insert bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public insert bookings" ON public.bookings FOR INSERT WITH CHECK (true);


--
-- Name: qr_tokens public insert qr_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public insert qr_tokens" ON public.qr_tokens FOR INSERT WITH CHECK (true);


--
-- Name: bookings public read bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read bookings" ON public.bookings FOR SELECT USING (true);


--
-- Name: class_types public read class_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read class_types" ON public.class_types FOR SELECT USING (true);


--
-- Name: instructors public read instructors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read instructors" ON public.instructors FOR SELECT USING (true);


--
-- Name: qr_tokens public read qr_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read qr_tokens" ON public.qr_tokens FOR SELECT USING (true);


--
-- Name: rooms public read rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read rooms" ON public.rooms FOR SELECT USING (true);


--
-- Name: sessions public read sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read sessions" ON public.sessions FOR SELECT USING (true);


--
-- Name: qr_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

