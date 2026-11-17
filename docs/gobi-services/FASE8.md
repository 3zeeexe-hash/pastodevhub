# GOBI SERVICES — Laporan Fase 8 (dashboard pembeli, pembatalan, ulasan)

Branch: `feat/gobi-services-fase8` (dari `main` setelah PR #51 yang memasang panel Fase 7). Status: **kode dan SQL selesai ditulis; belum dijalankan, dikompilasi, atau diuji** (lingkungan ini hanya punya akses API GitHub: tidak ada checkout repo, runtime Node, maupun database). Fase 8 menyentuh jalur uang (pembatalan membekukan escrow dan menandai refund), jadi **uji di sandbox dulu**.

Prasyarat: Fase 7 harus sudah lolos uji manualnya (`FASE7.md`), karena pembatalan dan ulasan bergantung pada `stage`, `_service_order_lock`, dan `_service_system_message` dari SQL 007.

1. **Fase:** Fase 8 — dashboard pembeli, pembatalan pesanan, ulasan.
2. **Fitur yang dibuat:**
   - **Tab "Jasa yang saya pesan"** di `/pesanan` (untuk semua akun): pesanan paket dikelompokkan *Perlu tindakan* (menunggu pembayaran, hasil menunggu diperiksa), *Berjalan*, *Bermasalah*, *Selesai*, *Ditutup*, dengan lencana jumlah tindakan, tenggat, sisa revisi, dan tombol sesuai tahap (Bayar, Periksa hasil, Beri ulasan). Tab "Saya beli" dan "Pesanan masuk" lama tidak berubah.
   - **Pembatalan** di `/pesanan/<id>` untuk pesanan paket:
     - pembeli sebelum penjual menerima → langsung dibatalkan, escrow dibekukan, pembayaran ditandai perlu refund (sama seperti penolakan penjual di Fase 7);
     - pembeli atau penjual saat `in_progress` / `revision_requested` → `cancel_requested`; pihak lawan menyetujui (dibatalkan + dibekukan + perlu refund) atau menolak dengan alasan (kembali ke status sebelumnya); peminta bisa menarik permintaannya;
     - semua langkah tercatat di riwayat status, chat pesanan (pesan sistem), dan notifikasi.
   - **Ulasan:** pembeli memberi 1–5 bintang dan komentar opsional, sekali per pesanan, hanya setelah `completed`; penjual boleh membalas sekali. Rating dan jumlah ulasan jasa (`services.rating_avg`, `rating_count`) dihitung ulang dari ulasan yang terlihat.
3. **File baru:**
   - `docs/sql/gobi-services/008_gobi_services_buyer.sql`
   - `src/lib/services-buyer.ts` dan `src/lib/services-buyer.test.ts`
   - `src/components/service-buyer-orders.tsx`, `service-cancel-panel.tsx`, `service-review-box.tsx`
   - `docs/gobi-services/FASE8.md`
4. **File diubah:** `src/routes/pesanan.index.tsx` (tab baru) dan `src/routes/pesanan.$id.tsx` (memasang panel pembatalan dan kotak ulasan untuk pesanan paket; `refresh()` menyegarkan kueri baru).
5. **Migrasi database:** `008_gobi_services_buyer.sql` (idempotent, setelah 001–007): fungsi internal `_service_cancel_now`, `_service_review_recalc`; fungsi baru di bawah. Tidak ada tabel atau kolom baru (`service_reviews`, `cancel_requested_by`, `cancel_reason` sudah ada sejak SQL 001).
6. **Endpoint (fungsi database):** `service_buyer_orders(_group, _limit, _offset)`, `service_cancel_order(_order_id, _reason)`, `service_respond_cancel(_order_id, _accept, _note)`, `service_withdraw_cancel(_order_id)`, `service_leave_review(_order_id, _rating, _comment)`, `service_reply_review(_order_id, _reply)`.
7. **Permission:** semua fungsi memakai `_service_guard()` (login, tidak diblokir) dan `_service_order_lock()` (peserta pesanan; bukan peserta = "Pesanan tidak ditemukan"). Pembatalan langsung hanya pembeli; permintaan dijawab hanya pihak lawan dan ditarik hanya peminta; ulasan hanya pembeli, balasan hanya penjual. Perubahan status hanya lewat `_service_move_stage`. Tidak ada jalur baru untuk mengubah pembayaran atau payout dari klien. Fungsi baca mengembalikan hanya pesanan milik pemanggil.
8. **Test yang dijalankan:** belum ada. Ditulis `src/lib/services-buyer.test.ts` (kelompok pembeli, tampilan pembatalan per peran dan stage, transisi yang dipakai sah di mesin status, validasi alasan, aturan ulasan dan balasan). Tes tambahan dari perbaikan Fase 7: `services-order-page.test.ts`.
9. **Hasil test:** belum ada. Jalankan `bun install && bun run test && bun run build`.
10. **Bug ditemukan:** belum ada dari pengujian (belum diuji). Catatan desain dari membaca kode:
    - `service_seller_orders` (SQL 007) menaruh `cancel_requested` di kelompok "Bermasalah", bukan "Perlu tindakan", jadi lencana tab penjual tidak menghitung permintaan pembatalan dari pembeli. Penjual tetap menerima notifikasi dan melihat panel di halaman pesanan.
    - Ulasan yang disembunyikan moderator (`is_visible = false`) tidak dihitung dalam rating; antarmuka moderasinya belum ada (Fase 11).
11. **Bug diperbaiki:** tidak ada.
12. **Konfigurasi yang masih dibutuhkan:** jalankan SQL 008 setelah 001–007. SQL ini memakai kolom/fungsi yang sama dengan 007 (`orders.service_id`, `payments.needs_refund`, `escrow_ledger.status = 'held'/'frozen'`, `_service_system_message`); bila salah satunya berbeda di database, skrip akan gagal saat dipanggil, bukan saat dijalankan — uji tiap fungsi di sandbox.
13. **Kesiapan Fase 9:** **belum siap** sampai SQL 001–008 berjalan tanpa galat, tes dan build lulus, dan uji manual di bawah lulus.

## Uji manual (sandbox Midtrans, setelah SQL 001–008)

1. **Tab pembeli:** akun client membuka `/pesanan` → tab "Jasa yang saya pesan" tampil. Pesanan belum dibayar masuk "Perlu tindakan" dengan tombol Bayar; lencana menghitungnya. Akun non-pembeli melihat daftar kosong.
2. **Batal sebelum diterima:** bayar pesanan sampai `pending_seller_acceptance`. Pembeli menekan "Batalkan pesanan" dengan alasan kurang dari 10 karakter → ditolak; dengan alasan sah → `stage` `cancelled`, `orders.status` `cancelled`, `payments.needs_refund` benar, escrow `frozen`, penjual diberi tahu. Penjual **tidak** melihat tombol batal (hanya Tolak).
3. **Ajukan saat dikerjakan:** penjual menerima pesanan. Pembeli mengajukan pembatalan → `stage` `cancel_requested`, `cancel_requested_by` terisi. Penjual melihat alasan, tombol Setujui dan Tolak; pembeli melihat "menunggu" dan Tarik permintaan. Penjual **tidak** bisa mengirim hasil selama `cancel_requested`.
4. **Setujui:** penjual menyetujui → `cancelled`, dana dibekukan, perlu refund, pembeli diberi tahu. Refund dikerjakan admin seperti Fase 7; setelah escrow ditandai refund, `stage` menjadi `refunded`.
5. **Tolak:** ulangi langkah 3, penjual menolak dengan alasan ≥ 10 karakter → `stage` kembali ke `in_progress` (atau `revision_requested` bila dari revisi), `cancel_requested_by` dan `cancel_reason` kosong.
6. **Tarik:** peminta menekan Tarik permintaan → kembali ke status sebelumnya; pihak lawan tidak bisa menjawab lagi (galat "Tidak ada permintaan pembatalan").
7. **Dari penjual:** penjual mengajukan pembatalan saat dikerjakan → pembeli bisa menyetujui atau menolak.
8. **Tidak bisa dibatalkan:** pesanan `submitted`, `completed`, atau `cancelled` tidak menampilkan panel pembatalan; memanggil `service_cancel_order` langsung ditolak dengan pesan status.
9. **Ulasan:** setelah `completed`, pembeli melihat form bintang. Tanpa bintang tombol kirim nonaktif; kirim 4 bintang + komentar → ulasan tampil, `services.rating_avg` dan `rating_count` ikut berubah, penjual diberi tahu. Ulasan kedua untuk pesanan yang sama ditolak. Penjual membalas sekali; balasan kedua ditolak.
10. **Peran lain:** penjual tidak bisa memberi ulasan; pihak lain yang membuka `/pesanan/<id>` tidak melihat panel apa pun dan RPC mengembalikan "Pesanan tidak ditemukan".
11. **Pesanan lama tetap jalan:** pembelian karya dan pesanan jasa lama (tanpa paket) tidak menampilkan panel pembatalan atau ulasan dan tetap memakai alur lamanya.
12. **Regresi Fase 7:** terima, tolak, kirim hasil, revisi, dan setujui hasil masih berjalan.

## Catatan dan batasan

- **Pembatalan = refund penuh manual.** Dana dibekukan dan ditandai perlu refund; admin mengembalikannya di dashboard Midtrans. Pembagian sebagian (pekerjaan sudah berjalan) belum ada; itu masuk sengketa (Fase 10).
- **Permintaan yang ditolak tidak punya jalur banding di aplikasi.** Kedua pihak diarahkan ke chat dan admin; sengketa resmi (`service_open_dispute`) menyusul di Fase 10.
- **Penyelesaian otomatis** (`auto_complete_days`) belum dikerjakan; pengaturannya ada tetapi tidak dipakai.
- **Ulasan tidak bisa diubah atau dihapus pembeli** setelah dikirim; moderasi (sembunyikan) dan laporan ulasan menyusul di Fase 10–11.
- Pesanan lama (tanpa baris `service_orders`) tidak muncul di tab "Jasa yang saya pesan"; pesanan itu tetap ada di "Saya beli".
