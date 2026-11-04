# PILKETOS — Sistem E-Voting OSIS

Dua aplikasi terpisah: `pemilihan/` untuk pemilih dan `admin/` untuk admin. Backend memakai Supabase.

## Isi proyek
- `pemilihan/index.html`, `app.js`, `style.css` — website pemilih.
- `admin/index.html`, `app.js`, `style.css` — dashboard admin.
- `supabase/schema.sql` — tabel, RLS, RPC voting dan rekap.
- `supabase/functions/provision-voters/` — Edge Function untuk input/impor pemilih.

## 1. Siapkan Supabase
1. Buat project baru di https://supabase.com.
2. Buka SQL Editor, jalankan seluruh isi `supabase/schema.sql`.
3. Buka Project Settings → API, salin **Project URL** dan **anon/public key**.
4. Isi keduanya pada `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian atas `pemilihan/app.js` dan `admin/app.js`.
5. Authentication → Providers → Email: aktifkan Email provider dan matikan **Confirm email**. Akun murid dan guru memakai email internal berbentuk `NIS@pemilih.smk.sch.id` atau `NIP@pemilih.smk.sch.id`; pemilih tetap login dengan NIS/NIP dan kata sandi. Domain ini harus sama dengan yang digunakan Edge Function.
6. Deploy dua Edge Function sesuai petunjuk bagian 2.

## 2. Deploy Edge Functions
Install Supabase CLI, login, lalu dari folder proyek jalankan:

```bash
supabase link --project-ref PROJECT_REF
supabase secrets set SUPABASE_URL=https://PROJECT_REF.supabase.co SUPABASE_SERVICE_ROLE_KEY=ISI_SERVICE_ROLE_KEY
supabase functions deploy provision-voters
```

`SUPABASE_SERVICE_ROLE_KEY` hanya disimpan sebagai secret Edge Function. Jangan masukkan ke file JavaScript browser, GitHub, atau screenshot.

## 3. Buat akun admin pertama
1. Supabase Dashboard → Authentication → Users → Add user.
2. Buat akun menggunakan email admin yang kamu tentukan dan kata sandi kuat.
3. Salin UUID user tersebut.
4. Jalankan SQL berikut di SQL Editor (ganti UUID):

```sql
insert into public.profiles (id, identifier, full_name, role, voter_type)
values (
  'UUID_USER_ADMIN',
  'ADMIN-001',
  'ADMIN PILKETOS',
  'admin',
  'guru'
)
on conflict (id) do update set role = 'admin', full_name = excluded.full_name;
```

Akun admin login melalui halaman `admin/` dengan email dan kata sandi. Jangan memakai akun pemilih untuk admin.

## 4. Isi data kandidat
Login ke dashboard admin → menu Pasangan Calon → tambah Paslon. Foto bisa memakai path relatif yang diunggah bersama website, misalnya `assets/paslon-1.jpeg`, atau URL gambar publik. Folder aset kandidat tersedia di `pemilihan/assets/` dan `admin/assets/`; path foto untuk halaman pemilih harus menunjuk ke aset yang benar, misalnya `assets/paslon-1.jpeg`.

## 5. Tambah pemilih
Dashboard admin → Data Pemilih → input manual atau impor CSV. Format header CSV:

```csv
identifier,full_name,gender,major,grade,status
123456,ANDI, L, TKJ, X, murid
1987654321,BUDI,,,,guru
```

Untuk siswa, `identifier` adalah NIS dan isi `gender`, `major`, `grade`. Untuk guru, `identifier` adalah NIP dan `status` harus `guru`. Username otomatis sama dengan NIS/NIP. Kata sandi awal otomatis NIS/NIP. Setelah login pertama, pemilih sebaiknya mengganti kata sandi awal melalui prosedur yang ditetapkan panitia.

Jurusan yang didukung: LP, TKR, TOI, TSM, TKJ, DPIB. Kelas: X, XI, XII. Nama otomatis disimpan kapital.

## 6. Atur pemilihan
Dashboard admin → Pengaturan: ubah status pemilihan menjadi **Dibuka** saat siap. Setelah selesai, ubah menjadi **Ditutup**. Secara default pemilihan tertutup.

## 7. Hosting GitHub Pages
Upload folder proyek ke repository GitHub. Aktifkan Pages dari branch utama. Buka:
- `https://USERNAME.github.io/REPO/pemilihan/`
- `https://USERNAME.github.io/REPO/admin/`

Jika memakai repository project Pages, pastikan path relatif tetap utuh.

## Catatan keamanan penting
- Voting dilakukan melalui RPC database yang memvalidasi sesi, status akun, status pemilihan, dan satu suara per akun.
- Tabel kotak suara hanya menyimpan kandidat; tabel tanda terima menyimpan identitas pemilih tanpa kandidat. Admin melihat status memilih dari daftar pemilih dan agregat hasil, bukan hubungan identitas-pilihan.
- Tidak ada sistem e-voting berbasis browser yang dapat menjamin anonimitas absolut jika perangkat admin/server atau akun admin utama dikuasai. Batasi akses admin dan gunakan autentikasi kuat.
- Jangan membuka akses database secara publik atau membagikan service-role key.
- Lakukan uji coba dengan akun dummy sebelum pemilihan resmi.


## Catatan audit sebelum pemilihan resmi
- Domain email internal pada halaman pemilih dan Edge Function harus identik (`@pemilih.smk.sch.id`).
- Edge Function `provision-voters` adalah satu-satunya fungsi yang tersedia pada repository ini. Tidak ada `provision-candidates`. Manajemen kandidat dilakukan langsung melalui kebijakan RLS admin.
- Akun admin yang baru dibuat di Authentication belum otomatis memiliki baris `profiles`; jalankan perintah INSERT pada langkah 3.
- CSV yang didukung saat ini adalah CSV sederhana tanpa koma di dalam nilai/field yang dikutip. Simpan nama dan kolom lain tanpa koma.
- Jangan gunakan kata sandi awal NIS/NIP untuk pemilihan resmi tanpa prosedur penggantian kata sandi yang aman.
