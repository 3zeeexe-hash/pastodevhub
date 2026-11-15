import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT_EMAIL, LEGAL_SITE, P, UL, type LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Syarat Layanan — GoBi" },
      { name: "description", content: "Syarat Layanan GoBi: aturan memakai platform, tanggung jawab akun, transaksi dan escrow, konten, serta batas tanggung jawab." },
      { property: "og:title", content: "Syarat Layanan — GoBi" },
      { property: "og:description", content: "Aturan dan ketentuan memakai GoBi." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    id: "penerimaan",
    title: "Penerimaan syarat",
    body: (
      <P>Dengan membuat akun atau memakai GoBi di <a href={LEGAL_SITE} className="text-link hover:underline">pstodev.my.id</a>, kamu menyatakan telah membaca dan setuju pada Syarat Layanan ini dan <a href="/privacy" className="text-link hover:underline">Kebijakan Privasi</a>. Jika tidak setuju, mohon jangan memakai layanan.</P>
    ),
  },
  {
    id: "akun",
    title: "Akun",
    body: (
      <UL>
        <li>Kamu harus berusia minimal 18 tahun, atau memakai GoBi dengan persetujuan orang tua atau wali.</li>
        <li>Informasi yang kamu berikan harus benar dan terbaru. Satu orang sebaiknya tidak memiliki akun ganda untuk menipu atau menghindari sanksi.</li>
        <li>Kamu bertanggung jawab atas keamanan akun dan semua aktivitas di dalamnya. Segera laporkan bila akunmu diakses tanpa izin.</li>
        <li>Kamu dapat masuk dengan email, Google, atau GitHub. Akun yang terhubung ke penyedia tersebut tunduk juga pada ketentuan penyedia itu.</li>
      </UL>
    ),
  },
  {
    id: "layanan",
    title: "Layanan GoBi",
    body: (
      <>
        <P>GoBi menyediakan hosting repositori Git, impor dari GitHub, lowongan freelance, jasa, katalog karya digital, diskusi dan pesan, saldo, serta fitur bantuan AI. Fitur dapat berubah, ditambah, atau dihentikan sewaktu-waktu.</P>
        <P>GoBi adalah platform yang mempertemukan pengguna. Kami bukan pihak dalam kontrak kerja atau jual beli antar pengguna, kecuali untuk peran kami dalam mengelola escrow sebagaimana dijelaskan di bagian 6.</P>
      </>
    ),
  },
  {
    id: "konten",
    title: "Konten kamu",
    body: (
      <>
        <P>Kamu tetap memiliki hak atas kode, karya, dan konten lain yang kamu unggah. Dengan mengunggahnya, kamu memberi GoBi lisensi non-eksklusif, bebas royalti, dan terbatas untuk menyimpan, menampilkan, dan menjalankan konten itu semata-mata demi mengoperasikan layanan, sesuai pengaturan visibilitas yang kamu pilih (publik atau privat).</P>
        <P>Kamu menjamin bahwa kamu berhak mengunggah konten tersebut dan bahwa konten itu tidak melanggar hak pihak lain atau hukum yang berlaku. Lisensi sumber terbuka yang kamu pasang pada repositori publik berlaku antara kamu dan pengguna lain.</P>
      </>
    ),
  },
  {
    id: "aturan",
    title: "Aturan penggunaan",
    body: (
      <>
        <P>Kamu setuju untuk tidak:</P>
        <UL>
          <li>mengunggah malware, kode berbahaya, atau memakai GoBi untuk menyerang sistem pihak lain;</li>
          <li>menipu, menyamar sebagai orang lain, atau menyalahgunakan sistem verifikasi, escrow, dan saldo;</li>
          <li>mengunggah konten ilegal, melanggar hak cipta, mengandung pornografi, ujaran kebencian, kekerasan, atau pelecehan;</li>
          <li>melakukan spam, scraping berlebihan, atau mengganggu kinerja layanan;</li>
          <li>mencoba mengakses akun, data, atau bagian sistem tanpa izin;</li>
          <li>menawarkan atau meminta transaksi di luar GoBi untuk menghindari escrow pada pekerjaan yang dimulai lewat GoBi.</li>
        </UL>
      </>
    ),
  },
  {
    id: "transaksi",
    title: "Transaksi, escrow, dan saldo",
    body: (
      <>
        <UL>
          <li>Pembayaran untuk lowongan, jasa, atau karya diproses lewat penyedia pembayaran (Midtrans). Dana pada kontrak dapat ditahan sementara (escrow) sampai milestone disetujui.</li>
          <li>Ketika client menyetujui milestone, saldo diteruskan ke freelancer dan tampil di menu Saldo. Penarikan saldo mengikuti ketentuan minimum, biaya, dan waktu proses yang tertera di aplikasi.</li>
          <li>Bila terjadi sengketa atau pekerjaan dibatalkan, admin GoBi dapat meninjau bukti dari kedua pihak, meneruskan dana secara manual ke freelancer, atau mengembalikannya ke client. Keputusan admin atas dana yang berada dalam escrow bersifat final dalam lingkup layanan GoBi.</li>
          <li>Biaya layanan platform, bila ada, ditampilkan sebelum kamu mengonfirmasi transaksi.</li>
          <li>Kamu bertanggung jawab atas pajak yang timbul dari penghasilanmu.</li>
          <li>Kami dapat menahan atau membatalkan transaksi yang diduga penipuan, pencucian uang, atau melanggar hukum.</li>
        </UL>
      </>
    ),
  },
  {
    id: "ai",
    title: "Fitur AI",
    body: (
      <P>Fitur AI di GoBi dapat menghasilkan keluaran yang keliru atau tidak lengkap. Periksa kembali hasilnya sebelum dipakai, terutama untuk kode yang akan dijalankan di produksi. Kamu bertanggung jawab atas penggunaan hasil tersebut.</P>
    ),
  },
  {
    id: "hki",
    title: "Hak kekayaan intelektual GoBi",
    body: (
      <P>Nama, logo, desain, dan perangkat lunak GoBi adalah milik GoBi atau pemberi lisensinya. Kamu tidak boleh menyalin, memodifikasi, atau memakainya tanpa izin tertulis, kecuali diizinkan oleh hukum atau lisensi sumber terbuka yang berlaku untuk bagian tertentu.</P>
    ),
  },
  {
    id: "penangguhan",
    title: "Penangguhan dan penghentian",
    body: (
      <P>Kami dapat membatasi, menangguhkan, atau menghapus akun maupun konten yang melanggar syarat ini atau hukum, dengan atau tanpa pemberitahuan terlebih dahulu bila diperlukan untuk melindungi pengguna lain. Kamu bisa berhenti memakai GoBi dan menghapus akunmu kapan saja, selama tidak ada transaksi aktif atau saldo yang belum diselesaikan.</P>
    ),
  },
  {
    id: "tanggung-jawab",
    title: "Penafian dan batas tanggung jawab",
    body: (
      <>
        <P>GoBi disediakan "apa adanya". Kami berupaya menjaga layanan tetap berjalan, tetapi tidak menjamin layanan bebas gangguan atau bebas kesalahan.</P>
        <P>Sejauh diizinkan hukum, GoBi tidak bertanggung jawab atas kerugian tidak langsung, kehilangan data atau keuntungan, maupun perselisihan antar pengguna. Tanggung jawab kami atas klaim apa pun terbatas pada jumlah yang kamu bayarkan kepada GoBi dalam 12 bulan terakhir, atau Rp100.000 bila tidak ada pembayaran. Ketentuan ini tidak membatasi tanggung jawab yang tidak boleh dibatasi menurut hukum.</P>
      </>
    ),
  },
  {
    id: "hukum",
    title: "Hukum yang berlaku",
    body: (
      <P>Syarat ini tunduk pada hukum Republik Indonesia. Perselisihan diupayakan diselesaikan secara musyawarah terlebih dahulu; bila tidak tercapai, diselesaikan melalui pengadilan yang berwenang di Indonesia.</P>
    ),
  },
  {
    id: "perubahan",
    title: "Perubahan syarat",
    body: (
      <P>Kami dapat memperbarui syarat ini. Tanggal pembaruan terakhir tertera di bagian atas halaman. Dengan terus memakai GoBi setelah perubahan berlaku, kamu dianggap menyetujui syarat yang baru.</P>
    ),
  },
  {
    id: "kontak",
    title: "Kontak",
    body: (
      <P>Pertanyaan tentang syarat ini dapat dikirim ke <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-link hover:underline">{LEGAL_CONTACT_EMAIL}</a>.</P>
    ),
  },
];

function TermsPage() {
  return (
    <LegalPage
      title="Syarat Layanan"
      intro={<P>Aturan main di GoBi supaya komunitas tetap aman, adil, dan nyaman bagi developer, freelancer, dan client.</P>}
      sections={sections}
      other={{ href: "/privacy", label: "Kebijakan Privasi" }}
    />
  );
}
