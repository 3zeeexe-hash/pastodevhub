import { describe, expect, it } from "vitest";
import { applyDelta, buildPack, encodeCommit, encodeTree, hashObject, parseCommit, parsePack, parseTree, readPktLines, pkt, utf8, concat, FLUSH } from "./core";

describe("git objects", () => {
  it("hashes a blob exactly like git", () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(hashObject("blob", utf8("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
  it("hashes the empty tree like git", () => {
    expect(hashObject("tree", encodeTree([]))).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });
  it("round-trips trees and sorts folders like git", () => {
    const blob = hashObject("blob", utf8("x"));
    const t = encodeTree([{ mode: "100644", name: "a.txt", sha: blob }, { mode: "40000", name: "a", sha: blob }, { mode: "100644", name: "a-b", sha: blob }]);
    expect(parseTree(t).map((e) => e.name)).toEqual(["a-b", "a.txt", "a"]);
  });
  it("round-trips commits", () => {
    const c = { tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904", parents: ["ce013625030ba8dba906f756967f9e9ca394464a"], author: "A <a@b> 1 +0000", committer: "A <a@b> 1 +0000", message: "Halo\n" };
    expect(parseCommit(encodeCommit(c))).toEqual(c);
  });
});

describe("packfiles", () => {
  it("builds a pack that parses back to the same objects", () => {
    const objs = [{ type: "blob" as const, data: utf8("satu\n") }, { type: "blob" as const, data: new Uint8Array(5000).fill(7) }];
    const parsed = parsePack(buildPack(objs));
    expect(parsed.map((o) => o.sha)).toEqual(objs.map((o) => hashObject(o.type, o.data)));
  });
  it("applies a copy+insert delta", () => {
    const base = utf8("hello world");
    // src 11, dst 11; copy off 0 len 6 ("hello "), insert "there"
    const delta = new Uint8Array([11, 11, 0x80 | 0x10, 6, 5, ...utf8("there")]);
    expect(new TextDecoder().decode(applyDelta(base, delta))).toBe("hello there");
  });
});

describe("pkt-line", () => {
  it("reads lines up to a flush", () => {
    const buf = concat([pkt("want abc\n"), pkt("done\n"), FLUSH, utf8("PACK")]);
    const r = readPktLines(buf);
    expect(r.lines).toEqual(["want abc", "done", null]);
    expect(new TextDecoder().decode(buf.subarray(r.offset))).toBe("PACK");
  });
});
