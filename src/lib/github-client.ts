// Browser-side helpers for the GitHub connection. Contains no secrets: every
// GitHub call happens in the server functions it invokes.
import { completeGithubConnect, fetchGithubBlobs, getGithubTree, startGithubConnect } from "@/lib/github.functions";

function waitForOAuthCompletion(popup: Window, expectedState: () => string | null) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "github" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        if (event.data?.state !== expectedState()) { reject(new Error("Sesi login GitHub tidak cocok. Coba lagi.")); return; }
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error(typeof event.data?.error === "string" && event.data.error ? `GitHub: ${event.data.error}` : "Gagal menghubungkan GitHub."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("Jendela GitHub ditutup sebelum selesai."));
    }, 500);
  });
}

/** Opens the GitHub consent popup (must run inside a click) and stores the connection. */
export async function connectGithub() {
  const popup = window.open("", "pastodev-github", "width=640,height=760");
  if (!popup) throw new Error("Popup diblokir browser. Izinkan popup lalu coba lagi.");
  let code: string | null;
  let state: string | null = null;
  try {
    const completion = waitForOAuthCompletion(popup, () => state);
    const started = await startGithubConnect();
    state = started.state;
    popup.location.href = started.authorizationUrl;
    code = await completion;
  } catch (error) {
    popup.close();
    throw error;
  }
  if (code) return completeGithubConnect({ data: { code } });
  return { ok: true, login: null };
}

/** Turns any thrown value (Error, database error object, string) into readable text. */
export function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    for (const k of ["message", "error_description", "error", "details", "hint"]) {
      if (typeof o[k] === "string" && o[k]) return o[k] as string;
    }
    try { return JSON.stringify(e).slice(0, 300); } catch { /* fall through */ }
  }
  return "Terjadi kesalahan yang tidak diketahui.";
}

export function githubErrorMessage(e: unknown) {
  const msg = errorText(e);
  if (msg.includes("GITHUB_NOT_CONNECTED")) return "Hubungkan akun GitHub kamu dulu di Pengaturan.";
  if (msg.includes("GITHUB_RECONNECT")) return "Akses GitHub perlu diperbarui. Klik Hubungkan ulang.";
  return msg;
}

/** Downloads every text file of a GitHub repo through the server, in small batches. */
export async function downloadGithubRepo(fullName: string, onProgress?: (done: number, total: number) => void) {
  const tree = await getGithubTree({ data: { fullName } });
  const contents = new Map<string, string>();
  const shas = [...new Set(tree.files.map((f) => f.sha))];
  let done = 0;
  for (let i = 0; i < shas.length; i += 20) {
    const batch = await fetchGithubBlobs({ data: { fullName, shas: shas.slice(i, i + 20) } });
    for (const b of batch) if (b.content !== null) contents.set(b.sha, b.content);
    done += Math.min(20, shas.length - i);
    onProgress?.(done, shas.length);
  }
  const files = tree.files.filter((f) => contents.has(f.sha)).map((f) => ({ path: f.path, content: contents.get(f.sha)! }));
  return { info: tree, files, skipped: tree.skipped + (tree.files.length - files.length) };
}
