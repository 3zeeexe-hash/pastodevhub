import { describe, expect, it } from "vitest";
import { cleanPath, computeChanges, diffLines, listDir, type RepoFile } from "@/lib/repo";

const f = (path: string, content = ""): RepoFile => ({ id: path, repo_id: "r", path, content, updated_at: "2026-01-01" });

describe("repository rules", () => {
  it("lists folders before files at each level", () => {
    const entries = listDir([f("README.md"), f("src/main.ts"), f("src/lib/a.ts"), f(".gitignore")], "");
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual(["dir:src", "file:.gitignore", "file:README.md"]);
    expect(listDir([f("src/main.ts"), f("src/lib/a.ts")], "src").map((e) => e.name)).toEqual(["lib", "main.ts"]);
  });

  it("rejects file paths that escape the repository", () => {
    expect(cleanPath("../secret")).toBeNull();
    expect(cleanPath("a//b/./c")).toBeNull();
    expect(cleanPath("/src/app.ts/")).toBe("src/app.ts");
  });

  it("a pull request contains added, modified and deleted files", () => {
    const base = [{ path: "a.txt", content: "1" }, { path: "b.txt", content: "2" }];
    const head = [{ path: "a.txt", content: "1!" }, { path: "c.txt", content: "3" }];
    expect(computeChanges(base, head).map((c) => `${c.type}:${c.path}`)).toEqual(["modify:a.txt", "delete:b.txt", "add:c.txt"]);
  });

  it("diff marks only the changed line", () => {
    const d = diffLines("a\nb\nc\n", "a\nB\nc\n");
    expect(d.filter((l) => l.type !== "same").map((l) => `${l.type}:${l.text}`)).toEqual(["del:b", "add:B"]);
  });
});
