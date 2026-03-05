# TeleMiniDrama (Telegram Mini App + Admin Dashboard)

Mini App Telegram untuk nonton drama China dengan:
- Poster drama
- Video player
- Tombol episode di sisi kanan
- Pilih drama, cari episode, dan pagination saat episode banyak
- Sumber video hybrid: Telegram atau Google Drive API

## 1) Setup

```bash
npm install
copy .env.example .env
```

Isi `.env`:

```env
PORT=3000

TELEGRAM_BOT_TOKEN=<token_bot_anda>
TELEGRAM_CHANNEL_ID=-1001234567890
TELEGRAM_STREAM_LIMIT_MB=20
ALLOW_OVERSIZE_TELEGRAM_UPLOAD=false
STREAM_TOKEN_TTL_SECONDS=300
STREAM_TOKEN_MAX_USES=800
STREAM_TOKEN_REQUIRE_SAME_UA=true
STREAM_SESSION_TTL_SECONDS=86400
STREAM_SESSION_COOKIE_SECURE=false
STREAM_REQUIRE_FETCH_METADATA=true
ALLOW_LEGACY_GDRIVE_STREAM_ROUTE=false

ADMIN_TOKEN=<token_rahasia_admin>

DATA_STORAGE_DRIVER=firebase
FIREBASE_RTDB_ENABLED=true
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_SERVICE_ACCOUNT_JSON=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_LIBRARY_PATH=teleminidrama/library
FIREBASE_YOUTUBE_VERIFICATIONS_PATH=teleminidrama/youtube_verifications

GOOGLE_DRIVE_AUTH_MODE=service_account
GOOGLE_DRIVE_CLIENT_EMAIL=service-account@project-id.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_SUBJECT=
GOOGLE_DRIVE_OAUTH_CLIENT_ID=
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=
GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=
GOOGLE_DRIVE_OAUTH_REDIRECT_URI=http://localhost
GOOGLE_DRIVE_SCOPE=https://www.googleapis.com/auth/drive
GOOGLE_DRIVE_DEFAULT_FOLDER_ID=
GOOGLE_DRIVE_AUTO_DRAMA_SUBFOLDER=true
AUTO_SWITCH_TO_GDRIVE_ON_TELEGRAM_ERROR=true
AUTO_PERSIST_GDRIVE_SWITCH=true

YOUTUBE_SUBSCRIBE_GATE_ENABLED=false
YOUTUBE_SUBSCRIBE_MIN_EPISODE=10
YOUTUBE_REQUIRED_CHANNEL_ID=
YOUTUBE_REQUIRED_CHANNEL_URL=
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=
YOUTUBE_OAUTH_REDIRECT_URI=
YOUTUBE_OAUTH_SCOPE=https://www.googleapis.com/auth/youtube.readonly
YOUTUBE_OAUTH_STATE_TTL_SECONDS=900
```

Jalankan:

```bash
npm run dev
```

URL:
- Mini app player: `http://localhost:3000`
- Admin dashboard: `http://localhost:3000/admin`
- Validasi file_id Telegram: `npm run channel:validate`

### Opsi Wajib Subscribe YouTube

Jika ingin user wajib subscribe channel YouTube sebelum nonton:
1. Set `YOUTUBE_SUBSCRIBE_GATE_ENABLED=true`
2. Set `YOUTUBE_SUBSCRIBE_MIN_EPISODE=10` (atau angka lain sesuai episode mulai dikunci)
3. Isi `YOUTUBE_REQUIRED_CHANNEL_ID` (format channel ID YouTube)
4. Isi `YOUTUBE_OAUTH_CLIENT_ID` dan `YOUTUBE_OAUTH_CLIENT_SECRET`
5. Isi `YOUTUBE_OAUTH_REDIRECT_URI` lalu daftarkan URI callback itu di Google Cloud OAuth (Authorized redirect URIs)
6. Endpoint callback yang dipakai: `/api/youtube/oauth/callback`

### Setup Firebase Realtime Database (untuk ganti JSON lokal)

1. Buat project Firebase, aktifkan **Realtime Database**.
2. Buka **Project Settings -> Service accounts**, generate private key JSON.
3. Pilih salah satu cara credential:
   - Isi `FIREBASE_SERVICE_ACCOUNT_JSON` dengan isi JSON (string).
   - Atau isi `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
4. Isi `FIREBASE_DATABASE_URL`.
5. Pastikan `.env`:
   - `DATA_STORAGE_DRIVER=firebase`
   - `FIREBASE_RTDB_ENABLED=true`
6. Jalankan ulang server.

Catatan:
- Saat Firebase aktif, penyimpanan `library` dan `youtube_verifications` memakai Realtime Database.
- Jika path Firebase masih kosong, server akan mencoba import awal dari file JSON lokal.

## 2) Sumber video

### Telegram
- Bot API `getFile` biasanya terbatas sekitar 20MB.
- Jika file > batas, mini app tidak bisa stream dari Telegram Bot API.
- Jika episode punya `gdriveFileId`, server bisa auto fallback ke Google Drive.
- Gunakan:
  - `AUTO_SWITCH_TO_GDRIVE_ON_TELEGRAM_ERROR=true`
  - `AUTO_PERSIST_GDRIVE_SWITCH=true`

### Google Drive
- Cocok untuk file besar.
- Backend melakukan proxy stream dari Drive API (dengan `Range`) sehingga seek/play tetap normal.
- Untuk upload langsung dari dashboard, scope Drive harus punya hak tulis (`https://www.googleapis.com/auth/drive`).
- `service_account` wajib pakai folder Shared Drive (bukan My Drive).
- Jika ingin upload ke My Drive akun pribadi, gunakan `GOOGLE_DRIVE_AUTH_MODE=oauth_refresh`.

