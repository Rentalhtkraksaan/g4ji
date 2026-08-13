# Aplikasi Sistem Manajemen Gaji Pelatih & Pencairan Dana (Sat Set)

Sistem ini dikembangkan khusus untuk mengelola akun pelatih, kehadiran & absensi mengajar, perhitungan otomatis honor/gaji, pengajuan pencairan dana (tarik tunai), serta manajemen dashboard Admin dengan persetujuan cepat (*Sat Set*).

---

## 🔒 Fitur Keamanan Berlapis (Multi-Layer Security)

1. **Domain & Host Protection (`security-guard.js`)**:
   - Jika script/HTML disalin (kopi-paste) ke domain atau website lain, sistem secara otomatis memblokir akses (`403 Forbidden`) dan mengisolasi Firebase SDK agar data tidak bisa dibaca oleh pihak luar.
2. **Prevent Iframe Embedding**:
   - Mencegah aplikasi dibuka di dalam `<iframe>` website lain.
3. **Database Security Rules (`database-rules.json`)**:
   - Aturan Firebase Realtime Database berlapis untuk memvalidasi struktur data user & transaksi.
4. **Session Hash Protection**:
   - Token login terenkripsi lokal dan terikat durasi sesi.

---

## 🚀 Alur Penggunaan Aplikasi

### 1. Pendaftaran & Login (`auth.html`)
- **Buat Akun Pelatih**:
  - **Nama Lengkap**: Nama pelatih (contoh: `Adit`).
  - **Nomor HP**: Digunakan sebagai **Username/Akun** (contoh: `085176871609`).
  - **Tanggal Lahir (DDMMYY)**: Digunakan sebagai **Password/PIN** (contoh lahir 16 September 2005 -> `160905`).
- **Masuk Pelatih**: Gunakan Nomor HP & Tanggal Lahir (6 digit).
- **Masuk Admin**:
  - ID Admin: `admin`
  - Password Admin: `admin123`

### 2. Modul Pelatih (`pelatih.html`)
- **Edit Data Profil**: Pelatih dapat mengedit nama dan menyimpan default Bank, No Rekening, serta Nama Pemilik Rekening.
- **Rincian Kehadiran & Honor**: Menampilkan daftar hari, tanggal, bulan, agenda mengajar, status absensi, dan nominal honor per sesi.
- **Tarik Tunai / Pencairan Dana**:
  - Tombol **"Tarik Tunai Sekarang"** otomatis **MENYALA / AKTIF** jika terdapat honor mengajar yang belum dicairkan.
  - Menampilkan Form Pencairan dengan **3 input wajib**:
    1. **Nama Bank / E-Wallet** (BCA, BRI, Mandiri, DANA, OVO, dll).
    2. **Nomor Rekening / HP E-Wallet**.
    3. **Nama Pemilik Rekening**.
  - Mengajukan penarikan langsung ke antrean Admin.

### 3. Modul Admin (`pelatih-admin.html`)
- **Input Kehadiran Mengajar**: Admin mencatat pelatih yang datang mengajar beserta tanggal, hari, kegiatan, durasi, dan honor per sesi.
- **Persetujuan Pencairan ("Sat Set")**:
  - Menampilkan seluruh pengajuan penarikan dana lengkap dengan nama pelatih, bank tujuan, nomor rekening, nominal, dan waktu pengajuan.
  - Tombol kilat 1-Klik **"⚡ SETUJUI & CAIRKAN (SAT SET)"** untuk mengubah status transaksi secara realtime.

---

## 📁 Daftar File Sistem
- [auth.html](file:///d:/ALL%20VID/Users/LENOVO/Downloads/keuangan/pelatih%20cong/auth.html) — Halaman Login & Pendaftaran Akun Pelatih & Admin.
- [pelatih.html](file:///d:/ALL%20VID/Users/LENOVO/Downloads/keuangan/pelatih%20cong/pelatih.html) — Portal Pelatih (Kehadiran, Honor, & Form Tarik Tunai).
- [pelatih-admin.html](file:///d:/ALL%20VID/Users/LENOVO/Downloads/keuangan/pelatih%20cong/pelatih-admin.html) — Dashboard Admin (Kelola Gaji & Approval Sat Set).
- [security-guard.js](file:///d:/ALL%20VID/Users/LENOVO/Downloads/keuangan/pelatih%20cong/security-guard.js) — Security Engine Anti-Clone & Domain Guard.
- [app.js](file:///d:/ALL%20VID/Users/LENOVO/Downloads/keuangan/pelatih%20cong/app.js) — Logika Realtime Database & Auth.
- [style.css](file:///d:/ALL%20VID/Users/LENOVO/Downloads/keuangan/pelatih%20cong/style.css) — Styling Modern Glassmorphism UI.
- [database-rules.json](file:///d:/ALL%20VID/Users/LENOVO/Downloads/keuangan/pelatih%20cong/database-rules.json) — Aturan Firebase Realtime DB Security Rules.
