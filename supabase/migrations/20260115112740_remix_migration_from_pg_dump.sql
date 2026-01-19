CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

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



SET default_table_access_method = heap;

--
-- Name: generated_websites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generated_websites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_name text NOT NULL,
    html_content text NOT NULL,
    category text,
    address text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: generated_websites generated_websites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_websites
    ADD CONSTRAINT generated_websites_pkey PRIMARY KEY (id);


--
-- Name: generated_websites Anyone can create websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create websites" ON public.generated_websites FOR INSERT WITH CHECK (true);


--
-- Name: generated_websites Anyone can delete websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete websites" ON public.generated_websites FOR DELETE USING (true);


--
-- Name: generated_websites Anyone can view generated websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view generated websites" ON public.generated_websites FOR SELECT USING (true);


--
-- Name: generated_websites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.generated_websites ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;