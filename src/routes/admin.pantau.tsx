import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah } from "@/lib/market";
import { PAYMENT_STATUS_LABEL, methodLabel } from "@/lib/midtrans-shared";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GobiLoader } from "@/components/gobi-loader";

export const Route = createFileRoute("/admin/pantau")({
  head: () => ({ meta: [{ title: "Pantau aktivitas — Admin Pastodev" }, { name: "description", content: "Pantau semua pesanan, chat, lowongan, lamaran, jasa, karya, pembayaran, dan tindakan admin." }, { name: "robots", content: "noindex" }] }),
  component: MonitorPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function useRows(key: string, run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  return useQuery({
    queryKey: ["admin-pantau", key],
    refetchInterval: 20_000,
    queryFn: async () => {
      const r = await run();
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as Row[];
    },
  });
}

function List({ rows, loading, error, q, render }: { rows: Row[] | undefined; loading: boolean; error: unknown; q: string; render: (r: Row) => React.ReactNode }) {
  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !needle || JSON.stringify(r).toLowerCase().includes(needle));
  return (
    <div>
      {error ? <p role="alert" className="mb-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{errMsg(error)}</p> : null}
      {loading && <GobiLoader compact />}
      <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
        {shown.map((r, i) => <li key={r["id"] ?? i} className="py-3 text-sm">{render(r)}</li>)}
        {!loading && shown.length === 0 && <li className="py-3 text-muted-foreground">Tidak ada data.</li>}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Menampilkan {shown.length} dari {(rows ?? []).length} data terbaru.</p>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground">{children}</span>;

function MonitorPage() {
  const [q, setQ] = useState("");
  const orders = useRows("orders", () => looseDb.from("orders").select("id,number,title,kind,status,amount,created_at,updated_at,buyer:profiles!orders_buyer_id_fkey(username),seller:profiles!orders_seller_id_fkey(username)").order("updated_at", { ascending: false }).limit(200));
  const orderChat = useRows("order-chat", () => looseDb.from("order_messages").select("id,body,is_system,created_at,order_id,sender:profiles!order_messages_sender_id_fkey(username),order:orders(number,title)").order("created_at", { ascending: false }).limit(200));
  const jobs = useRows("jobs", () => looseDb.from("jobs").select("id,title,status,category,budget_min,budget_max,applications_count,created_at,client:profiles!jobs_client_id_fkey(username)").order("created_at", { ascending: false }).limit(200));
  const apps = useRows("apps", () => looseDb.from("job_applications").select("id,status,bid_amount,est_days,created_at,job_id,developer:profiles!job_applications_developer_id_fkey(username),job:jobs(title)").order("created_at", { ascending: false }).limit(200));
  const jobChat = useRows("job-chat", () => looseDb.from("job_messages").select("id,body,created_at,sender:profiles!job_messages_sender_id_fkey(username),application:job_applications(job:jobs(title))").order("created_at", { ascending: false }).limit(200));
  const services = useRows("services", () => looseDb.from("services").select("id,title,price_from,is_active,created_at,owner:profiles!services_owner_id_fkey(username)").order("created_at", { ascending: false }).limit(200));
  const products = useRows("products", () => looseDb.from("products").select("id,title,price,is_published,download_count,created_at,owner:profiles!products_owner_id_fkey(username)").order("created_at", { ascending: false }).limit(200));
  const payments = useRows("payments", () => looseDb.from("payments").select("id,midtrans_order_id,method,status,mode,gross_amount,needs_refund,created_at,paid_at,order:orders(id,number,title)").order("created_at", { ascending: false }).limit(200));
  const payouts = useRows("payouts", () => looseDb.from("payouts").select("id,amount,status,bank_name,account_number,account_name,created_at,developer:profiles!payouts_developer_id_fkey(username)").order("created_at", { ascending: false }).limit(200));
  const audit = useRows("audit", () => looseDb.from("admin_audit_log").select("id,admin_label,action,target_type,target_id,note,created_at").order("created_at", { ascending: false }).limit(200));

  const L = (r: ReturnType<typeof useRows>, render: (row: Row) => React.ReactNode) => (
    <List rows={r.data} loading={r.isLoading} error={r.error} q={q} render={render} />
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Pantau semua aktivitas</h2>
        <p className="text-sm text-muted-foreground">Pesanan, chat, lowongan, lamaran, jasa, karya, pembayaran, pencairan, dan tindakan admin. Data diperbarui otomatis.</p>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Cari di tab ini" placeholder="Cari username, judul, isi chat…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="orders">Pesanan</TabsTrigger>
          <TabsTrigger value="order-chat">Chat pesanan</TabsTrigger>
          <TabsTrigger value="jobs">Lowongan</TabsTrigger>
          <TabsTrigger value="apps">Lamaran</TabsTrigger>
          <TabsTrigger value="job-chat">Chat lamaran</TabsTrigger>
          <TabsTrigger value="services">Jasa</TabsTrigger>
          <TabsTrigger value="products">Karya</TabsTrigger>
          <TabsTrigger value="payments">Pembayaran</TabsTrigger>
          <TabsTrigger value="payouts">Pencairan</TabsTrigger>
          <TabsTrigger value="audit">Log admin</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">{L(orders, (r) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><Link to="/pesanan/$id" params={{ id: r["id"] }} className="font-medium hover:underline">#{r["number"]} · {r["title"]}</Link> <Muted>· {r["kind"] === "service" ? "Jasa" : "Karya"} · @{r["buyer"]?.username} → @{r["seller"]?.username}</Muted></span>
            <Muted>{r["status"]} · {formatRupiah(r["amount"], "Rp0")} · {timeAgo(r["updated_at"])}</Muted>
          </div>
        ))}</TabsContent>

        <TabsContent value="order-chat">{L(orderChat, (r) => (
          <div>
            <p><Link to="/pesanan/$id" params={{ id: r["order_id"] }} className="font-medium hover:underline">#{r["order"]?.number} · {r["order"]?.title}</Link> <Muted>· {r["is_system"] ? "sistem" : `@${r["sender"]?.username}`} · {timeAgo(r["created_at"])}</Muted></p>
            <p className="mt-0.5 whitespace-pre-wrap break-words">{r["body"]}</p>
          </div>
        ))}</TabsContent>

        <TabsContent value="jobs">{L(jobs, (r) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><Link to="/lowongan/$id" params={{ id: r["id"] }} className="font-medium hover:underline">{r["title"]}</Link> <Muted>· @{r["client"]?.username} · {r["category"]}</Muted></span>
            <Muted>{r["status"]} · {formatRupiah(r["budget_min"], "Rp0")}–{formatRupiah(r["budget_max"], "Rp0")} · {r["applications_count"]} lamaran · {timeAgo(r["created_at"])}</Muted>
          </div>
        ))}</TabsContent>

        <TabsContent value="apps">{L(apps, (r) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><Link to="/lowongan/$id" params={{ id: r["job_id"] }} className="font-medium hover:underline">{r["job"]?.title}</Link> <Muted>· @{r["developer"]?.username}</Muted></span>
            <Muted>{r["status"]} · tawaran {formatRupiah(r["bid_amount"], "Rp0")} · {r["est_days"]} hari · {timeAgo(r["created_at"])}</Muted>
          </div>
        ))}</TabsContent>

        <TabsContent value="job-chat">{L(jobChat, (r) => (
          <div>
            <p className="font-medium">{r["application"]?.job?.title} <Muted>· @{r["sender"]?.username} · {timeAgo(r["created_at"])}</Muted></p>
            <p className="mt-0.5 whitespace-pre-wrap break-words">{r["body"]}</p>
          </div>
        ))}</TabsContent>

        <TabsContent value="services">{L(services, (r) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><Link to="/jasa/$id" params={{ id: r["id"] }} className="font-medium hover:underline">{r["title"]}</Link> <Muted>· @{r["owner"]?.username}</Muted></span>
            <Muted>{r["is_active"] ? "aktif" : "nonaktif"} · mulai {formatRupiah(r["price_from"], "Rp0")} · {timeAgo(r["created_at"])}</Muted>
          </div>
        ))}</TabsContent>

        <TabsContent value="products">{L(products, (r) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><Link to="/karya/$id" params={{ id: r["id"] }} className="font-medium hover:underline">{r["title"]}</Link> <Muted>· @{r["owner"]?.username}</Muted></span>
            <Muted>{r["is_published"] ? "terbit" : "draf"} · {formatRupiah(r["price"])} · {r["download_count"]} unduhan · {timeAgo(r["created_at"])}</Muted>
          </div>
        ))}</TabsContent>

        <TabsContent value="payments">{L(payments, (r) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{r["order"] ? <Link to="/pesanan/$id" params={{ id: r["order"].id }} className="font-medium hover:underline">#{r["order"].number} · {r["order"].title}</Link> : r["midtrans_order_id"]} <Muted>· {methodLabel(r["method"])} · {r["mode"]}</Muted></span>
            <Muted>{PAYMENT_STATUS_LABEL[r["status"]] ?? r["status"]}{r["needs_refund"] ? " · PERLU REFUND" : ""} · {formatRupiah(r["gross_amount"], "Rp0")} · {timeAgo(r["paid_at"] ?? r["created_at"])}</Muted>
          </div>
        ))}</TabsContent>

        <TabsContent value="payouts">{L(payouts, (r) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>@{r["developer"]?.username} <Muted>→ {r["bank_name"]} {r["account_number"]} a.n. {r["account_name"]}</Muted></span>
            <Muted>{r["status"]} · {formatRupiah(r["amount"], "Rp0")} · {timeAgo(r["created_at"])}</Muted>
          </div>
        ))}</TabsContent>

        <TabsContent value="audit">{L(audit, (r) => (
          <div>
            <p><b>{r["action"]}</b> <Muted>· {r["admin_label"] ?? "admin"} · {r["target_type"]} {r["target_id"]} · {timeAgo(r["created_at"])}</Muted></p>
            {r["note"] && <p className="text-muted-foreground">{r["note"]}</p>}
          </div>
        ))}</TabsContent>
      </Tabs>
    </div>
  );
}
