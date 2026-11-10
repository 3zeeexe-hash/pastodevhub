-- ============ Roles ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles read own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ============ Profiles ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_-]{1,39}$'),
  display_name text CHECK (char_length(display_name) <= 120),
  bio text CHECK (char_length(bio) <= 2000),
  avatar_url text,
  location text,
  website text,
  company text,
  account_type text CHECK (account_type IN ('client','developer')),
  headline text CHECK (char_length(headline) <= 160),
  skills text[] NOT NULL DEFAULT '{}',
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_for_hire boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles public read" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "profiles own update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_developer(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND account_type = 'developer') $$;

CREATE OR REPLACE FUNCTION public.is_client(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND account_type = 'client') $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_row(u auth.users)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE base text; uname text; n int := 0; atype text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = u.id) THEN RETURN; END IF;
  base := lower(regexp_replace(coalesce(u.raw_user_meta_data->>'username', u.raw_user_meta_data->>'user_name', split_part(u.email,'@',1)), '[^a-zA-Z0-9_-]', '', 'g'));
  IF base = '' OR base IS NULL THEN base := 'dev'; END IF;
  base := left(base, 30);
  uname := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) LOOP
    n := n + 1; uname := base || n;
  END LOOP;
  atype := u.raw_user_meta_data->>'account_type';
  IF atype IS NULL OR atype NOT IN ('client','developer') THEN atype := NULL; END IF;
  INSERT INTO public.profiles (id, username, display_name, avatar_url, account_type)
  VALUES (u.id, uname, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', uname), coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'), atype)
  ON CONFLICT (id) DO NOTHING;
END $function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_row(auth.users) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.handle_new_user_row(NEW);
  RETURN NEW;
END $function$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE u auth.users;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN RETURN; END IF;
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.handle_new_user_row(u);
END $function$;
REVOKE EXECUTE ON FUNCTION public.ensure_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

CREATE TABLE public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT ON public.follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows public read" ON public.follows FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "follows own insert" ON public.follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows own delete" ON public.follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- ============ Repositories ============
CREATE TABLE public.repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name ~ '^[A-Za-z0-9._-]{1,100}$'),
  description text CHECK (char_length(description) <= 500),
  language text,
  is_private boolean NOT NULL DEFAULT false,
  default_branch text NOT NULL DEFAULT 'main',
  topics text[] NOT NULL DEFAULT '{}',
  homepage text,
  forked_from uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  github_full_name text,
  next_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);
CREATE INDEX repositories_forked_from_idx ON public.repositories (forked_from);
CREATE INDEX repositories_updated_idx ON public.repositories (updated_at DESC);
GRANT SELECT ON public.repositories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repositories TO authenticated;
GRANT ALL ON public.repositories TO service_role;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_repo(rid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.repositories WHERE id = rid AND (NOT is_private OR owner_id = auth.uid())) $$;

CREATE OR REPLACE FUNCTION public.can_write_repo(rid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.repositories WHERE id = rid AND owner_id = auth.uid()) $$;

CREATE POLICY "repos read" ON public.repositories FOR SELECT TO anon, authenticated USING (NOT is_private OR owner_id = auth.uid());
CREATE POLICY "repos owner insert" ON public.repositories FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "repos owner update" ON public.repositories FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "repos owner delete" ON public.repositories FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Owners cannot fake the issue/PR counter.
CREATE OR REPLACE FUNCTION public.repositories_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('pastodev.repo_system', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.next_number := 1; ELSE NEW.next_number := OLD.next_number; NEW.owner_id := OLD.owner_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER repositories_guard BEFORE INSERT OR UPDATE ON public.repositories FOR EACH ROW EXECUTE FUNCTION public.repositories_guard();

CREATE TABLE public.repo_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 1000),
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, path)
);
GRANT SELECT ON public.repo_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_files TO authenticated;
GRANT ALL ON public.repo_files TO service_role;
ALTER TABLE public.repo_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files read" ON public.repo_files FOR SELECT TO anon, authenticated USING (public.can_read_repo(repo_id));
CREATE POLICY "files write insert" ON public.repo_files FOR INSERT TO authenticated WITH CHECK (public.can_write_repo(repo_id));
CREATE POLICY "files write update" ON public.repo_files FOR UPDATE TO authenticated USING (public.can_write_repo(repo_id)) WITH CHECK (public.can_write_repo(repo_id));
CREATE POLICY "files write delete" ON public.repo_files FOR DELETE TO authenticated USING (public.can_write_repo(repo_id));

CREATE TABLE public.commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commits_repo_idx ON public.commits (repo_id, created_at DESC);
CREATE INDEX commits_author_idx ON public.commits (author_id, created_at DESC);
GRANT SELECT ON public.commits TO anon;
GRANT SELECT, INSERT ON public.commits TO authenticated;
GRANT ALL ON public.commits TO service_role;
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commits read" ON public.commits FOR SELECT TO anon, authenticated USING (public.can_read_repo(repo_id));
CREATE POLICY "commits write" ON public.commits FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.can_write_repo(repo_id));

CREATE OR REPLACE FUNCTION public.commits_touch_repo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('pastodev.repo_system', 'on', true);
  UPDATE public.repositories SET updated_at = now() WHERE id = NEW.repo_id;
  PERFORM set_config('pastodev.repo_system', 'off', true);
  RETURN NULL;
END $$;
CREATE TRIGGER commits_touch_repo AFTER INSERT ON public.commits FOR EACH ROW EXECUTE FUNCTION public.commits_touch_repo();

