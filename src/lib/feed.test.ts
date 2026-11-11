import { describe, expect, it } from "vitest";
import { extractHashtags, extractMentions, tokenizeBody } from "@/lib/feed";

describe("hashtag dan mention", () => {
  it("mengambil hashtag unik dalam huruf kecil", () => {
    expect(extractHashtags("Belajar #React dan #react lalu #Next_js!")).toEqual(["react", "next_js"]);
  });
  it("tidak menganggap fragmen URL atau kata#tag sebagai hashtag", () => {
    expect(extractHashtags("lihat https://x.com/a#bagian dan abc#nope")).toEqual([]);
  });
  it("mengambil mention, bukan alamat email", () => {
    expect(extractMentions("halo @budi dan @Sari-dev, kirim ke tes@contoh.com")).toEqual(["budi", "sari-dev"]);
  });
});

describe("tokenizeBody", () => {
  it("memecah teks, hashtag, mention, dan link", () => {
    const t = tokenizeBody("Hai @budi cek https://pastodev.com/x. #seru");
    expect(t.map((x) => x.type)).toEqual(["text", "mention", "text", "url", "text", "hashtag"]);
    expect(t[3]).toMatchObject({ href: "https://pastodev.com/x" });
    expect(t[5]).toMatchObject({ tag: "seru" });
  });
  it("tidak membaca hashtag/mention di dalam kode", () => {
    const t = tokenizeBody("`#bukan @tag` dan ```js\nconst a = '#nope';\n```");
    expect(t.map((x) => x.type)).toEqual(["code", "text", "codeblock"]);
    expect(t[2]).toMatchObject({ lang: "js", value: "const a = '#nope';" });
  });
  it("mengembalikan teks biasa apa adanya", () => {
    expect(tokenizeBody("halo dunia")).toEqual([{ type: "text", value: "halo dunia" }]);
  });
});
