-- Lets the app server do its privileged work with only the publishable key: it sends a secret
-- proof header (derived from a server-only key); the database stores just its SHA-256 hash.
CREATE TABLE public.server_proof (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  proof_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.server_proof TO service_role;
ALTER TABLE public.server_proof ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.server_proof_ok()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE h text; v text;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '');
    v := CASE WHEN h IS NULL THEN NULL ELSE h::json->>'x-pastodev-proof' END;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  IF v IS NULL OR length(v) < 32 THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.server_proof p WHERE p.proof_hash = encode(extensions.digest(v, 'sha256'), 'hex'));
END $$;
GRANT EXECUTE ON FUNCTION public.server_proof_ok() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_register_server_proof(_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  IF _hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Hash tidak valid'; END IF;
  INSERT INTO public.server_proof (id, proof_hash, updated_at) VALUES (1, _hash, now())
  ON CONFLICT (id) DO UPDATE SET proof_hash = excluded.proof_hash, updated_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_register_server_proof(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_server_proof(text) TO authenticated;

-- Platform settings (GitHub app, Firebase): only the app server reads/writes them.
GRANT SELECT, INSERT, UPDATE ON public.platform_secrets TO anon;
CREATE POLICY "Server reads platform settings" ON public.platform_secrets FOR SELECT TO anon USING (public.server_proof_ok());
CREATE POLICY "Server adds platform settings" ON public.platform_secrets FOR INSERT TO anon WITH CHECK (public.server_proof_ok());
CREATE POLICY "Server changes platform settings" ON public.platform_secrets FOR UPDATE TO anon USING (public.server_proof_ok()) WITH CHECK (public.server_proof_ok());

-- Terminal git (clone / pull / push) runs on the app server.
GRANT SELECT, INSERT ON public.git_objects TO anon;
CREATE POLICY "Server reads git objects" ON public.git_objects FOR SELECT TO anon USING (public.server_proof_ok());
CREATE POLICY "Server adds git objects" ON public.git_objects FOR INSERT TO anon WITH CHECK (public.server_proof_ok());

GRANT SELECT, INSERT, UPDATE ON public.git_refs TO anon;
CREATE POLICY "Server reads git refs" ON public.git_refs FOR SELECT TO anon USING (public.server_proof_ok());
CREATE POLICY "Server adds git refs" ON public.git_refs FOR INSERT TO anon WITH CHECK (public.server_proof_ok());
CREATE POLICY "Server changes git refs" ON public.git_refs FOR UPDATE TO anon USING (public.server_proof_ok()) WITH CHECK (public.server_proof_ok());

GRANT SELECT, UPDATE ON public.git_tokens TO anon;
CREATE POLICY "Server checks git tokens" ON public.git_tokens FOR SELECT TO anon USING (public.server_proof_ok());
CREATE POLICY "Server marks git tokens used" ON public.git_tokens FOR UPDATE TO anon USING (public.server_proof_ok()) WITH CHECK (public.server_proof_ok());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_files TO anon;
CREATE POLICY "Server reads repo files" ON public.repo_files FOR SELECT TO anon USING (public.server_proof_ok());
CREATE POLICY "Server adds repo files" ON public.repo_files FOR INSERT TO anon WITH CHECK (public.server_proof_ok());
CREATE POLICY "Server changes repo files" ON public.repo_files FOR UPDATE TO anon USING (public.server_proof_ok()) WITH CHECK (public.server_proof_ok());
CREATE POLICY "Server removes repo files" ON public.repo_files FOR DELETE TO anon USING (public.server_proof_ok());

GRANT SELECT, INSERT ON public.commits TO anon;
CREATE POLICY "Server reads commits" ON public.commits FOR SELECT TO anon USING (public.server_proof_ok());
CREATE POLICY "Server adds commits" ON public.commits FOR INSERT TO anon WITH CHECK (public.server_proof_ok());

GRANT SELECT, UPDATE ON public.repositories TO anon;
CREATE POLICY "Server reads repositories" ON public.repositories FOR SELECT TO anon USING (public.server_proof_ok());
CREATE POLICY "Server changes repositories" ON public.repositories FOR UPDATE TO anon USING (public.server_proof_ok()) WITH CHECK (public.server_proof_ok());

GRANT SELECT ON public.user_bans TO anon;
CREATE POLICY "Server reads bans" ON public.user_bans FOR SELECT TO anon USING (public.server_proof_ok());