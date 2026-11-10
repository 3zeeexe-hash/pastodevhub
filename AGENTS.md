<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->
## Project rules (Pastodev)

- Repo contents live as rows in `repo_files` (current state of the single default branch); every write goes through `commitChanges` in `src/lib/repo-data.ts` so history stays in `commits.changes`. Why: one code path keeps file state and commit history consistent.
- Repo access rules sit in the database (`can_read_repo` / `can_write_repo`); client writes rely on them instead of server checks. Why: private repos must stay hidden on every query path.
- Pull requests compare a fork's files with its upstream and merge client-side as the base owner. Why: there are no branches, forks are the unit of contribution.
- GitHub access is per user via the project's own GitHub OAuth app (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`); tokens are AES-encrypted with `APP_USER_CONNECTION_KEY_SECRET` in `app_user_connections` (own-row RLS, user client) so it also runs on a self-hosted deploy without the service-role key. All GitHub calls live in `src/lib/github.functions.ts`; large imports are split into small server calls driven from `src/lib/github-client.ts`. Why: keys stay server-side and each request stays within edge subrequest limits.
- GitHub cannot be a sign-in method (not supported by Lovable Cloud); users sign in with email, Google or Lovable and then connect GitHub.
- User-made HTML (hosted pages at `/f/<slug>`, custom stores at `/toko/<username>`) only runs inside a sandbox (CSP `sandbox` header or `<iframe sandbox>` without `allow-same-origin`). Why: it must never read the visitor's Pastodev session.
- The repo AI editor calls Gemini/OpenAI straight from the browser with the user's own key kept in localStorage (`src/lib/ai-repo.ts`); proposed files are applied through `commitChanges`. Why: user keys never touch our server, and AI edits keep normal commit history.
- Admin sign-in checks ADMIN_USERNAME/ADMIN_PASSWORD on the server, keeps a dedicated admin auth account whose real password is an HMAC of ADMIN_PASSWORD (`src/lib/admin-login.server.ts`), signs it in server-side and hands the session to the browser. Why: the chosen admin password may fail the leaked-password check and must never be the account credential.
- Order, payout, job-application and download state changes go through SECURITY DEFINER database functions; clients only read those tables. Why: money and status rules must hold no matter which client calls.
