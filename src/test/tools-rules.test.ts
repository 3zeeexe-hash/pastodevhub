import { describe, expect, it } from "vitest";
import { checkHostFile, hostedHeaders, makeSlug, SLUG_RE } from "@/lib/hosting";
import { buildStoreDoc } from "@/lib/store";
import { parseAiResult, toRepoChanges } from "@/lib/ai-repo";
import { errorText } from "@/lib/github-client";

describe("hosting", () => {
  it("makes slugs the database accepts", () => {
    for (const n of ["Laporan Akhir.pdf", "a.png", "!!!", "x".repeat(200)]) expect(SLUG_RE.test(makeSlug(n))).toBe(true);
  });
  it("limits images to 10 MB and files to 50 MB", () => {
    expect(checkHostFile("image", { name: "a.png", size: 11 * 1024 * 1024, type: "image/png" })).not.toBeNull();
    expect(checkHostFile("image", { name: "a.png", size: 9 * 1024 * 1024, type: "image/png" })).toBeNull();
    expect(checkHostFile("file", { name: "a.zip", size: 51 * 1024 * 1024, type: "application/zip" })).not.toBeNull();
    expect(checkHostFile("file", { name: "a.zip", size: 49 * 1024 * 1024, type: "application/zip" })).toBeNull();
  });
  it("serves hosted pages sandboxed so they cannot read the Pastodev login", () => {
    expect(hostedHeaders("html", "text/html", "index.html")["Content-Security-Policy"]).toMatch(/^sandbox /);
    expect(hostedHeaders("html", "text/html", "index.html")["Content-Security-Policy"]).not.toContain("allow-same-origin");
    expect(hostedHeaders("image", "image/svg+xml", "a.svg")["Content-Security-Policy"]).toMatch(/^sandbox /);
  });
  it("downloads shared files instead of opening them, except previewable ones", () => {
    expect(hostedHeaders("file", "application/zip", "a.zip")["Content-Disposition"]).toMatch(/^attachment/);
    expect(hostedHeaders("file", "application/pdf", "a.pdf")["Content-Disposition"]).toMatch(/^inline/);
  });
});

describe("store", () => {
  it("injects store data without letting product text close the script", () => {
    const doc = buildStoreDoc("<html><head></head><body></body></html>", {
      developer: { username: "u", name: "</script><b>x", headline: null, bio: null, avatar: null, profileUrl: "" }, products: [], services: [], links: [],
    });
    expect(doc).not.toContain("</script><b>");
    expect(doc.indexOf("window.PASTODEV")).toBeLessThan(doc.indexOf("<body>"));
  });
});

describe("AI repo editor", () => {
  it("reads JSON wrapped in code fences and drops unsafe paths", () => {
    const r = parseAiResult('```json\n{"reply":"ok","changes":[{"path":"a.txt","action":"write","content":"hi"},{"path":"../x","action":"write","content":"no"},{"path":"b.txt","action":"delete"}]}\n```');
    expect(r.reply).toBe("ok");
    expect(r.changes).toEqual([{ path: "a.txt", action: "write", content: "hi" }, { path: "b.txt", action: "delete" }]);
  });
  it("turns proposals into add/modify/delete and skips unchanged files", () => {
    const files = [{ path: "same.txt", content: "1" }, { path: "edit.txt", content: "old" }, { path: "gone.txt", content: "x" }];
    const c = toRepoChanges(files, [
      { path: "same.txt", action: "write", content: "1" },
      { path: "edit.txt", action: "write", content: "new" },
      { path: "new.txt", action: "write", content: "n" },
      { path: "gone.txt", action: "delete" },
      { path: "missing.txt", action: "delete" },
    ]);
    expect(c.map((x) => `${x.type}:${x.path}`)).toEqual(["modify:edit.txt", "add:new.txt", "delete:gone.txt"]);
  });
});

describe("error messages", () => {
  it("never shows [object Object] for database errors", () => {
    expect(errorText({ message: "new row violates row-level security policy", code: "42501" })).toBe("new row violates row-level security policy");
    expect(errorText({ foo: 1 })).not.toBe("[object Object]");
  });
});
