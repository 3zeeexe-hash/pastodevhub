-- Git object store (server-only: read and written by the git HTTP endpoint)
CREATE TABLE public.git_objects (
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  sha text NOT NULL,
  type text NOT NULL CHECK (type IN ('blob','tree','commit','tag')),
  data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, sha)
);
GRANT ALL ON public.git_objects TO service_role;
ALTER TABLE public.git_objects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.git_refs (
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  name text NOT NULL,
  sha text NOT NULL,
  synced_commit_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, name)
);
GRANT ALL ON public.git_refs TO service_role;
ALTER TABLE public.git_refs ENABLE ROW LEVEL SECURITY;

-- Personal access tokens for git over HTTPS (only the hash is stored)
CREATE TABLE public.git_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX git_tokens_user_idx ON public.git_tokens(user_id);
GRANT SELECT, INSERT, DELETE ON public.git_tokens TO authenticated;
GRANT ALL ON public.git_tokens TO service_role;
ALTER TABLE public.git_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own tokens readable" ON public.git_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own tokens insert" ON public.git_tokens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own tokens delete" ON public.git_tokens FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Firebase Google sign-in settings (admin panel)
ALTER TABLE public.platform_secrets
  ADD COLUMN firebase_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN firebase_config jsonb,
  ADD COLUMN firebase_project_id text,
  ADD COLUMN firebase_client_email text,
  ADD COLUMN firebase_service_account_ciphertext text;