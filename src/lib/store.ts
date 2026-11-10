// Developer store pages: custom HTML runs in a sandboxed frame with the store data injected.
export type StoreData = {
  developer: { username: string; name: string; headline: string | null; bio: string | null; avatar: string | null; profileUrl: string };
  products: { id: string; title: string; summary: string; price: number; priceLabel: string; cover: string | null; url: string }[];
  services: { id: string; title: string; summary: string; priceFrom: number; priceLabel: string; deliveryDays: number; cover: string | null; url: string }[];
  links: { label: string; url: string }[];
};

/** Puts the store data in front of the developer's HTML as window.PASTODEV. */
export function buildStoreDoc(html: string, data: StoreData) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const inject = `<script>window.PASTODEV=${json};</script><base target="_top">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + inject);
  return inject + html;
}

export const STORE_IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation";

export const DEFAULT_STORE_TEMPLATE = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --bg:#0f1222; --card:#181c33; --text:#eef0ff; --muted:#9aa0c3; --accent:#f5b83d; }
  * { box-sizing:border-box }
  body { margin:0; font-family:system-ui,sans-serif; background:var(--bg); color:var(--text) }
  header { padding:48px 20px 24px; text-align:center }
  header img { width:96px; height:96px; border-radius:50%; object-fit:cover; border:3px solid var(--accent) }
  h1 { margin:12px 0 4px; font-size:28px } .muted { color:var(--muted) }
  .links a { color:var(--accent); margin:0 8px; text-decoration:none }
  section { max-width:1000px; margin:0 auto; padding:16px 20px }
  h2 { font-size:18px; border-bottom:1px solid #2a2f52; padding-bottom:8px }
  .grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)) }
  .card { background:var(--card); border-radius:14px; overflow:hidden; text-decoration:none; color:inherit; display:block; transition:transform .15s }
  .card:hover { transform:translateY(-3px) }
  .card img { width:100%; aspect-ratio:16/9; object-fit:cover; background:#232849 }
  .card div { padding:12px } .price { color:var(--accent); font-weight:700 }
</style>
</head>
<body>
  <header id="top"></header>
  <section><h2>Karya</h2><div class="grid" id="products"></div></section>
  <section><h2>Jasa</h2><div class="grid" id="services"></div></section>
<script>
  // Data toko kamu tersedia di window.PASTODEV (developer, products, services, links).
  const d = window.PASTODEV;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  document.getElementById("top").innerHTML =
    (d.developer.avatar ? '<img src="' + esc(d.developer.avatar) + '" alt="">' : "") +
    "<h1>" + esc(d.developer.name) + "</h1>" +
    '<p class="muted">' + esc(d.developer.headline || d.developer.bio || "") + "</p>" +
    '<p class="links">' + d.links.map((l) => '<a href="' + esc(l.url) + '">' + esc(l.label || l.url) + "</a>").join("") + "</p>";
  const card = (x, price) => '<a class="card" href="' + esc(x.url) + '">' + (x.cover ? '<img src="' + esc(x.cover) + '" alt="">' : '<img alt="">') +
    "<div><b>" + esc(x.title) + '</b><p class="muted">' + esc(x.summary) + '</p><span class="price">' + esc(price) + "</span></div></a>";
  document.getElementById("products").innerHTML = d.products.map((p) => card(p, p.priceLabel)).join("") || '<p class="muted">Belum ada karya.</p>';
  document.getElementById("services").innerHTML = d.services.map((s) => card(s, "Mulai " + s.priceLabel)).join("") || '<p class="muted">Belum ada jasa.</p>';
</script>
</body>
</html>
`;