CREATE TABLE public.stars (
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, user_id)
);
GRANT SELECT ON public.stars TO anon;
GRANT SELECT, INSERT, DELETE ON public.stars TO authenticated;
GRANT ALL ON public.stars TO service_role;
ALTER TABLE public.stars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stars read" ON public.stars FOR SELECT TO anon, authenticated USING (public.can_read_repo(repo_id));
CREATE POLICY "stars own insert" ON public.stars FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.can_read_repo(repo_id));
CREATE POLICY "stars own delete" ON public.stars FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Issues and pull requests share one number sequence per repo, like GitHub.
CREATE OR REPLACE FUNCTION public.assign_repo_number()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('pastodev.repo_system', 'on', true);
  UPDATE public.repositories SET next_number = next_number + 1 WHERE id = NEW.repo_id RETURNING next_number - 1 INTO n;
  PERFORM set_config('pastodev.repo_system', 'off', true);
  NEW.number := n;
  RETURN NEW;
END $$;

CREATE TABLE public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  number integer NOT NULL DEFAULT 0,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 250),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 65000),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, number)
);
GRANT SELECT ON public.issues TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issues TO authenticated;
GRANT ALL ON public.issues TO service_role;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "issues read" ON public.issues FOR SELECT TO anon, authenticated USING (public.can_read_repo(repo_id));
CREATE POLICY "issues insert" ON public.issues FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.can_read_repo(repo_id));
CREATE POLICY "issues update" ON public.issues FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.can_write_repo(repo_id)) WITH CHECK (author_id = auth.uid() OR public.can_write_repo(repo_id));
CREATE POLICY "issues delete" ON public.issues FOR DELETE TO authenticated USING (public.can_write_repo(repo_id));
CREATE TRIGGER issues_number BEFORE INSERT ON public.issues FOR EACH ROW EXECUTE FUNCTION public.assign_repo_number();

CREATE TABLE public.issue_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 65000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.issue_repo(_issue_id uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT repo_id FROM public.issues WHERE id = _issue_id $$;
GRANT SELECT ON public.issue_comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.issue_comments TO authenticated;
GRANT ALL ON public.issue_comments TO service_role;
ALTER TABLE public.issue_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "issue comments read" ON public.issue_comments FOR SELECT TO anon, authenticated USING (public.can_read_repo(public.issue_repo(issue_id)));
CREATE POLICY "issue comments insert" ON public.issue_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.can_read_repo(public.issue_repo(issue_id)));
CREATE POLICY "issue comments delete" ON public.issue_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.can_write_repo(public.issue_repo(issue_id)));

CREATE TABLE public.pull_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  head_repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  number integer NOT NULL DEFAULT 0,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 250),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 65000),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed','merged')),
  merged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, number)
);
GRANT SELECT ON public.pull_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pull_requests TO authenticated;
GRANT ALL ON public.pull_requests TO service_role;
ALTER TABLE public.pull_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prs read" ON public.pull_requests FOR SELECT TO anon, authenticated USING (public.can_read_repo(repo_id));
CREATE POLICY "prs insert" ON public.pull_requests FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND state = 'open' AND public.can_read_repo(repo_id) AND public.can_read_repo(head_repo_id));
CREATE POLICY "prs update" ON public.pull_requests FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_write_repo(repo_id)) WITH CHECK (author_id = auth.uid() OR public.can_write_repo(repo_id));
CREATE TRIGGER prs_number BEFORE INSERT ON public.pull_requests FOR EACH ROW EXECUTE FUNCTION public.assign_repo_number();

-- Only the base repo owner may mark a pull request as merged.
CREATE OR REPLACE FUNCTION public.prs_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  NEW.repo_id := OLD.repo_id; NEW.head_repo_id := OLD.head_repo_id; NEW.author_id := OLD.author_id; NEW.number := OLD.number;
  IF NEW.state = 'merged' AND OLD.state <> 'merged' AND NOT public.can_write_repo(OLD.repo_id) THEN
    RAISE EXCEPTION 'Hanya pemilik repositori yang bisa merge';
  END IF;
  IF OLD.state = 'merged' THEN NEW.state := 'merged'; NEW.merged_at := OLD.merged_at; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prs_guard BEFORE UPDATE ON public.pull_requests FOR EACH ROW EXECUTE FUNCTION public.prs_guard();

CREATE TABLE public.pr_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.pull_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 65000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.pr_repo(_pr_id uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT repo_id FROM public.pull_requests WHERE id = _pr_id $$;
GRANT SELECT ON public.pr_comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.pr_comments TO authenticated;
GRANT ALL ON public.pr_comments TO service_role;
ALTER TABLE public.pr_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr comments read" ON public.pr_comments FOR SELECT TO anon, authenticated USING (public.can_read_repo(public.pr_repo(pr_id)));
CREATE POLICY "pr comments insert" ON public.pr_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.can_read_repo(public.pr_repo(pr_id)));
CREATE POLICY "pr comments delete" ON public.pr_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.can_write_repo(public.pr_repo(pr_id)));

-- ============ Discussions ============
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_created_idx ON public.posts (created_at DESC);
GRANT SELECT ON public.posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read" ON public.posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "posts own insert" ON public.posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts own update" ON public.posts FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts own delete" ON public.posts FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read" ON public.comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "comments own insert" ON public.comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments own delete" ON public.comments FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ============ GitHub connections ============
CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  provider_login text,
  provider_avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO authenticated;
GRANT ALL ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "connections own read" ON public.app_user_connections FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "connections own insert" ON public.app_user_connections FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "connections own update" ON public.app_user_connections FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "connections own delete" ON public.app_user_connections FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.platform_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  github_client_id text,
  github_client_secret_ciphertext text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_secrets TO service_role;
ALTER TABLE public.platform_secrets ENABLE ROW LEVEL SECURITY;
