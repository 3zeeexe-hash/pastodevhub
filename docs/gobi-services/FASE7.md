# GOBI SERVICES — Laporan Fase 7 (dashboard penjual dan alur pengerjaan)

Branch perbaikan: `fix/gobi-services-fase7-pasang-panel` (dari `main` setelah PR #50). Status: **kode sudah dipasang, tetapi belum dijalankan, dikompilasi, atau diuji** (lingkungan yang dipakai menulis perubahan ini hanya punya akses API GitHub: tidak ada checkout repo, runtime Node, maupun database). Fase 7 baru boleh dianggap selesai setelah SQL 001–007 berjalan tanpa galat, `bun run test` dan `bun run build` lulus, dan uji manual di bawah lulus.

## Yang dibuat Fase 7 (PR #49 dan #50)

- `docs/sql/gobi-services/007_gobi_services_workflow.sql`: pesanan paket yang sudah dibayar menunggu penjual (`pending_seller_acceptance`); fungsi `service_accept_order`, `service_decline_order`, `service_submit_work`, `service_request_revision`, `service_approve_work`, `service_seller_orders`; trigger `_service_flow_guard` yang menolak `deliver_order`, `complete_order`, dan `request_revision` langsung untuk pesanan paket dari pengguna biasa.
- `src/lib/services-workflow.ts` dan `services-workflow.test.ts`: aturan murni (kelompok dashboard, tenggat, panel, validasi form).
- `src/components/service-seller-orders.tsx` dan tab "Pesanan masuk" di `src/routes/studio.jasa.index.tsx`.
- `src/components/service-workflow-panel.tsx`: terima/tolak, kirim hasil, setujui, minta revisi, riwayat.

## Kekurangan yang ditemukan setelah PR #49 dan #50 digabung

1. **Panel tidak dipasang.** `src/routes/pesanan.$id.tsx` tidak mengimpor `ServiceWorkflowPanel`. Tombol "Lihat dan putuskan" di dashboard mengarah ke halaman tanpa form terima/tolak.
2. **Bentrok dengan SQL 007 (kritis).** Halaman pesanan masih memanggil `deliver_order`, `complete_order`, dan `request_revision` langsung. Setelah SQL 007 diterapkan, trigger `_service_flow_guard` menolak panggilan itu untuk pesanan paket, sehingga penjual tidak bisa mengirim hasil dan pembeli tidak bisa menyetujui atau meminta revisi dari UI.
3. **Laporan fase ini belum ada** (file ini).
4. **Belum ada bukti tes lulus.**

## Perbaikan di branch ini

- `src/routes/pesanan.$id.tsx`:
  - memasang `ServiceWorkflowPanel` untuk pesanan jasa yang punya baris `service_orders` (ditentukan lewat kueri `["service-package", id]`);
  - menyembunyikan tombol alur lama (kirim hasil, tandai selesai, minta revisi) untuk pesanan paket, dan juga selama status paket belum diketahui, supaya tidak ada tombol yang pasti ditolak database;
  - pesanan jasa lama (tanpa paket), permintaan khusus, dan pembelian karya tetap memakai alur lama tanpa perubahan;
  - `refresh()` ikut menyegarkan `service-workflow`, `service-package`, dan `service-seller-orders`.
- `src/lib/services-order-page.ts` dan `services-order-page.test.ts` (baru): aturan murni penyaringan tombol dan penentuan kapan panel tampil, beserta tes.
- Tidak ada perubahan SQL. SQL 007 tidak diubah.

## Test

- **Ditulis:** `src/lib/services-order-page.test.ts` (tombol lama hilang untuk pesanan paket dan saat status paket belum diketahui; pesanan lama dan pembelian karya tidak terpengaruh; kegagalan pemeriksaan paket tidak menyembunyikan tombol lama; panel hanya untuk pesanan paket). Sebelumnya sudah ada `services-workflow.test.ts`.
- **Dijalankan: belum.** Jalankan `bun install && bun run test && bun run build`. Jangan menganggap Fase 7 lulus sebelum hasilnya ada.

## Uji manual (sandbox Midtrans, setelah SQL 001–007 diterapkan)

1. Bayar pesanan paket sampai lunas: `stage` menjadi `pending_seller_acceptance`, penjual dan pembeli masing-masing mendapat satu notifikasi, tenggat belum terisi.
2. Penjual membuka `/pesanan/<id>` lewat "Lihat dan putuskan": panel "Alur pengerjaan" tampil dengan Terima dan Tolak; tombol lama "Kirim hasil pekerjaan" **tidak** tampil.
3. Terima: `stage` `in_progress`, `accepted_at` dan `due_at` terisi, pembeli mendapat notifikasi. Di tab "Pesanan masuk" pesanan pindah ke "Dikerjakan".
4. Tolak (alasan minimal 10 karakter): pesanan `cancelled`, escrow `frozen`, `payments.needs_refund` benar, pembeli diberi tahu. Alasan kurang dari 10 karakter ditolak.
5. Kirim hasil (catatan, demo atau repositori atau lampiran): `stage` `submitted`, `orders.status` `delivered`, catatan lama terisi. Pembeli melihat panel "Setujui hasil" dan form revisi; tombol lama "Tandai selesai" dan "Minta revisi" **tidak** tampil.
6. Pembeli minta revisi: `stage` `revision_requested`, `revisions_used` + 1; penjual melihat form kirim hasil revisi. Setelah jatah habis, form revisi dikunci dan database menolak.
7. Pembeli setujui hasil: `stage` `completed`, `orders_completed` jasa + 1.
8. **Pesanan lama tetap jalan:** pesanan jasa lama tanpa paket dan pembelian karya masih memakai tombol lama tanpa galat.
9. **Penjaga:** panggil `deliver_order` langsung dari klien untuk pesanan paket (mis. lewat konsol): ditolak dengan pesan dari `_service_flow_guard`.
10. Akun lain (bukan pembeli/penjual/admin) membuka `/pesanan/<id>`: tidak melihat panel dan data pesanan.

## Catatan dan batasan

- Penolakan pesanan tidak mengembalikan dana otomatis. Dana dibekukan dan ditandai perlu refund; admin menjalankan refund di dashboard Midtrans lalu menandainya (perilaku Fase 6).
- Pembatalan oleh pembeli setelah dibayar, ulasan, dan dashboard pembeli belum ada; itu lingkup Fase 8.
- `orders.delivery_note` berisi gabungan catatan dan tautan hasil (tampilan lama); riwayat terstruktur ada di panel.
- Jika pemeriksaan "apakah ini pesanan paket" gagal (galat jaringan), halaman menampilkan tombol lama; database tetap menolaknya bila ternyata pesanan paket, dengan pesan yang jelas.

## Kesiapan Fase 8

**Belum siap.** Syaratnya: SQL 007 terpasang tanpa galat, tes dan build lulus, dan uji manual 1–10 lulus.
