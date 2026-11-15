import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT_EMAIL, LEGAL_SITE, P, UL, type LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Kebijakan Privasi — GoBi" },
      { name: "description", content: "Kebijakan Privasi GoBi: data apa yang kami kumpulkan, bagaimana kami memakainya, termasuk data dari Masuk dengan Google, dan hak kamu atas data tersebut." },
      { property: "og:title", content: "Kebijakan Privasi — GoBi" },
      { property: "og:description", content: "Cara GoBi mengumpulkan, memakai, dan melindungi data pribadi kamu." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

const sections: LegalSection[] = [
  {
    id: "pengelola",
    title: "Siapa kami",
    body: (
      <>
        <P>GoBi ("kami") adalah platform komunitas developer yang dijalankan di <a href={LEGAL_SITE} className="text-link hover:underline">pstodev.my.id</a>. Di platform ini kamu bisa menyimpan repositori Git, mencari dan menawarkan pekerjaan freelance, menjual karya dan jasa, serta berdiskusi.</P>
        <P>Kebijakan ini menjelaskan data pribadi apa yang kami proses saat kamu memakai GoBi, untuk apa, dan apa saja pilihan yang kamu punya. Kami berusaha mengikuti Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.</P>
      </>
    ),
  },
  {
    id: "data-dikumpulkan",
    title: "Data yang kami kumpulkan",
    body: (
      <>
        <P>Data yang kami proses bergantung pada fitur yang kamu pakai:</P>
        <UL>
          <li><strong>Data akun:</strong> email, username, jenis akun atau peran (developer, freelancer, client, pribadi), kata sandi (disimpan dalam bentuk hash oleh penyedia autentikasi, bukan teks asli), dan foto profil.</li>
          <li><strong>Data profil:</strong> nama tampilan, bio, tautan, keahlian, portofolio, dan informasi lain yang kamu isi sendiri dan pilih untuk ditampilkan.</li>
          <li><strong>Konten yang kamu buat:</strong> repositori dan isinya, isu, pull request, komentar, diskusi, pesan, lowongan, lamaran, jasa, karya, dan ulasan.</li>
          <li><strong>Data transaksi:</strong> riwayat pesanan, kontrak dan milestone, saldo, permintaan penarikan, serta data rekening atau dompet digital tujuan penarikan yang kamu masukkan.</li>
          <li><strong>Data verifikasi:</strong> informasi atau dokumen yang kamu kirim bila mengajukan verifikasi akun.</li>
          <li><strong>Data teknis:</strong> alamat IP, jenis perangkat dan peramban, halaman yang dibuka, serta log kesalahan, untuk keamanan dan perbaikan layanan.</li>
        </UL>
      </>
    ),
  },
  {
    id: "data-google",
    title: "Data dari Masuk dengan Google",
    body: (
      <>
        <P>Jika kamu memilih Masuk dengan Google, kami hanya meminta akses dasar ke akun Google kamu: <strong>alamat email</strong>, <strong>nama</strong>, dan <strong>foto profil</strong>. Kami tidak meminta akses ke Gmail, Google Drive, Kalender, Kontak, atau data Google lain.</P>
        <P>Data tersebut dipakai untuk membuat dan mengenali akun GoBi kamu, menampilkan nama dan foto profil, serta mengirim pemberitahuan penting terkait akun. Kami tidak menjual data Google kamu, tidak memakainya untuk iklan, dan tidak membagikannya kepada pihak lain kecuali penyedia layanan yang diperlukan untuk menjalankan GoBi (lihat bagian 5) atau bila diwajibkan oleh hukum.</P>
        <P>Penggunaan dan pengalihan informasi yang kami terima dari Google API mematuhi <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-link hover:underline" rel="noopener noreferrer" target="_blank">Kebijakan Data Pengguna Layanan Google API</a>, termasuk persyaratan Penggunaan Terbatas (Limited Use).</P>
        <P>Kamu dapat mencabut akses GoBi kapan saja lewat <a href="https://myaccount.google.com/permissions" className="text-link hover:underline" rel="noopener noreferrer" target="_blank">myaccount.google.com/permissions</a>.</P>
      </>
    ),
  },
  {
    id: "penggunaan",
    title: "Cara kami memakai data",
    body: (
      <UL>
        <li>Membuat akun, mengautentikasi login, dan menjaga keamanan akun.</li>
        <li>Menyediakan fitur: hosting repositori, lowongan, jasa, katalog karya, diskusi, pesan, dan notifikasi.</li>
        <li>Memproses pembayaran, escrow, saldo, penarikan, dan pengembalian dana.</li>
        <li>Memverifikasi akun, mencegah penipuan dan penyalahgunaan, serta menegakkan Syarat Layanan.</li>
        <li>Memberi dukungan, menjawab pertanyaan, dan mengirim pemberitahuan layanan.</li>
        <li>Memahami penggunaan layanan secara agregat untuk memperbaiki GoBi.</li>
        <li>Memenuhi kewajiban hukum yang berlaku.</li>
      </UL>
    ),
  },
  {
    id: "berbagi",
    title: "Berbagi data dengan pihak lain",
    body: (
      <>
        <P>Kami tidak menjual data pribadi kamu. Data hanya dibagikan dalam keadaan berikut:</P>
        <UL>
          <li><strong>Pengguna lain:</strong> profil, repositori publik, lowongan, jasa, karya, dan diskusi yang kamu terbitkan terlihat oleh publik atau oleh pihak yang kamu pilih. Repositori privat hanya dapat dilihat oleh kamu dan kolaborator yang kamu undang.</li>
          <li><strong>Penyedia layanan (pemroses data):</strong> infrastruktur database, penyimpanan dan autentikasi (termasuk Supabase dan Firebase/Google untuk Masuk dengan Google), pemroses pembayaran (Midtrans), GitHub bila kamu memakai fitur impor atau masuk dengan GitHub, serta penyedia fitur AI bila kamu memakainya. Mereka hanya memproses data sesuai kebutuhan layanan.</li>
          <li><strong>Kewajiban hukum:</strong> bila diminta oleh aparat atau lembaga berwenang berdasarkan hukum yang berlaku, atau untuk melindungi hak, keselamatan, dan properti pengguna maupun GoBi.</li>
        </UL>
        <P>Data pembayaran seperti kartu atau dompet digital diproses langsung oleh Midtrans sesuai kebijakan privasi mereka.</P>
      </>
    ),
  },
  {
    id: "cookie",
    title: "Cookie dan penyimpanan lokal",
    body: (
      <P>Kami memakai penyimpanan peramban (localStorage, sessionStorage, dan cookie fungsional) untuk menjaga sesi login, mengingat peran yang kamu pilih, dan memastikan halaman termuat dengan benar. Kami tidak memakai cookie iklan pihak ketiga. Kamu dapat menghapus data ini lewat pengaturan peramban, tetapi sebagian fitur, seperti tetap masuk, bisa berhenti berfungsi.</P>
    ),
  },
  {
    id: "retensi",
    title: "Berapa lama data disimpan",
    body: (
      <P>Data akun dan konten disimpan selama akunmu aktif. Jika akun dihapus, data pribadi dan konten akan dihapus atau dianonimkan dalam waktu wajar, kecuali data yang harus kami simpan lebih lama untuk kewajiban hukum, pembukuan transaksi, penyelesaian sengketa, atau pencegahan penipuan.</P>
    ),
  },
  {
    id: "keamanan",
    title: "Keamanan",
    body: (
      <P>Kami memakai langkah teknis dan organisasi yang wajar: koneksi terenkripsi (HTTPS), kata sandi yang di-hash, pembatasan akses data berdasarkan peran, dan pemantauan kesalahan. Tidak ada sistem yang sepenuhnya aman, jadi jagalah kerahasiaan kata sandimu dan segera hubungi kami bila menduga ada akses tanpa izin.</P>
    ),
  },
  {
    id: "hak",
    title: "Hak kamu",
    body: (
      <>
        <P>Sesuai hukum yang berlaku, kamu berhak untuk:</P>
        <UL>
          <li>mengakses dan memperbarui data profil lewat halaman Pengaturan;</li>
          <li>meminta salinan, koreksi, atau penghapusan data pribadimu;</li>
          <li>menarik persetujuan atau menolak pemrosesan tertentu;</li>
          <li>menghapus akun dan mencabut akses Google atau GitHub yang terhubung.</li>
        </UL>
        <P>Kirim permintaan ke <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-link hover:underline">{LEGAL_CONTACT_EMAIL}</a>. Kami mungkin perlu memverifikasi identitasmu sebelum memprosesnya.</P>
      </>
    ),
  },
  {
    id: "anak",
    title: "Anak di bawah umur",
    body: (
      <P>GoBi tidak ditujukan untuk anak di bawah 18 tahun tanpa persetujuan orang tua atau wali. Jika kami mengetahui ada data anak yang dikumpulkan tanpa persetujuan yang sah, kami akan menghapusnya.</P>
    ),
  },
  {
    id: "perubahan",
    title: "Perubahan kebijakan",
    body: (
      <P>Kami dapat memperbarui kebijakan ini dari waktu ke waktu. Tanggal pembaruan terakhir tertera di bagian atas halaman. Untuk perubahan penting, kami akan memberi tahu lewat pengumuman di GoBi atau email.</P>
    ),
  },
  {
    id: "kontak",
    title: "Kontak",
    body: (
      <P>Untuk pertanyaan tentang privasi, hubungi kami di <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-link hover:underline">{LEGAL_CONTACT_EMAIL}</a> atau lewat situs <a href={LEGAL_SITE} className="text-link hover:underline">pstodev.my.id</a>.</P>
    ),
  },
];

function PrivacyPage() {
  return (
    <LegalPage
      title="Kebijakan Privasi"
      intro={<P>Privasimu penting bagi kami. Halaman ini menjelaskan data apa yang GoBi kumpulkan, mengapa, dan bagaimana kamu mengendalikannya, termasuk saat kamu masuk dengan Google.</P>}
      sections={sections}
      other={{ href: "/terms", label: "Syarat Layanan" }}
    />
  );
}