## 3) Setup Google Drive API

1. Buat project di Google Cloud.
2. Aktifkan Google Drive API.
3. Pilih salah satu mode auth:
   - `service_account` (disarankan untuk server):
     - Buat Service Account + JSON key.
     - Isi `GOOGLE_DRIVE_CLIENT_EMAIL` dan `GOOGLE_DRIVE_PRIVATE_KEY`.
     - Gunakan folder di Shared Drive, lalu beri role minimal **Content manager** ke service account.
     - Isi `GOOGLE_DRIVE_DEFAULT_FOLDER_ID` dengan folder Shared Drive tersebut.
   - `oauth_refresh` (untuk My Drive user pribadi):
     - Buat OAuth Client ID/Secret.
     - Dapatkan refresh token user dengan scope Drive.
     - Isi `GOOGLE_DRIVE_OAUTH_CLIENT_ID`, `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`.
4. (Opsional Workspace) isi `GOOGLE_DRIVE_SUBJECT` bila memakai domain-wide delegation.

### Generate refresh token (mode oauth_refresh)

1. Jalankan:
   - `npm run gdrive:refresh-token`
   - script akan menampilkan `redirect_uri` yang dipakai
2. Tambahkan `redirect_uri` tersebut ke Google Cloud Console:
   - APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> Authorized redirect URIs
   - contoh: `http://localhost`
3. Buka URL login Google yang keluar di terminal.
4. Setelah approve, ambil `code` dari URL redirect.
5. Jalankan lagi:
   - `npm run gdrive:refresh-token -- --code "PASTE_CODE" --redirect-uri "http://localhost"`
6. Salin `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` ke `.env`.

## 4) Pakai dashboard admin

1. Buka `/admin`
2. Isi `ADMIN_TOKEN`
3. Klik `Reload`
4. Upload poster (akan tersimpan di Telegram Channel, URL otomatis masuk ke metadata, dan auto-simpan ke drama terpilih)
5. Simpan metadata drama
   - metadata baru pertama kali disimpan selalu jadi `private`
   - pilih `Status Tayang`: `private` atau `published`
   - gunakan tombol `Preview Mini App` untuk cek tampilan drama private sebelum publish
   - gunakan tombol `Publish Sekarang` untuk langsung publish
6. Upload langsung file episode ke Google Drive dari dashboard:
   - pilih file video
   - default: episode yang sudah ada akan di-skip (tidak diupload ulang)
   - pada `folderId`, bisa isi ID murni atau URL folder Drive (otomatis diekstrak)
   - sistem akan otomatis membuat/memakai subfolder sesuai judul drama
   - klik `Upload ke Google Drive`
7. Hapus drama/episode jika perlu
   - default hapus episode juga mencoba menghapus file Google Drive terkait
   - jika ingin data di library saja yang dihapus: tambahkan `?deleteFromGdrive=false`
8. Kunci episode dari tabel episode
   - klik tombol `Lock` untuk mengunci episode
   - klik `Buka Lock` untuk membuka kunci lagi

Catatan urutan drama:
- urutan "terbaru" berdasarkan waktu pertama kali metadata dibuat (`createdAt`), bukan dari update poster/episode.

## 5) Format episode di `data/library.json`

Contoh Telegram:

```json
{
  "number": 1,
  "title": "Episode 1",
  "source": "telegram",
  "telegramFileId": "BAACAg..."
}
```

Contoh Google Drive:

```json
{
  "number": 2,
  "title": "Episode 2",
  "source": "gdrive",
  "gdriveFileId": "1AbCdEfGhIjKlMnOpQrStUvWxYz"
}
```

## 6) Endpoint penting

- `GET /api/library` (hanya menampilkan drama dengan status `published`)
- `GET /api/stream/:dramaId/:episodeNumber` (mengembalikan URL token sementara saja, tanpa metadata drama/source)
- `GET /api/play/:token` (secure stream proxy; token terikat ke cookie sesi + user-agent + TTL + max uses)
- `GET /api/gdrive/stream/:dramaId/:episodeNumber` (legacy, default nonaktif demi keamanan)
- `GET /api/posters/telegram/:fileId` (proxy poster dari Telegram)
- `GET /api/admin/library` (perlu `x-admin-token`)
- `POST /api/admin/dramas` (perlu `x-admin-token`)
- `DELETE /api/admin/dramas/:dramaId` (perlu `x-admin-token`, default juga hapus semua file episode `gdriveFileId`; bisa nonaktif dengan `?deleteFromGdrive=false`)
- `DELETE /api/admin/dramas/:dramaId/episodes/:episodeNumber` (perlu `x-admin-token`, default juga hapus file `gdriveFileId`; bisa nonaktif dengan `?deleteFromGdrive=false`)
- `POST /api/admin/dramas/:dramaId/episodes/:episodeNumber/source` (set source telegram/gdrive)
- `POST /api/admin/dramas/:dramaId/episodes/:episodeNumber/lock` (lock/unlock episode manual)
- `POST /api/admin/dramas/:dramaId/upload-episodes-gdrive` (upload file langsung ke gdrive + set episode)
- `POST /api/admin/upload-poster` (perlu `x-admin-token`)
- `GET /api/youtube/verification/config` (config gate subscribe YouTube)
- `GET /api/youtube/verification/status` (cek status verifikasi viewer)
- `POST /api/youtube/verification/start` (mulai OAuth Google untuk verifikasi subscribe)
- `GET /api/youtube/oauth/callback` (callback OAuth verifikasi subscribe)

## 7) Catatan keamanan

- Jangan commit `.env`.
- Rahasiakan `ADMIN_TOKEN`, `TELEGRAM_BOT_TOKEN`, dan private key Google.
