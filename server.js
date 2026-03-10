import path from "path";
import { createReadStream } from "fs";
import { fileURLToPath } from "url";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { createHash, createSign, randomUUID } from "crypto";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { cert as firebaseCert, getApps as getFirebaseApps, initializeApp as initializeFirebaseApp } from "firebase-admin/app";
import { getDatabase as getFirebaseDatabase } from "firebase-admin/database";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "";
const parsedTelegramLimitMb = Number(process.env.TELEGRAM_STREAM_LIMIT_MB || 20);
const TELEGRAM_STREAM_LIMIT_MB =
  Number.isFinite(parsedTelegramLimitMb) && parsedTelegramLimitMb > 0 ? parsedTelegramLimitMb : 20;
const ALLOW_OVERSIZE_TELEGRAM_UPLOAD = parseBoolean(
  process.env.ALLOW_OVERSIZE_TELEGRAM_UPLOAD || "false",
  false
);
const AUTO_SWITCH_TO_GDRIVE_ON_TELEGRAM_ERROR = parseBoolean(
  process.env.AUTO_SWITCH_TO_GDRIVE_ON_TELEGRAM_ERROR || "true",
  true
);
const AUTO_PERSIST_GDRIVE_SWITCH = parseBoolean(
  process.env.AUTO_PERSIST_GDRIVE_SWITCH || "true",
  true
);
const TELEGRAM_API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : "";
const TELEGRAM_FILE_BASE = BOT_TOKEN ? `https://api.telegram.org/file/bot${BOT_TOKEN}` : "";
const GOOGLE_DRIVE_AUTH_MODE = String(process.env.GOOGLE_DRIVE_AUTH_MODE || "service_account")
  .trim()
  .toLowerCase();
const GOOGLE_DRIVE_CLIENT_EMAIL = String(process.env.GOOGLE_DRIVE_CLIENT_EMAIL || "").trim();
const GOOGLE_DRIVE_PRIVATE_KEY = String(process.env.GOOGLE_DRIVE_PRIVATE_KEY || "")
  .replace(/\\n/g, "\n")
  .trim();
const GOOGLE_DRIVE_OAUTH_CLIENT_ID = String(process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || "").trim();
const GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = String(process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || "").trim();
const GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN = String(
  process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN || ""
).trim();
const GOOGLE_DRIVE_SUBJECT = String(process.env.GOOGLE_DRIVE_SUBJECT || "").trim();
const GOOGLE_DRIVE_DEFAULT_FOLDER_ID = extractGoogleDriveId(
  String(process.env.GOOGLE_DRIVE_DEFAULT_FOLDER_ID || "").trim()
);
const GOOGLE_DRIVE_AUTO_DRAMA_SUBFOLDER = parseBoolean(
  process.env.GOOGLE_DRIVE_AUTO_DRAMA_SUBFOLDER || "true",
  true
);
const GOOGLE_DRIVE_SCOPE = String(
  process.env.GOOGLE_DRIVE_SCOPE || "https://www.googleapis.com/auth/drive"
).trim();
const YOUTUBE_SUBSCRIBE_GATE_ENABLED = parseBoolean(
  process.env.YOUTUBE_SUBSCRIBE_GATE_ENABLED || "false",
  false
);
const parsedYoutubeSubscribeMinEpisode = Number(process.env.YOUTUBE_SUBSCRIBE_MIN_EPISODE || 10);
const YOUTUBE_SUBSCRIBE_MIN_EPISODE =
  Number.isFinite(parsedYoutubeSubscribeMinEpisode) && parsedYoutubeSubscribeMinEpisode > 0
    ? Math.floor(parsedYoutubeSubscribeMinEpisode)
    : 10;
const YOUTUBE_REQUIRED_CHANNEL_ID = String(process.env.YOUTUBE_REQUIRED_CHANNEL_ID || "").trim();
const YOUTUBE_REQUIRED_CHANNEL_URL = String(process.env.YOUTUBE_REQUIRED_CHANNEL_URL || "").trim();
const YOUTUBE_OAUTH_CLIENT_ID = String(
  process.env.YOUTUBE_OAUTH_CLIENT_ID || GOOGLE_DRIVE_OAUTH_CLIENT_ID || ""
).trim();
const YOUTUBE_OAUTH_CLIENT_SECRET = String(
  process.env.YOUTUBE_OAUTH_CLIENT_SECRET || GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || ""
).trim();
const YOUTUBE_OAUTH_REDIRECT_URI = String(process.env.YOUTUBE_OAUTH_REDIRECT_URI || "").trim();
const YOUTUBE_OAUTH_SCOPE = String(
  process.env.YOUTUBE_OAUTH_SCOPE || "https://www.googleapis.com/auth/youtube.readonly"
).trim();
const parsedYoutubeOAuthStateTtlSec = Number(process.env.YOUTUBE_OAUTH_STATE_TTL_SECONDS || 900);
const YOUTUBE_OAUTH_STATE_TTL_SECONDS =
  Number.isFinite(parsedYoutubeOAuthStateTtlSec) && parsedYoutubeOAuthStateTtlSec > 0
    ? parsedYoutubeOAuthStateTtlSec
    : 900;
const GA4_MEASUREMENT_ID = String(process.env.GA4_MEASUREMENT_ID || "").trim();
const GA4_ANALYTICS_ENABLED = parseBoolean(
  process.env.GA4_ANALYTICS_ENABLED || (GA4_MEASUREMENT_ID ? "true" : "false"),
  Boolean(GA4_MEASUREMENT_ID)
);
const YOUTUBE_OAUTH_STATE_TTL_MS = YOUTUBE_OAUTH_STATE_TTL_SECONDS * 1000;
const YOUTUBE_VERIFY_API_BASE = "https://www.googleapis.com/youtube/v3/subscriptions";
const GOOGLE_DRIVE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILE_BASE = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files";
const DEFAULT_POSTER = "/assets/poster-placeholder.svg";
const INDONESIA_TIME_ZONE = "Asia/Jakarta";
const TELEGRAM_STREAM_LIMIT_BYTES = TELEGRAM_STREAM_LIMIT_MB * 1024 * 1024;
const parsedStreamTokenTtlSec = Number(process.env.STREAM_TOKEN_TTL_SECONDS || 300);
const STREAM_TOKEN_TTL_SECONDS =
  Number.isFinite(parsedStreamTokenTtlSec) && parsedStreamTokenTtlSec > 0 ? parsedStreamTokenTtlSec : 300;
const STREAM_TOKEN_TTL_MS = STREAM_TOKEN_TTL_SECONDS * 1000;
const parsedStreamTokenMaxUses = Number(process.env.STREAM_TOKEN_MAX_USES || 800);
const STREAM_TOKEN_MAX_USES =
  Number.isFinite(parsedStreamTokenMaxUses) && parsedStreamTokenMaxUses > 0 ? parsedStreamTokenMaxUses : 800;
const STREAM_TOKEN_REQUIRE_SAME_UA = parseBoolean(process.env.STREAM_TOKEN_REQUIRE_SAME_UA || "true", true);
const STREAM_SESSION_COOKIE_NAME = "stream_sid";
const parsedStreamSessionTtlSec = Number(process.env.STREAM_SESSION_TTL_SECONDS || 86400);
const STREAM_SESSION_TTL_SECONDS =
  Number.isFinite(parsedStreamSessionTtlSec) && parsedStreamSessionTtlSec > 0 ? parsedStreamSessionTtlSec : 86400;
const STREAM_SESSION_TTL_MS = STREAM_SESSION_TTL_SECONDS * 1000;
const STREAM_SESSION_COOKIE_SECURE = parseBoolean(process.env.STREAM_SESSION_COOKIE_SECURE || "false", false);
const STREAM_REQUIRE_FETCH_METADATA = parseBoolean(process.env.STREAM_REQUIRE_FETCH_METADATA || "true", true);
const ALLOW_LEGACY_GDRIVE_STREAM_ROUTE = parseBoolean(
  process.env.ALLOW_LEGACY_GDRIVE_STREAM_ROUTE || "false",
  false
);
const DATA_STORAGE_DRIVER = String(process.env.DATA_STORAGE_DRIVER || "file")
  .trim()
  .toLowerCase();
const FIREBASE_RTDB_ENABLED = parseBoolean(
  process.env.FIREBASE_RTDB_ENABLED || (DATA_STORAGE_DRIVER === "firebase" ? "true" : "false"),
  false
);
const FIREBASE_DATABASE_URL = String(process.env.FIREBASE_DATABASE_URL || "").trim();
const FIREBASE_SERVICE_ACCOUNT_JSON = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
const FIREBASE_PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || "").trim();
const FIREBASE_CLIENT_EMAIL = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
const FIREBASE_PRIVATE_KEY = String(process.env.FIREBASE_PRIVATE_KEY || "")
  .replace(/\\n/g, "\n")
  .trim();
const FIREBASE_LIBRARY_PATH = String(process.env.FIREBASE_LIBRARY_PATH || "teleminidrama/library")
  .trim()
  .replace(/^\/+|\/+$/g, "");
const FIREBASE_YOUTUBE_VERIFICATIONS_PATH = String(
  process.env.FIREBASE_YOUTUBE_VERIFICATIONS_PATH || "teleminidrama/youtube_verifications"
)
  .trim()
  .replace(/^\/+|\/+$/g, "");
const FIREBASE_ANALYTICS_PATH = String(process.env.FIREBASE_ANALYTICS_PATH || "teleminidrama/analytics")
  .trim()
  .replace(/^\/+|\/+$/g, "");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "data", "library.json");
const YOUTUBE_VERIFICATION_FILE = path.join(__dirname, "data", "youtube_verifications.json");
const ANALYTICS_FILE = path.join(__dirname, "data", "analytics.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const TMP_UPLOAD_DIR = resolveTemporaryUploadDir();

const filePathCache = new Map();
const naturalSort = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
const VIDEO_FILE_NAME_PATTERN = /\.(mp4|m4v|mov|mkv|avi|webm|wmv|mpeg|mpg)$/i;
const indonesiaDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: INDONESIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});
const gdriveTokenCache = {
  accessToken: "",
  expiresAt: 0,
  authMode: ""
};
const streamTokenStore = new Map();
const youtubeOauthStateStore = new Map();
const FIREBASE_APP_NAME = "teleminidrama-rtdb";
let firebaseRealtimeDb = null;

const upload = multer({
  dest: TMP_UPLOAD_DIR,
  limits: {
    files: 200,
    fileSize: 2 * 1024 * 1024 * 1024
  }
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

function resolveTemporaryUploadDir() {
  const envPath = String(process.env.TMP_UPLOAD_DIR || "").trim();
  if (envPath) {
    return envPath;
  }

  if (process.env.VERCEL) {
    return "/tmp/teleminidrama_uploads";
  }

  return path.join(__dirname, "tmp_uploads");
}

function shouldUseFirebaseRealtimeDb() {
  return FIREBASE_RTDB_ENABLED;
}

function resolveFirebaseServiceAccountCredential() {
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
      const projectId = String(parsed.project_id || parsed.projectId || "").trim();
      const clientEmail = String(parsed.client_email || parsed.clientEmail || "").trim();
      const privateKey = String(parsed.private_key || parsed.privateKey || "")
        .replace(/\\n/g, "\n")
        .trim();

      if (projectId && clientEmail && privateKey) {
        return {
          projectId,
          clientEmail,
          privateKey
        };
      }
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON tidak valid: ${error.message}`);
    }
  }

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY
    };
  }

  return null;
}

function assertFirebaseRealtimeDbConfig() {
  if (!shouldUseFirebaseRealtimeDb()) {
    throw new Error("FIREBASE_RTDB_ENABLED=false.");
  }

  if (!FIREBASE_DATABASE_URL) {
    throw new Error("FIREBASE_DATABASE_URL belum di-set.");
  }

  const credential = resolveFirebaseServiceAccountCredential();
  if (!credential) {
    throw new Error(
      "Credential Firebase belum lengkap. Isi FIREBASE_SERVICE_ACCOUNT_JSON atau FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY."
    );
  }

  if (!FIREBASE_LIBRARY_PATH) {
    throw new Error("FIREBASE_LIBRARY_PATH tidak boleh kosong.");
  }

  if (!FIREBASE_YOUTUBE_VERIFICATIONS_PATH) {
    throw new Error("FIREBASE_YOUTUBE_VERIFICATIONS_PATH tidak boleh kosong.");
  }

  if (!FIREBASE_ANALYTICS_PATH) {
    throw new Error("FIREBASE_ANALYTICS_PATH tidak boleh kosong.");
  }

  return credential;
}

async function getFirebaseRealtimeDbClient() {
  if (!shouldUseFirebaseRealtimeDb()) {
    return null;
  }

  if (firebaseRealtimeDb) {
    return firebaseRealtimeDb;
  }

  const credential = assertFirebaseRealtimeDbConfig();
  let appInstance = getFirebaseApps().find((item) => item.name === FIREBASE_APP_NAME);
  if (!appInstance) {
    appInstance = initializeFirebaseApp(
      {
        credential: firebaseCert(credential),
        databaseURL: FIREBASE_DATABASE_URL
      },
      FIREBASE_APP_NAME
    );
  }

  firebaseRealtimeDb = getFirebaseDatabase(appInstance);
  return firebaseRealtimeDb;
}

async function readJsonFromFirebasePath(pathValue, fallbackValue) {
  const db = await getFirebaseRealtimeDbClient();
  const snapshot = await db.ref(pathValue).get();
  if (!snapshot.exists()) {
    return fallbackValue;
  }

  const value = snapshot.val();
  return value === undefined || value === null ? fallbackValue : value;
}

async function writeJsonToFirebasePath(pathValue, value) {
  const db = await getFirebaseRealtimeDbClient();
  await db.ref(pathValue).set(value);
}

async function readLibraryFromLocalFile() {
  const raw = await readFile(DATA_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.dramas)) {
    throw new Error("Format data/library.json tidak valid: properti dramas harus array.");
  }

  return parsed;
}

async function ensureDirectories() {
  const jobs = [mkdir(TMP_UPLOAD_DIR, { recursive: true })];
  if (!shouldUseFirebaseRealtimeDb()) {
    jobs.push(mkdir(path.dirname(DATA_FILE), { recursive: true }));
  }

  await Promise.all(jobs);

  if (shouldUseFirebaseRealtimeDb()) {
    await getFirebaseRealtimeDbClient();
  }
}

async function readLibrary() {
  let parsed = null;
  if (shouldUseFirebaseRealtimeDb()) {
    parsed = await readJsonFromFirebasePath(FIREBASE_LIBRARY_PATH, null);
    if (!parsed || !Array.isArray(parsed.dramas)) {
      try {
        const fallback = await readLibraryFromLocalFile();
        await writeJsonToFirebasePath(FIREBASE_LIBRARY_PATH, fallback);
        parsed = fallback;
      } catch {
        parsed = { dramas: [] };
      }
    }
  } else {
    parsed = await readLibraryFromLocalFile();
  }

  if (!Array.isArray(parsed.dramas)) {
    throw new Error("Format library tidak valid: properti dramas harus array.");
  }

  normalizeLibraryDramas(parsed);
  sortDramasInPlace(parsed);
  return parsed;
}

async function writeLibrary(library) {
  normalizeLibraryDramas(library);
  sortDramasInPlace(library);
  if (shouldUseFirebaseRealtimeDb()) {
    await writeJsonToFirebasePath(FIREBASE_LIBRARY_PATH, library);
    return;
  }

  const next = `${JSON.stringify(library, null, 2)}\n`;
  await writeFile(DATA_FILE, next, "utf-8");
}

function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePublishStatus(value, fallback = "private") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "published") {
    return "published";
  }

  if (normalized === "preview" || normalized === "private") {
    // Legacy "preview" dianggap draft privat.
    return "private";
  }

  return fallback;
}

function formatIndonesiaDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return `${indonesiaDateTimeFormatter.format(date)} WIB`;
}

function getDramaCreatedTimestampMs(drama) {
  return parseTimestampMs(drama?.createdAt);
}

function compareDramaByNewest(a, b) {
  const diff = getDramaCreatedTimestampMs(b) - getDramaCreatedTimestampMs(a);
  if (diff !== 0) {
    return diff;
  }

  const byTitle = naturalSort.compare(String(a?.title || ""), String(b?.title || ""));
  if (byTitle !== 0) {
    return byTitle;
  }

  return naturalSort.compare(String(a?.id || ""), String(b?.id || ""));
}

function sortDramasInPlace(library) {
  if (!Array.isArray(library.dramas)) {
    library.dramas = [];
    return;
  }

  library.dramas.sort(compareDramaByNewest);
}

function touchDramaTimestamps(drama, { isCreate = false } = {}) {
  if (!drama || typeof drama !== "object") {
    return;
  }

  const nowIso = new Date().toISOString();
  const hasCreatedAt = parseTimestampMs(drama.createdAt) > 0;
  if (isCreate || !hasCreatedAt) {
    drama.createdAt = nowIso;
  }

  if (!String(drama.createdAtWib || "").trim()) {
    drama.createdAtWib = formatIndonesiaDateTime(drama.createdAt);
  }

  drama.updatedAt = nowIso;
  drama.updatedAtWib = formatIndonesiaDateTime(nowIso);
}

function normalizeDramaMetadata(drama) {
  if (!drama || typeof drama !== "object") {
    return;
  }

  if (!Array.isArray(drama.episodes)) {
    drama.episodes = [];
  }

  for (const episode of drama.episodes) {
    normalizeEpisodeLockState(episode);
  }

  if (!parseTimestampMs(drama.createdAt)) {
    let latestEpisodeUpdatedAtMs = 0;
    for (const episode of drama.episodes) {
      const episodeUpdatedAtMs = parseTimestampMs(episode?.updatedAt);
      if (episodeUpdatedAtMs > latestEpisodeUpdatedAtMs) {
        latestEpisodeUpdatedAtMs = episodeUpdatedAtMs;
      }
    }

    const fallbackMs = parseTimestampMs(drama.updatedAt) || latestEpisodeUpdatedAtMs;
    drama.createdAt = fallbackMs ? new Date(fallbackMs).toISOString() : new Date().toISOString();
  }

  if (!parseTimestampMs(drama.updatedAt)) {
    let latestEpisodeUpdatedAtMs = 0;
    for (const episode of drama.episodes) {
      const episodeUpdatedAtMs = parseTimestampMs(episode?.updatedAt);
      if (episodeUpdatedAtMs > latestEpisodeUpdatedAtMs) {
        latestEpisodeUpdatedAtMs = episodeUpdatedAtMs;
      }
    }

    const fallbackMs = parseTimestampMs(drama.createdAt) || latestEpisodeUpdatedAtMs;
    drama.updatedAt = fallbackMs ? new Date(fallbackMs).toISOString() : drama.createdAt;
  }

  if (!String(drama.createdAtWib || "").trim()) {
    drama.createdAtWib = formatIndonesiaDateTime(drama.createdAt);
  }

  if (!String(drama.updatedAtWib || "").trim()) {
    drama.updatedAtWib = formatIndonesiaDateTime(drama.updatedAt);
  }

  drama.publishStatus = normalizePublishStatus(drama.publishStatus, "private");
  if (drama.publishStatus === "published") {
    const publishedAtMs = parseTimestampMs(drama.publishedAt);
    if (!publishedAtMs) {
      drama.publishedAt = drama.createdAt;
    }

    if (!String(drama.publishedAtWib || "").trim()) {
      drama.publishedAtWib = formatIndonesiaDateTime(drama.publishedAt);
    }
  }
}

function normalizeLibraryDramas(library) {
  if (!Array.isArray(library.dramas)) {
    library.dramas = [];
    return;
  }

  for (const drama of library.dramas) {
    normalizeDramaMetadata(drama);
  }
}

function sanitizeLibrary(library) {
  sortDramasInPlace(library);
  return {
    dramas: library.dramas.map((drama) => ({
      id: drama.id,
      title: drama.title,
      year: drama.year,
      country: drama.country,
      synopsis: drama.synopsis,
      poster: drama.poster,
      publishStatus: normalizePublishStatus(drama.publishStatus, "private"),
      publishedAt: drama.publishedAt || null,
      publishedAtWib: drama.publishedAtWib || "",
      createdAt: drama.createdAt,
      createdAtWib: drama.createdAtWib,
      updatedAt: drama.updatedAt,
      updatedAtWib: drama.updatedAtWib,
      episodes: getSortedEpisodes(drama).map((episode) => ({
        number: episode.number,
        title: episode.title,
        source: normalizeEpisodeSource(episode),
        hasVideo: hasEpisodeVideo(episode),
        locked: isEpisodeManuallyLocked(episode),
        lockReason: getEpisodeManualLockReason(episode)
      }))
    }))
  };
}

function findDrama(library, dramaId) {
  return library.dramas.find((drama) => drama.id === dramaId);
}

function findEpisode(drama, episodeNumber) {
  return (drama.episodes || []).find((episode) => Number(episode.number) === Number(episodeNumber));
}

function sortEpisodesInPlace(drama) {
  if (!Array.isArray(drama.episodes)) {
    drama.episodes = [];
    return;
  }

  drama.episodes.sort((a, b) => Number(a.number) - Number(b.number));
}

function getSortedEpisodes(drama) {
  return [...(drama.episodes || [])].sort((a, b) => Number(a.number) - Number(b.number));
}

function getNextEpisodeNumber(drama) {
  const numbers = (drama.episodes || [])
    .map((episode) => Number(episode.number))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!numbers.length) {
    return 1;
  }

  return Math.max(...numbers) + 1;
}

function normalizeEpisodeSource(episode) {
  const explicitSource = String(episode?.source || "").trim().toLowerCase();
  if (explicitSource === "telegram" || explicitSource === "gdrive") {
    return explicitSource;
  }

  if (String(episode?.gdriveFileId || "").trim()) {
    return "gdrive";
  }

  return "telegram";
}

function isEpisodeManuallyLocked(episode) {
  return parseBoolean(episode?.locked, false);
}

function getEpisodeManualLockReason(episode) {
  return String(episode?.lockReason || "").trim();
}

function normalizeEpisodeLockState(episode) {
  if (!episode || typeof episode !== "object") {
    return;
  }

  const locked = isEpisodeManuallyLocked(episode);
  if (locked) {
    episode.locked = true;
    episode.lockReason = getEpisodeManualLockReason(episode);
    return;
  }

  delete episode.locked;
  delete episode.lockReason;
}

function hasEpisodeVideo(episode) {
  const source = normalizeEpisodeSource(episode);
  if (source === "gdrive") {
    return Boolean(extractGoogleDriveId(episode?.gdriveFileId));
  }

  return Boolean(String(episode?.telegramFileId || "").trim());
}

function hasValidGdriveFileId(episode) {
  return Boolean(extractGoogleDriveId(episode?.gdriveFileId));
}

function extractGoogleDriveId(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^["'<>]+|["'<>]+$/g, "");

  if (!raw) {
    return "";
  }

  if (!raw.includes("://")) {
    const plain = raw.split(/[?#]/)[0].trim();
    const match = plain.match(/[A-Za-z0-9_-]{10,}/);
    return match ? match[0] : plain;
  }

  try {
    const parsed = new URL(raw);
    const fromQuery = String(parsed.searchParams.get("id") || "").trim();
    if (fromQuery) {
      return extractGoogleDriveId(fromQuery);
    }

    const pathMatches = [
      parsed.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/i),
      parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/i),
      parsed.pathname.match(/\/document\/d\/([A-Za-z0-9_-]+)/i),
      parsed.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/i),
      parsed.pathname.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/i),
      parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/i)
    ].filter(Boolean);

    if (pathMatches.length) {
      return pathMatches[0][1];
    }

    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() || "";
    if (/^[A-Za-z0-9_-]{10,}$/.test(lastSegment)) {
      return lastSegment;
    }
  } catch {
    return raw;
  }

  return raw;
}

function bytesToMb(value) {
  const mb = Number(value || 0) / (1024 * 1024);
  return Math.round(mb * 100) / 100;
}

function isTelegramFileTooBigError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("file is too big");
}

function buildTelegramMessageUrl(channelId, messageId) {
  const safeMessageId = Number(messageId);
  if (!Number.isInteger(safeMessageId) || safeMessageId <= 0) {
    return null;
  }

  const raw = String(channelId || "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("@")) {
    return `https://t.me/${raw.slice(1)}/${safeMessageId}`;
  }

  if (raw.startsWith("-100")) {
    return `https://t.me/c/${raw.slice(4)}/${safeMessageId}`;
  }

  return null;
}

function buildGdriveErrorHelp(detail) {
  const text = String(detail || "").toLowerCase();
  if (text.includes("service accounts do not have storage quota")) {
    return "Service Account wajib upload ke Shared Drive. Alternatif: set GOOGLE_DRIVE_AUTH_MODE=oauth_refresh untuk upload ke My Drive user.";
  }

  if (text.includes("insufficient permissions")) {
    return "Service Account belum punya akses edit ke folder/file Google Drive.";
  }

  if (text.includes("file not found") || text.includes("not found")) {
    return "File/Folder ID Google Drive tidak ditemukan atau belum dishare ke Service Account.";
  }

  if (text.includes("invalid_grant") || text.includes("invalid jwt")) {
    return "Kredensial Google Drive tidak valid. Cek private key Service Account atau refresh token OAuth.";
  }

  if (text.includes("invalid_client") || text.includes("unauthorized_client")) {
    return "GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET tidak valid.";
  }

  if (text.includes("insufficient authentication scopes")) {
    return "GOOGLE_DRIVE_SCOPE harus https://www.googleapis.com/auth/drive untuk upload.";
  }

  return "";
}

function buildUserAgentFingerprint(userAgent) {
  return createHash("sha256").update(String(userAgent || "").trim()).digest("hex");
}

function parseCookies(cookieHeader) {
  const result = {};
  const raw = String(cookieHeader || "").trim();
  if (!raw) {
    return result;
  }

  const parts = raw.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      continue;
    }

    const valueRaw = rest.join("=");
    const value = String(valueRaw || "").trim();
    try {
      result[normalizedKey] = decodeURIComponent(value);
    } catch {
      result[normalizedKey] = value;
    }
  }

  return result;
}

function readStreamSessionId(req) {
  const cookies = parseCookies(req.headers.cookie);
  return String(cookies[STREAM_SESSION_COOKIE_NAME] || "").trim();
}

function getOrCreateStreamSessionId(req, res) {
  const existing = readStreamSessionId(req);
  const sessionId = existing || randomUUID().replace(/-/g, "");

  res.cookie(STREAM_SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: STREAM_SESSION_COOKIE_SECURE,
    path: "/api/play",
    maxAge: STREAM_SESSION_TTL_MS
  });

  return sessionId;
}

function isLikelyMediaRequest(req) {
  const fetchDest = String(req.headers["sec-fetch-dest"] || "")
    .trim()
    .toLowerCase();
  const fetchSite = String(req.headers["sec-fetch-site"] || "")
    .trim()
    .toLowerCase();

  // Jika header fetch metadata tidak tersedia (mis. WebView), tetap izinkan.
  if (STREAM_REQUIRE_FETCH_METADATA && !fetchDest) {
    return true;
  }

  if (fetchDest && !["video", "audio", "empty"].includes(fetchDest)) {
    return false;
  }

  if (fetchSite === "cross-site") {
    return false;
  }

  return true;
}

function isLikelyApiFetchRequest(req) {
  const fetchDest = String(req.headers["sec-fetch-dest"] || "")
    .trim()
    .toLowerCase();
  const fetchMode = String(req.headers["sec-fetch-mode"] || "")
    .trim()
    .toLowerCase();
  const fetchSite = String(req.headers["sec-fetch-site"] || "")
    .trim()
    .toLowerCase();

  // Jika header fetch metadata tidak tersedia (mis. WebView), tetap izinkan.
  if (STREAM_REQUIRE_FETCH_METADATA && !fetchDest) {
    return true;
  }

  if (fetchDest && fetchDest !== "empty") {
    return false;
  }

  if (STREAM_REQUIRE_FETCH_METADATA && fetchMode && !["cors", "same-origin"].includes(fetchMode)) {
    return false;
  }

  if (fetchMode && fetchMode === "navigate") {
    return false;
  }

  if (fetchSite === "cross-site") {
    return false;
  }

  return true;
}

function cleanupExpiredStreamTokens() {
  const now = Date.now();
  for (const [token, payload] of streamTokenStore.entries()) {
    if (!payload || Number(payload.expiresAt) <= now) {
      streamTokenStore.delete(token);
    }
  }
}

function createStreamToken(payload) {
  cleanupExpiredStreamTokens();
  const token = randomUUID().replace(/-/g, "");
  streamTokenStore.set(token, {
    ...payload,
    usesLeft: STREAM_TOKEN_MAX_USES,
    expiresAt: Date.now() + STREAM_TOKEN_TTL_MS
  });
  return token;
}

function getActiveStreamToken(token, { consume = false } = {}) {
  cleanupExpiredStreamTokens();
  const payload = streamTokenStore.get(token);
  if (!payload) {
    return null;
  }

  if (Number(payload.expiresAt) <= Date.now()) {
    streamTokenStore.delete(token);
    return null;
  }

  if (consume) {
    const usesLeft = Number(payload.usesLeft);
    if (Number.isFinite(usesLeft) && usesLeft <= 0) {
      streamTokenStore.delete(token);
      return null;
    }

    if (Number.isFinite(usesLeft)) {
      payload.usesLeft = Math.max(0, usesLeft - 1);
    } else {
      payload.usesLeft = STREAM_TOKEN_MAX_USES - 1;
    }
  }

  streamTokenStore.set(token, payload);
  return payload;
}

function buildSecureStreamUrl(token) {
  return `/api/play/${encodeURIComponent(token)}`;
}

async function maybeSwitchEpisodeSourceToGdrive(library, drama, episode, { force = false } = {}) {
  if (!hasValidGdriveFileId(episode)) {
    return false;
  }

  if (!force && !AUTO_SWITCH_TO_GDRIVE_ON_TELEGRAM_ERROR) {
    return false;
  }

  if (AUTO_PERSIST_GDRIVE_SWITCH) {
    episode.source = "gdrive";
    episode.updatedAt = new Date().toISOString();
    touchDramaTimestamps(drama);
    await writeLibrary(library);
  }

  return true;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function normalizeViewerId(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120);
  return normalized;
}

function getViewerIdFromRequest(req) {
  const headerViewerId = req.headers["x-viewer-id"];
  const headerTelegramUserId = req.headers["x-telegram-user-id"];
  const queryViewerId = req.query?.viewerId;
  const bodyViewerId = req.body?.viewerId;
  return normalizeViewerId(headerViewerId || headerTelegramUserId || queryViewerId || bodyViewerId || "");
}

function isValidGa4MeasurementId(value) {
  return /^G-[A-Z0-9]{5,}$/i.test(String(value || "").trim());
}

function getPublicAppConfig() {
  const measurementId = String(GA4_MEASUREMENT_ID || "").trim();
  const ga4Enabled = GA4_ANALYTICS_ENABLED && isValidGa4MeasurementId(measurementId);
  return {
    analytics: {
      ga4: {
        enabled: ga4Enabled,
        measurementId: ga4Enabled ? measurementId : ""
      }
    }
  };
}

function buildYoutubeChannelUrl() {
  if (YOUTUBE_REQUIRED_CHANNEL_URL) {
    return YOUTUBE_REQUIRED_CHANNEL_URL;
  }

  if (YOUTUBE_REQUIRED_CHANNEL_ID) {
    return `https://www.youtube.com/channel/${encodeURIComponent(YOUTUBE_REQUIRED_CHANNEL_ID)}`;
  }

  return "https://www.youtube.com";
}

function assertYoutubeGateConfig({ requireOAuth = false } = {}) {
  if (!YOUTUBE_SUBSCRIBE_GATE_ENABLED) {
    throw new Error("YOUTUBE_SUBSCRIBE_GATE_ENABLED=false.");
  }

  if (!YOUTUBE_REQUIRED_CHANNEL_ID) {
    throw new Error("YOUTUBE_REQUIRED_CHANNEL_ID belum di-set.");
  }

  if (requireOAuth) {
    if (!YOUTUBE_OAUTH_CLIENT_ID) {
      throw new Error("YOUTUBE_OAUTH_CLIENT_ID belum di-set.");
    }

    if (!YOUTUBE_OAUTH_CLIENT_SECRET) {
      throw new Error("YOUTUBE_OAUTH_CLIENT_SECRET belum di-set.");
    }
  }
}

function isYoutubeGateRequiredForEpisode(episodeNumber) {
  if (!YOUTUBE_SUBSCRIBE_GATE_ENABLED) {
    return false;
  }

  const safeEpisodeNumber = Number(episodeNumber);
  if (!Number.isInteger(safeEpisodeNumber) || safeEpisodeNumber <= 0) {
    return false;
  }

  return safeEpisodeNumber >= YOUTUBE_SUBSCRIBE_MIN_EPISODE;
}

function normalizeConfiguredYoutubeOauthRedirectUri(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "auto") {
    return "";
  }

  if (!/^https?:\/\//i.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    parsed.search = "";
    parsed.hash = "";

    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/api/youtube/oauth/callback";
    } else if (parsed.pathname.length > 1 && /\/+$/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }

    return parsed.toString();
  } catch {
    return raw;
  }
}

function resolveYoutubeOAuthRedirectUri(req) {
  const configured = normalizeConfiguredYoutubeOauthRedirectUri(YOUTUBE_OAUTH_REDIRECT_URI);
  if (configured) {
    return configured;
  }

  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").trim();
  if (!host) {
    return "http://localhost:3000/api/youtube/oauth/callback";
  }

  return `${protocol}://${host}/api/youtube/oauth/callback`;
}

function humanizeYoutubeOauthError(errorCode) {
  const code = String(errorCode || "").trim().toLowerCase();
  if (!code) {
    return "";
  }

  if (code === "org_internal") {
    return "Aplikasi OAuth masih mode Internal. Ubah ke External atau login dengan akun dalam organisasi Google Workspace yang sama.";
  }

  if (code === "access_denied") {
    return "Login Google dibatalkan oleh user.";
  }

  return `Login Google dibatalkan: ${code}`;
}

function normalizeYoutubeVerificationStore(input) {
  const records = {};
  const rawRecords = input?.records && typeof input.records === "object" ? input.records : {};

  for (const [viewerIdRaw, value] of Object.entries(rawRecords)) {
    const viewerId = normalizeViewerId(viewerIdRaw);
    if (!viewerId || !value || typeof value !== "object") {
      continue;
    }

    records[viewerId] = {
      viewerId,
      channelId: String(value.channelId || "").trim(),
      verified: Boolean(value.verified),
      checkedAt: String(value.checkedAt || "").trim(),
      source: String(value.source || "youtube_oauth").trim(),
      youtubeChannelId: String(value.youtubeChannelId || "").trim()
    };
  }

  return { records };
}

async function readYoutubeVerificationStore() {
  if (shouldUseFirebaseRealtimeDb()) {
    const remoteValue = await readJsonFromFirebasePath(FIREBASE_YOUTUBE_VERIFICATIONS_PATH, null);
    if (remoteValue) {
      return normalizeYoutubeVerificationStore(remoteValue);
    }

    try {
      const raw = await readFile(YOUTUBE_VERIFICATION_FILE, "utf-8");
      const localStore = normalizeYoutubeVerificationStore(JSON.parse(raw));
      await writeJsonToFirebasePath(FIREBASE_YOUTUBE_VERIFICATIONS_PATH, localStore);
      return localStore;
    } catch {
      return { records: {} };
    }
  }

  try {
    const raw = await readFile(YOUTUBE_VERIFICATION_FILE, "utf-8");
    return normalizeYoutubeVerificationStore(JSON.parse(raw));
  } catch {
    return { records: {} };
  }
}

async function writeYoutubeVerificationStore(store) {
  const next = normalizeYoutubeVerificationStore(store);
  if (shouldUseFirebaseRealtimeDb()) {
    await writeJsonToFirebasePath(FIREBASE_YOUTUBE_VERIFICATIONS_PATH, next);
    return;
  }

  await writeFile(YOUTUBE_VERIFICATION_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

function normalizeAnalyticsKey(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  return raw.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120);
}

function normalizeEpisodeNumberKey(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return "";
  }

  return String(parsed);
}

function sanitizeCounter(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function createEmptyAnalyticsStore() {
  return {
    totals: {
      visits: 0,
      visitors: 0
    },
    visitorIds: {},
    dramaClicks: {},
    episodeClicks: {}
  };
}

function normalizeVisitorIdStore(input) {
  const normalized = {};
  const source = input && typeof input === "object" ? input : {};
  for (const [viewerIdRaw, value] of Object.entries(source)) {
    const viewerId = normalizeViewerId(viewerIdRaw);
    if (!viewerId) {
      continue;
    }

    if (value && typeof value === "object") {
      normalized[viewerId] = {
        firstSeenAt: String(value.firstSeenAt || "").trim(),
        nonce: String(value.nonce || "").trim()
      };
      continue;
    }

    normalized[viewerId] = {
      firstSeenAt: "",
      nonce: ""
    };
  }

  return normalized;
}

function normalizeDramaClickStore(input) {
  const normalized = {};
  const source = input && typeof input === "object" ? input : {};
  for (const [dramaIdRaw, countValue] of Object.entries(source)) {
    const dramaId = normalizeAnalyticsKey(dramaIdRaw);
    if (!dramaId) {
      continue;
    }

    normalized[dramaId] = sanitizeCounter(countValue);
  }

  return normalized;
}

function normalizeEpisodeClickStore(input) {
  const normalized = {};
  const source = input && typeof input === "object" ? input : {};
  for (const [dramaIdRaw, episodeStore] of Object.entries(source)) {
    const dramaId = normalizeAnalyticsKey(dramaIdRaw);
    if (!dramaId || !episodeStore || typeof episodeStore !== "object") {
      continue;
    }

    const normalizedEpisodes = {};
    for (const [episodeKeyRaw, countValue] of Object.entries(episodeStore)) {
      const episodeKey = normalizeEpisodeNumberKey(episodeKeyRaw);
      if (!episodeKey) {
        continue;
      }

      normalizedEpisodes[episodeKey] = sanitizeCounter(countValue);
    }

    normalized[dramaId] = normalizedEpisodes;
  }

  return normalized;
}

function normalizeAnalyticsStore(input) {
  const source = input && typeof input === "object" ? input : {};
  const normalized = createEmptyAnalyticsStore();
  normalized.visitorIds = normalizeVisitorIdStore(source.visitorIds);
  normalized.dramaClicks = normalizeDramaClickStore(source.dramaClicks);
  normalized.episodeClicks = normalizeEpisodeClickStore(source.episodeClicks);
  normalized.totals.visits = sanitizeCounter(source?.totals?.visits);
  normalized.totals.visitors = sanitizeCounter(source?.totals?.visitors);

  const knownVisitorCount = Object.keys(normalized.visitorIds).length;
  if (knownVisitorCount > normalized.totals.visitors) {
    normalized.totals.visitors = knownVisitorCount;
  }

  return normalized;
}

function sanitizeAnalyticsStatsPayload(input) {
  const store = normalizeAnalyticsStore(input);
  return {
    totals: {
      visits: store.totals.visits,
      visitors: store.totals.visitors
    },
    dramaClicks: store.dramaClicks,
    episodeClicks: store.episodeClicks
  };
}

async function readAnalyticsStore() {
  if (shouldUseFirebaseRealtimeDb()) {
    const remoteValue = await readJsonFromFirebasePath(FIREBASE_ANALYTICS_PATH, null);
    if (remoteValue) {
      return normalizeAnalyticsStore(remoteValue);
    }

    try {
      const raw = await readFile(ANALYTICS_FILE, "utf-8");
      const localStore = normalizeAnalyticsStore(JSON.parse(raw));
      await writeJsonToFirebasePath(FIREBASE_ANALYTICS_PATH, localStore);
      return localStore;
    } catch {
      return createEmptyAnalyticsStore();
    }
  }

  try {
    const raw = await readFile(ANALYTICS_FILE, "utf-8");
    return normalizeAnalyticsStore(JSON.parse(raw));
  } catch {
    return createEmptyAnalyticsStore();
  }
}

async function writeAnalyticsStore(store) {
  const next = normalizeAnalyticsStore(store);
  if (shouldUseFirebaseRealtimeDb()) {
    await writeJsonToFirebasePath(FIREBASE_ANALYTICS_PATH, next);
    return;
  }

  await writeFile(ANALYTICS_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

async function incrementFirebaseCounter(pathValue, delta = 1) {
  const amount = Math.max(0, Math.floor(Number(delta) || 0));
  if (!amount) {
    return;
  }

  const db = await getFirebaseRealtimeDbClient();
  await db.ref(pathValue).transaction((currentValue) => sanitizeCounter(currentValue) + amount);
}

async function trackWebsiteVisit(viewerId) {
  const safeViewerId = normalizeViewerId(viewerId);
  if (shouldUseFirebaseRealtimeDb()) {
    await incrementFirebaseCounter(`${FIREBASE_ANALYTICS_PATH}/totals/visits`, 1);
    if (safeViewerId) {
      const db = await getFirebaseRealtimeDbClient();
      const visitorRef = db.ref(`${FIREBASE_ANALYTICS_PATH}/visitorIds/${safeViewerId}`);
      const marker = randomUUID().replace(/-/g, "");
      const visitedAt = new Date().toISOString();
      const transactionResult = await visitorRef.transaction((currentValue) => {
        if (currentValue && typeof currentValue === "object") {
          return currentValue;
        }

        return {
          firstSeenAt: visitedAt,
          nonce: marker
        };
      });

      const storedValue = transactionResult.snapshot.val();
      if (storedValue && storedValue.nonce === marker) {
        await incrementFirebaseCounter(`${FIREBASE_ANALYTICS_PATH}/totals/visitors`, 1);
      }
    }

    const latest = await readAnalyticsStore();
    return sanitizeAnalyticsStatsPayload(latest);
  }

  const store = await readAnalyticsStore();
  store.totals.visits = sanitizeCounter(store.totals.visits) + 1;
  if (safeViewerId && !store.visitorIds[safeViewerId]) {
    store.visitorIds[safeViewerId] = {
      firstSeenAt: new Date().toISOString(),
      nonce: ""
    };
    store.totals.visitors = sanitizeCounter(store.totals.visitors) + 1;
  }

  await writeAnalyticsStore(store);
  return sanitizeAnalyticsStatsPayload(store);
}

async function trackDramaClick(dramaId) {
  const safeDramaId = normalizeAnalyticsKey(dramaId);
  if (!safeDramaId) {
    throw new Error("dramaId tidak valid.");
  }

  if (shouldUseFirebaseRealtimeDb()) {
    await incrementFirebaseCounter(`${FIREBASE_ANALYTICS_PATH}/dramaClicks/${safeDramaId}`, 1);
    const latest = await readAnalyticsStore();
    return sanitizeAnalyticsStatsPayload(latest);
  }

  const store = await readAnalyticsStore();
  const current = sanitizeCounter(store.dramaClicks[safeDramaId]);
  store.dramaClicks[safeDramaId] = current + 1;
  await writeAnalyticsStore(store);
  return sanitizeAnalyticsStatsPayload(store);
}

async function trackEpisodeClick(dramaId, episodeNumber) {
  const safeDramaId = normalizeAnalyticsKey(dramaId);
  if (!safeDramaId) {
    throw new Error("dramaId tidak valid.");
  }

  const safeEpisodeNumber = normalizeEpisodeNumberKey(episodeNumber);
  if (!safeEpisodeNumber) {
    throw new Error("episodeNumber tidak valid.");
  }

  if (shouldUseFirebaseRealtimeDb()) {
    await incrementFirebaseCounter(
      `${FIREBASE_ANALYTICS_PATH}/episodeClicks/${safeDramaId}/${safeEpisodeNumber}`,
      1
    );
    const latest = await readAnalyticsStore();
    return sanitizeAnalyticsStatsPayload(latest);
  }

  const store = await readAnalyticsStore();
  if (!store.episodeClicks[safeDramaId] || typeof store.episodeClicks[safeDramaId] !== "object") {
    store.episodeClicks[safeDramaId] = {};
  }

  const current = sanitizeCounter(store.episodeClicks[safeDramaId][safeEpisodeNumber]);
  store.episodeClicks[safeDramaId][safeEpisodeNumber] = current + 1;
  await writeAnalyticsStore(store);
  return sanitizeAnalyticsStatsPayload(store);
}

async function getYoutubeViewerVerificationStatus(viewerId) {
  const normalizedViewerId = normalizeViewerId(viewerId);
  if (!YOUTUBE_SUBSCRIBE_GATE_ENABLED) {
    return {
      enabled: false,
      verified: true,
      viewerId: normalizedViewerId,
      minEpisode: YOUTUBE_SUBSCRIBE_MIN_EPISODE,
      requiredChannelId: YOUTUBE_REQUIRED_CHANNEL_ID,
      requiredChannelUrl: buildYoutubeChannelUrl(),
      checkedAt: ""
    };
  }

  if (!normalizedViewerId) {
    return {
      enabled: true,
      verified: false,
      viewerId: "",
      minEpisode: YOUTUBE_SUBSCRIBE_MIN_EPISODE,
      requiredChannelId: YOUTUBE_REQUIRED_CHANNEL_ID,
      requiredChannelUrl: buildYoutubeChannelUrl(),
      checkedAt: ""
    };
  }

  const store = await readYoutubeVerificationStore();
  const record = store.records[normalizedViewerId];
  const verified =
    Boolean(record?.verified) &&
    String(record?.channelId || "").trim() === String(YOUTUBE_REQUIRED_CHANNEL_ID || "").trim();

  return {
    enabled: true,
    verified,
    viewerId: normalizedViewerId,
    minEpisode: YOUTUBE_SUBSCRIBE_MIN_EPISODE,
    requiredChannelId: YOUTUBE_REQUIRED_CHANNEL_ID,
    requiredChannelUrl: buildYoutubeChannelUrl(),
    checkedAt: String(record?.checkedAt || "").trim(),
    record: record || null
  };
}

function cleanupExpiredYoutubeOauthStates() {
  const now = Date.now();
  for (const [stateKey, payload] of youtubeOauthStateStore.entries()) {
    if (!payload || Number(payload.expiresAt) <= now) {
      youtubeOauthStateStore.delete(stateKey);
    }
  }
}

function createYoutubeOauthState(viewerId) {
  cleanupExpiredYoutubeOauthStates();
  const stateKey = randomUUID().replace(/-/g, "");
  youtubeOauthStateStore.set(stateKey, {
    viewerId,
    expiresAt: Date.now() + YOUTUBE_OAUTH_STATE_TTL_MS
  });
  return stateKey;
}

function consumeYoutubeOauthState(stateKey) {
  cleanupExpiredYoutubeOauthStates();
  const key = String(stateKey || "").trim();
  if (!key) {
    return null;
  }

  const payload = youtubeOauthStateStore.get(key);
  if (!payload || Number(payload.expiresAt) <= Date.now()) {
    youtubeOauthStateStore.delete(key);
    return null;
  }

  youtubeOauthStateStore.delete(key);
  return payload;
}

async function exchangeYoutubeOAuthCode({ code, redirectUri }) {
  const params = new URLSearchParams({
    client_id: YOUTUBE_OAUTH_CLIENT_ID,
    client_secret: YOUTUBE_OAUTH_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const response = await axios.post(GOOGLE_DRIVE_TOKEN_URL, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 30_000,
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300 || !response.data?.access_token) {
    const detail = response.data?.error_description || response.data?.error || "OAuth exchange gagal.";
    throw new Error(detail);
  }

  return {
    accessToken: String(response.data.access_token || "").trim()
  };
}

async function verifyYoutubeSubscriptionByAccessToken(accessToken) {
  const requestYoutube = async (params) =>
    axios.get(YOUTUBE_VERIFY_API_BASE, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params,
      timeout: 30_000,
      validateStatus: () => true
    });

  const directResponse = await requestYoutube({
    part: "id,snippet",
    mine: true,
    forChannelId: YOUTUBE_REQUIRED_CHANNEL_ID,
    maxResults: 1
  });

  if (directResponse.status >= 200 && directResponse.status < 300 && directResponse.data) {
    const items = Array.isArray(directResponse.data.items) ? directResponse.data.items : [];
    const first = items[0] || null;
    return {
      isSubscribed: items.length > 0,
      youtubeChannelId: String(first?.snippet?.resourceId?.channelId || "").trim()
    };
  }

  const directError =
    directResponse.data?.error?.message || `YouTube verify gagal (HTTP ${directResponse.status}).`;
  if (directResponse.status !== 400) {
    throw new Error(directError);
  }

  // Fallback: scan subscriptions mine + pagination, lalu cocokkan channelId secara manual.
  let pageToken = "";
  let foundChannelId = "";
  for (let i = 0; i < 20; i += 1) {
    const listResponse = await requestYoutube({
      part: "id,snippet",
      mine: true,
      maxResults: 50,
      pageToken: pageToken || undefined
    });

    if (listResponse.status < 200 || listResponse.status >= 300 || !listResponse.data) {
      const detail =
        listResponse.data?.error?.message || `YouTube verify fallback gagal (HTTP ${listResponse.status}).`;
      throw new Error(detail);
    }

    const items = Array.isArray(listResponse.data.items) ? listResponse.data.items : [];
    const matched = items.find((item) => {
      const channelId = String(item?.snippet?.resourceId?.channelId || "").trim();
      return channelId === YOUTUBE_REQUIRED_CHANNEL_ID;
    });

    if (matched) {
      foundChannelId = String(matched?.snippet?.resourceId?.channelId || "").trim();
      break;
    }

    pageToken = String(listResponse.data.nextPageToken || "").trim();
    if (!pageToken) {
      break;
    }
  }

  return {
    isSubscribed: Boolean(foundChannelId),
    youtubeChannelId: foundChannelId
  };
}

function renderYoutubeOauthCallbackPage({ success, verified, message, viewerId }) {
  const payload = JSON.stringify({
    type: "top-film-one-youtube-verify",
    success: Boolean(success),
    verified: Boolean(verified),
    message: String(message || ""),
    viewerId: String(viewerId || "")
  });
  const escapedMessage = String(message || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Verifikasi YouTube</title>
    <style>
      body{font-family:Segoe UI,Arial,sans-serif;background:#08131b;color:#e9f5fb;margin:0;padding:24px;display:grid;place-items:center;min-height:100vh}
      .box{max-width:560px;border:1px solid #2b4a5c;border-radius:14px;padding:20px;background:#102230;text-align:center}
      h1{margin:0 0 10px;font-size:1.2rem}
      p{margin:0;color:#b7ccda;line-height:1.45}
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${Boolean(verified) ? "Verifikasi Berhasil" : "Verifikasi Selesai"}</h1>
      <p>${escapedMessage}</p>
    </div>
    <script>
      (function () {
        var payload = ${payload};
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin);
          }
        } catch (_) {}
        setTimeout(function () {
          window.close();
        }, 700);
      })();
    </script>
  </body>
</html>`;
}

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isLikelyVideoFileName(fileName) {
  return VIDEO_FILE_NAME_PATTERN.test(String(fileName || "").trim());
}

function normalizeDriveFileForVideo(file) {
  const sourceFileId = String(file?.id || "").trim();
  const sourceMimeType = String(file?.mimeType || "").trim();
  const sourceName = String(file?.name || "").trim();

  const shortcutTargetId = String(file?.shortcutDetails?.targetId || "").trim();
  const shortcutTargetMimeType = String(file?.shortcutDetails?.targetMimeType || "").trim();
  const isShortcut = sourceMimeType === "application/vnd.google-apps.shortcut";

  const effectiveFileId = isShortcut && shortcutTargetId ? shortcutTargetId : sourceFileId;
  const effectiveMimeType = isShortcut && shortcutTargetMimeType ? shortcutTargetMimeType : sourceMimeType;
  const mimeLower = String(effectiveMimeType || "").toLowerCase();

  const isVideoByMime = mimeLower.startsWith("video/");
  const isVideoByName = isLikelyVideoFileName(sourceName);
  const isVideoByOctetStream = mimeLower === "application/octet-stream" && isVideoByName;
  const isVideo = isVideoByMime || isVideoByName || isVideoByOctetStream;

  return {
    ...file,
    id: effectiveFileId,
    mimeType: effectiveMimeType,
    sourceFileId,
    sourceMimeType,
    isShortcut,
    isVideo
  };
}

function parseEpisodeNumberFromFileName(fileName) {
  const baseName = path.parse(fileName).name;
  const patterns = [
    /(?:episode|eps|ep|e)\s*[-_.]?\s*(\d{1,4})/i,
    /(?:^|[^0-9])(\d{1,4})(?:[^0-9]|$)/i
  ];

  for (const pattern of patterns) {
    const match = baseName.match(pattern);
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function cleanEpisodeTitle(fileName, fallbackEpisodeNumber) {
  const baseName = path.parse(fileName).name;
  const cleaned = baseName.replace(/[_\.]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned) {
    return cleaned;
  }

  return `Episode ${fallbackEpisodeNumber}`;
}

function computeEpisodeAssignments(files, startEpisode, detectFromFilename) {
  const ordered = [...files].sort((a, b) => naturalSort.compare(a.originalname, b.originalname));
  const assignedNumbers = new Set();
  let cursor = Math.max(1, Number(startEpisode) || 1);

  return ordered.map((file) => {
    let episodeNumber = null;

    if (detectFromFilename) {
      const parsedNumber = parseEpisodeNumberFromFileName(file.originalname);
      if (parsedNumber && !assignedNumbers.has(parsedNumber)) {
        episodeNumber = parsedNumber;
      }
    }

    if (!episodeNumber) {
      while (assignedNumbers.has(cursor)) {
        cursor += 1;
      }

      episodeNumber = cursor;
      cursor += 1;
    }

    assignedNumbers.add(episodeNumber);
    return {
      file,
      episodeNumber,
      episodeTitle: cleanEpisodeTitle(file.originalname, episodeNumber)
    };
  });
}

function getAdminToken(req) {
  const headerToken = req.headers["x-admin-token"];
  const queryToken = req.query?.adminToken;
  const bodyToken = req.body?.adminToken;
  return String(headerToken || queryToken || bodyToken || "");
}

function isAdminAuthorizedRequest(req) {
  if (!ADMIN_TOKEN) {
    return false;
  }

  const providedToken = getAdminToken(req);
  return Boolean(providedToken && providedToken === ADMIN_TOKEN);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(500).json({
      message: "ADMIN_TOKEN belum di-set di .env."
    });
  }

  const providedToken = getAdminToken(req);
  if (!providedToken || providedToken !== ADMIN_TOKEN) {
    return res.status(401).json({ message: "Token admin tidak valid." });
  }

  next();
}

function assertTelegramUploadConfig() {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN belum di-set.");
  }

  if (!TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_CHANNEL_ID belum di-set.");
  }
}

function assertGoogleDriveConfig() {
  if (GOOGLE_DRIVE_AUTH_MODE !== "service_account" && GOOGLE_DRIVE_AUTH_MODE !== "oauth_refresh") {
    throw new Error("GOOGLE_DRIVE_AUTH_MODE harus service_account atau oauth_refresh.");
  }

  if (GOOGLE_DRIVE_AUTH_MODE === "oauth_refresh") {
    if (!GOOGLE_DRIVE_OAUTH_CLIENT_ID) {
      throw new Error("GOOGLE_DRIVE_OAUTH_CLIENT_ID belum di-set.");
    }

    if (!GOOGLE_DRIVE_OAUTH_CLIENT_SECRET) {
      throw new Error("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET belum di-set.");
    }

    if (!GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN) {
      throw new Error("GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN belum di-set.");
    }

    return "oauth_refresh";
  }

  if (!GOOGLE_DRIVE_CLIENT_EMAIL) {
    throw new Error("GOOGLE_DRIVE_CLIENT_EMAIL belum di-set.");
  }

  if (!GOOGLE_DRIVE_PRIVATE_KEY) {
    throw new Error("GOOGLE_DRIVE_PRIVATE_KEY belum di-set.");
  }

  return "service_account";
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createGoogleServiceAccountJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const claimSet = {
    iss: GOOGLE_DRIVE_CLIENT_EMAIL,
    scope: GOOGLE_DRIVE_SCOPE,
    aud: GOOGLE_DRIVE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };
  if (GOOGLE_DRIVE_SUBJECT) {
    claimSet.sub = GOOGLE_DRIVE_SUBJECT;
  }

  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claimSet))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(GOOGLE_DRIVE_PRIVATE_KEY);

  return `${signingInput}.${signature
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")}`;
}

async function fetchGoogleAccessTokenWithServiceAccount({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    gdriveTokenCache.authMode === "service_account" &&
    gdriveTokenCache.accessToken &&
    gdriveTokenCache.expiresAt - 60_000 > now
  ) {
    return gdriveTokenCache.accessToken;
  }

  const assertion = createGoogleServiceAccountJwt();
  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", assertion);

  const response = await axios.post(GOOGLE_DRIVE_TOKEN_URL, form.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 30_000,
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300 || !response.data?.access_token) {
    const detail =
      response.data?.error_description ||
      response.data?.error ||
      `Google OAuth gagal (HTTP ${response.status}).`;
    throw new Error(detail);
  }

  const expiresInSec = Number(response.data.expires_in || 3600);
  gdriveTokenCache.accessToken = response.data.access_token;
  gdriveTokenCache.expiresAt = now + expiresInSec * 1000;
  gdriveTokenCache.authMode = "service_account";

  return gdriveTokenCache.accessToken;
}

async function fetchGoogleAccessTokenWithOAuthRefreshToken({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    gdriveTokenCache.authMode === "oauth_refresh" &&
    gdriveTokenCache.accessToken &&
    gdriveTokenCache.expiresAt - 60_000 > now
  ) {
    return gdriveTokenCache.accessToken;
  }

  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("client_id", GOOGLE_DRIVE_OAUTH_CLIENT_ID);
  form.set("client_secret", GOOGLE_DRIVE_OAUTH_CLIENT_SECRET);
  form.set("refresh_token", GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN);

  const response = await axios.post(GOOGLE_DRIVE_TOKEN_URL, form.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 30_000,
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300 || !response.data?.access_token) {
    const detail =
      response.data?.error_description ||
      response.data?.error ||
      `Google OAuth gagal (HTTP ${response.status}).`;
    throw new Error(detail);
  }

  const expiresInSec = Number(response.data.expires_in || 3600);
  gdriveTokenCache.accessToken = response.data.access_token;
  gdriveTokenCache.expiresAt = now + expiresInSec * 1000;
  gdriveTokenCache.authMode = "oauth_refresh";

  return gdriveTokenCache.accessToken;
}

async function fetchGoogleAccessToken({ forceRefresh = false } = {}) {
  const authMode = assertGoogleDriveConfig();
  if (authMode === "oauth_refresh") {
    return fetchGoogleAccessTokenWithOAuthRefreshToken({ forceRefresh });
  }

  return fetchGoogleAccessTokenWithServiceAccount({ forceRefresh });
}

async function fetchGoogleDriveStream(fileId, rangeHeader, { retry = true } = {}) {
  const accessToken = await fetchGoogleAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`
  };

  if (rangeHeader) {
    headers.Range = rangeHeader;
  }

  const response = await axios.get(`${GOOGLE_DRIVE_FILE_BASE}/${encodeURIComponent(fileId)}`, {
    responseType: "stream",
    headers,
    params: {
      alt: "media",
      supportsAllDrives: true
    },
    timeout: 0,
    validateStatus: () => true
  });

  if (response.status === 401 && retry) {
    await fetchGoogleAccessToken({ forceRefresh: true });
    return fetchGoogleDriveStream(fileId, rangeHeader, { retry: false });
  }

  return response;
}

async function fetchTelegramStreamByFileId(fileId, rangeHeader, { retry = true } = {}) {
  const normalizedFileId = String(fileId || "").trim();
  if (!normalizedFileId) {
    throw new Error("telegramFileId kosong.");
  }

  const streamUrl = await resolveTelegramFileUrl(normalizedFileId);
  const headers = {};
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }

  const response = await axios.get(streamUrl, {
    responseType: "stream",
    headers,
    timeout: 0,
    validateStatus: () => true
  });

  if ([401, 403, 404].includes(response.status) && retry) {
    filePathCache.delete(normalizedFileId);
    return fetchTelegramStreamByFileId(normalizedFileId, rangeHeader, { retry: false });
  }

  return response;
}

async function extractUpstreamErrorDetail(response, fallbackMessage) {
  let detail = fallbackMessage;
  if (response.data && typeof response.data.on === "function") {
    const chunks = [];
    for await (const chunk of response.data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }

    const text = Buffer.concat(chunks).toString("utf-8");
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.description || detail;
    } catch {
      if (text) {
        detail = text;
      }
    }
  }

  return detail;
}

function applyUpstreamStreamHeaders(res, headers = {}) {
  const passHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified"
  ];

  for (const headerName of passHeaders) {
    const value = headers?.[headerName];
    if (value) {
      res.setHeader(headerName, value);
    }
  }
}

async function listGoogleDriveFolderFiles(folderId, { retry = true } = {}) {
  const accessToken = await fetchGoogleAccessToken();
  const items = [];
  let pageToken = "";

  do {
    const response = await axios.get(GOOGLE_DRIVE_FILE_BASE, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params: {
        q: `'${folderId}' in parents and trashed=false`,
        fields:
          "nextPageToken, files(id,name,size,mimeType,webViewLink,shortcutDetails(targetId,targetMimeType))",
        pageSize: 1000,
        pageToken: pageToken || undefined,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
      },
      timeout: 60_000,
      validateStatus: () => true
    });

    if (response.status === 401 && retry) {
      await fetchGoogleAccessToken({ forceRefresh: true });
      return listGoogleDriveFolderFiles(folderId, { retry: false });
    }

    if (response.status < 200 || response.status >= 300 || !response.data) {
      const detail =
        response.data?.error?.message || `Gagal membaca folder Google Drive (HTTP ${response.status}).`;
      throw new Error(detail);
    }

    const files = Array.isArray(response.data.files) ? response.data.files : [];
    items.push(...files);
    pageToken = response.data.nextPageToken || "";
  } while (pageToken);

  return items;
}

async function listGoogleDriveFolderItemsRecursive(
  rootFolderId,
  { maxDepth = 6 } = {}
) {
  const safeMaxDepth = Math.max(1, Math.min(12, Number(maxDepth) || 6));
  const queue = [
    {
      folderId: String(rootFolderId || "").trim(),
      depth: 0,
      folderPath: ""
    }
  ];
  const visitedFolders = new Set([String(rootFolderId || "").trim()]);
  const items = [];
  let scannedFolders = 0;

  while (queue.length) {
    const current = queue.shift();
    if (!current?.folderId) {
      continue;
    }

    scannedFolders += 1;
    const children = await listGoogleDriveFolderFiles(current.folderId);

    for (const child of children) {
      const childName = String(child?.name || "").trim();
      const childId = String(child?.id || "").trim();
      const childMimeType = String(child?.mimeType || "").trim();
      const childPath = [current.folderPath, childName].filter(Boolean).join("/");

      items.push({
        ...child,
        parentFolderId: current.folderId,
        depth: current.depth + 1,
        path: childPath
      });

      if (childMimeType !== "application/vnd.google-apps.folder") {
        continue;
      }

      if (current.depth + 1 >= safeMaxDepth) {
        continue;
      }

      if (!childId || visitedFolders.has(childId)) {
        continue;
      }

      visitedFolders.add(childId);
      queue.push({
        folderId: childId,
        depth: current.depth + 1,
        folderPath: childPath
      });
    }
  }

  return {
    items,
    scannedFolders,
    maxDepth: safeMaxDepth
  };
}

async function getGoogleDriveFileMetadata(fileId, { retry = true } = {}) {
  const accessToken = await fetchGoogleAccessToken();
  const response = await axios.get(`${GOOGLE_DRIVE_FILE_BASE}/${encodeURIComponent(fileId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    params: {
      fields: "id,name,mimeType,driveId,trashed",
      supportsAllDrives: true
    },
    timeout: 30_000,
    validateStatus: () => true
  });

  if (response.status === 401 && retry) {
    await fetchGoogleAccessToken({ forceRefresh: true });
    return getGoogleDriveFileMetadata(fileId, { retry: false });
  }

  if (response.status < 200 || response.status >= 300 || !response.data) {
    const detail = response.data?.error?.message || `Gagal membaca metadata file Google Drive (HTTP ${response.status}).`;
    throw new Error(detail);
  }

  return response.data;
}

function escapeGoogleDriveQueryValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

function buildDramaFolderName(drama) {
  const raw = String(drama?.title || drama?.id || "Drama").trim();
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || `drama-${Date.now()}`;
}

async function findGoogleDriveFolderByName({
  folderName,
  parentFolderId = "",
  retry = true
} = {}) {
  const accessToken = await fetchGoogleAccessToken();
  const escapedFolderName = escapeGoogleDriveQueryValue(folderName);
  const parentClause = parentFolderId
    ? `'${parentFolderId}' in parents`
    : "'root' in parents";
  const query = `${parentClause} and mimeType='application/vnd.google-apps.folder' and name='${escapedFolderName}' and trashed=false`;

  const response = await axios.get(GOOGLE_DRIVE_FILE_BASE, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    params: {
      q: query,
      fields: "files(id,name,mimeType,driveId)",
      pageSize: 10,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    },
    timeout: 30_000,
    validateStatus: () => true
  });

  if (response.status === 401 && retry) {
    await fetchGoogleAccessToken({ forceRefresh: true });
    return findGoogleDriveFolderByName({
      folderName,
      parentFolderId,
      retry: false
    });
  }

  if (response.status < 200 || response.status >= 300 || !response.data) {
    const detail =
      response.data?.error?.message || `Gagal mencari folder Google Drive (HTTP ${response.status}).`;
    throw new Error(detail);
  }

  const items = Array.isArray(response.data.files) ? response.data.files : [];
  return items[0] || null;
}

async function createGoogleDriveFolder({
  folderName,
  parentFolderId = "",
  retry = true
} = {}) {
  const accessToken = await fetchGoogleAccessToken();
  const metadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const response = await axios.post(GOOGLE_DRIVE_FILE_BASE, metadata, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8"
    },
    params: {
      fields: "id,name,mimeType,driveId",
      supportsAllDrives: true
    },
    timeout: 30_000,
    validateStatus: () => true
  });

  if (response.status === 401 && retry) {
    await fetchGoogleAccessToken({ forceRefresh: true });
    return createGoogleDriveFolder({
      folderName,
      parentFolderId,
      retry: false
    });
  }

  if (response.status < 200 || response.status >= 300 || !response.data?.id) {
    const detail =
      response.data?.error?.message || `Gagal membuat folder Google Drive (HTTP ${response.status}).`;
    throw new Error(detail);
  }

  return {
    id: String(response.data.id || "").trim(),
    name: String(response.data.name || folderName).trim(),
    created: true
  };
}

async function ensureGoogleDriveDramaFolder({ drama, parentFolderId = "" } = {}) {
  const folderName = buildDramaFolderName(drama);
  const existing = await findGoogleDriveFolderByName({
    folderName,
    parentFolderId
  });
  if (existing?.id) {
    return {
      id: String(existing.id || "").trim(),
      name: String(existing.name || folderName).trim(),
      created: false
    };
  }

  return createGoogleDriveFolder({
    folderName,
    parentFolderId
  });
}

async function ensureDramaFolderForMetadata(drama, { preferredParentFolderId = "" } = {}) {
  const currentFolderId = extractGoogleDriveId(drama?.gdriveFolderId || "");
  const normalizedPreferredParent = extractGoogleDriveId(preferredParentFolderId || "");
  const normalizedDefaultParent = extractGoogleDriveId(GOOGLE_DRIVE_DEFAULT_FOLDER_ID || "");
  const sharedParentFolderId = normalizedPreferredParent || normalizedDefaultParent;
  const currentIsSharedParent =
    Boolean(currentFolderId && sharedParentFolderId) && currentFolderId === sharedParentFolderId;

  if (currentFolderId && !currentIsSharedParent) {
    return {
      folderId: currentFolderId,
      folderName: String(drama?.gdriveFolderName || "").trim(),
      created: false,
      skipped: false,
      reason: "already_set"
    };
  }

  const authMode = assertGoogleDriveConfig();
  const parentFolderId = sharedParentFolderId;
  if (authMode === "service_account" && !parentFolderId) {
    return {
      folderId: "",
      folderName: "",
      created: false,
      skipped: true,
      reason: "missing_parent_folder_for_service_account"
    };
  }

  const folder = await ensureGoogleDriveDramaFolder({
    drama,
    parentFolderId
  });

  drama.gdriveFolderId = String(folder.id || "").trim();
  drama.gdriveFolderName = String(folder.name || "").trim();

  return {
    folderId: drama.gdriveFolderId,
    folderName: drama.gdriveFolderName,
    created: Boolean(folder.created),
    skipped: false,
    reason: ""
  };
}

async function uploadFileToGoogleDrive({
  localPath,
  originalName,
  mimeType,
  folderId,
  fileSize,
  retry = true
}) {
  const accessToken = await fetchGoogleAccessToken();
  const metadata = {
    name: originalName
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const metadataPart = JSON.stringify(metadata);
  const form = new FormData();
  form.append("metadata", metadataPart, {
    contentType: "application/json; charset=UTF-8"
  });
  form.append("file", createReadStream(localPath), {
    filename: originalName,
    contentType: mimeType || "application/octet-stream",
    knownLength: Number.isFinite(Number(fileSize)) ? Number(fileSize) : undefined
  });

  const response = await axios.post(`${GOOGLE_DRIVE_UPLOAD_BASE}?uploadType=multipart`, form, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...form.getHeaders()
    },
    params: {
      fields: "id,name,size,mimeType,webViewLink",
      supportsAllDrives: true
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 0,
    validateStatus: () => true
  });

  if (response.status === 401 && retry) {
    await fetchGoogleAccessToken({ forceRefresh: true });
    return uploadFileToGoogleDrive({
      localPath,
      originalName,
      mimeType,
      folderId,
      fileSize,
      retry: false
    });
  }

  if (response.status < 200 || response.status >= 300 || !response.data?.id) {
    const detail =
      response.data?.error?.message || `Google Drive upload gagal (HTTP ${response.status}).`;
    throw new Error(detail);
  }

  return {
    id: String(response.data.id || "").trim(),
    name: String(response.data.name || originalName).trim(),
    size: Number(response.data.size || fileSize || 0) || null,
    mimeType: String(response.data.mimeType || mimeType || "").trim(),
    webViewLink: String(response.data.webViewLink || "").trim()
  };
}

function collectDramaGoogleDriveFileIds(drama) {
  const ids = new Set();
  for (const episode of drama?.episodes || []) {
    const fileId = extractGoogleDriveId(episode?.gdriveFileId);
    if (fileId) {
      ids.add(fileId);
    }
  }

  return [...ids];
}

async function deleteGoogleDriveFile(fileId, { retry = true } = {}) {
  const accessToken = await fetchGoogleAccessToken();
  const response = await axios.delete(`${GOOGLE_DRIVE_FILE_BASE}/${encodeURIComponent(fileId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    params: {
      supportsAllDrives: true
    },
    timeout: 30_000,
    validateStatus: () => true
  });

  if (response.status === 401 && retry) {
    await fetchGoogleAccessToken({ forceRefresh: true });
    return deleteGoogleDriveFile(fileId, { retry: false });
  }

  if (response.status === 204 || response.status === 200) {
    return {
      deleted: true,
      notFound: false
    };
  }

  if (response.status === 404) {
    return {
      deleted: false,
      notFound: true
    };
  }

  const detail =
    response.data?.error?.message || `Gagal menghapus file Google Drive (HTTP ${response.status}).`;
  throw new Error(detail);
}

async function resolveTelegramFileUrl(fileId) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN belum di-set di file .env.");
  }

  const normalizedFileId = String(fileId || "").trim();
  if (!normalizedFileId) {
    throw new Error("telegramFileId kosong.");
  }

  if (filePathCache.has(normalizedFileId)) {
    return filePathCache.get(normalizedFileId);
  }

  const getFileUrl = `${TELEGRAM_API_BASE}/getFile?file_id=${encodeURIComponent(normalizedFileId)}`;
  const response = await fetch(getFileUrl);

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || !payload.result?.file_path) {
    const detail = payload?.description || `Gagal memanggil Telegram getFile (HTTP ${response.status}).`;
    const error = new Error(detail);
    error.statusCode = payload?.error_code || response.status || 500;
    throw error;
  }

  const streamUrl = `${TELEGRAM_FILE_BASE}/${payload.result.file_path}`;
  filePathCache.set(normalizedFileId, streamUrl);

  return streamUrl;
}

async function callTelegramMultipart(methodName, formData) {
  const response = await axios.post(`${TELEGRAM_API_BASE}/${methodName}`, formData, {
    headers: formData.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 0,
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Telegram ${methodName} gagal (HTTP ${response.status}).`);
  }

  if (!response.data?.ok) {
    throw new Error(response.data?.description || `Telegram ${methodName} gagal.`);
  }

  return response.data.result;
}

async function uploadVideoToTelegramChannel(filePath, fileName, mimeType, caption) {
  let result = null;
  let usedMethod = "sendVideo";

  const videoForm = new FormData();
  videoForm.append("chat_id", TELEGRAM_CHANNEL_ID);
  videoForm.append("caption", caption);
  videoForm.append("supports_streaming", "true");
  videoForm.append("video", createReadStream(filePath), {
    filename: fileName,
    contentType: mimeType || "application/octet-stream"
  });

  try {
    result = await callTelegramMultipart("sendVideo", videoForm);
  } catch {
    usedMethod = "sendDocument";
    const documentForm = new FormData();
    documentForm.append("chat_id", TELEGRAM_CHANNEL_ID);
    documentForm.append("caption", caption);
    documentForm.append("document", createReadStream(filePath), {
      filename: fileName,
      contentType: mimeType || "application/octet-stream"
    });
    result = await callTelegramMultipart("sendDocument", documentForm);
  }

  const fileId = result.video?.file_id || result.document?.file_id;
  const fileSize = Number(result.video?.file_size || result.document?.file_size || 0) || null;
  if (!fileId) {
    throw new Error("Telegram tidak mengembalikan file_id.");
  }

  return {
    fileId,
    fileSize,
    method: usedMethod,
    messageId: result.message_id
  };
}

function buildTelegramPosterProxyUrl(fileId) {
  return `/api/posters/telegram/${encodeURIComponent(String(fileId || "").trim())}`;
}

async function uploadPosterToTelegramChannel(filePath, fileName, mimeType, caption = "") {
  const photoForm = new FormData();
  photoForm.append("chat_id", TELEGRAM_CHANNEL_ID);
  if (caption) {
    photoForm.append("caption", caption);
  }
  photoForm.append("photo", createReadStream(filePath), {
    filename: fileName,
    contentType: mimeType || "application/octet-stream"
  });

  const result = await callTelegramMultipart("sendPhoto", photoForm);
  const photos = Array.isArray(result.photo) ? result.photo : [];
  const bestPhoto = photos[photos.length - 1] || null;
  const fileId = String(bestPhoto?.file_id || "").trim();
  const fileSize = Number(bestPhoto?.file_size || 0) || null;
  if (!fileId) {
    throw new Error("Telegram tidak mengembalikan file_id poster.");
  }

  return {
    fileId,
    fileSize,
    messageId: result.message_id
  };
}

async function cleanupTempFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return;
  }

  await Promise.allSettled(
    files
      .map((file) => file?.path)
      .filter(Boolean)
      .map((tmpPath) => unlink(tmpPath))
  );
}

app.get("/api/library", async (_, res) => {
  try {
    const library = await readLibrary();
    const sanitized = sanitizeLibrary(library);
    sanitized.dramas = sanitized.dramas.filter(
      (drama) => normalizePublishStatus(drama.publishStatus, "private") === "published"
    );
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({
      message: "Gagal membaca daftar drama.",
      detail: error.message
    });
  }
});

app.get("/api/public-config", (_, res) => {
  res.setHeader("cache-control", "no-store");
  res.json(getPublicAppConfig());
});

app.get("/api/analytics/stats", async (_, res) => {
  try {
    const store = await readAnalyticsStore();
    return res.json(sanitizeAnalyticsStatsPayload(store));
  } catch (error) {
    return res.status(500).json({
      message: "Gagal membaca statistik pengunjung.",
      detail: error.message
    });
  }
});

app.post("/api/analytics/visit", async (req, res) => {
  try {
    const viewerId = getViewerIdFromRequest(req);
    const stats = await trackWebsiteVisit(viewerId);
    return res.json({
      message: "Kunjungan berhasil dicatat.",
      viewerId,
      stats
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal mencatat kunjungan.",
      detail: error.message
    });
  }
});

app.post("/api/analytics/drama-click", async (req, res) => {
  try {
    const dramaId = normalizeAnalyticsKey(req.body?.dramaId || req.query?.dramaId);
    if (!dramaId) {
      return res.status(400).json({
        message: "dramaId wajib diisi."
      });
    }

    const stats = await trackDramaClick(dramaId);
    return res.json({
      message: "Klik drama berhasil dicatat.",
      dramaId,
      stats
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal mencatat klik drama.",
      detail: error.message
    });
  }
});

app.post("/api/analytics/episode-click", async (req, res) => {
  try {
    const dramaId = normalizeAnalyticsKey(req.body?.dramaId || req.query?.dramaId);
    const episodeNumber = normalizeEpisodeNumberKey(req.body?.episodeNumber || req.query?.episodeNumber);
    if (!dramaId) {
      return res.status(400).json({
        message: "dramaId wajib diisi."
      });
    }

    if (!episodeNumber) {
      return res.status(400).json({
        message: "episodeNumber wajib berupa angka positif."
      });
    }

    const stats = await trackEpisodeClick(dramaId, episodeNumber);
    return res.json({
      message: "Klik episode berhasil dicatat.",
      dramaId,
      episodeNumber: Number(episodeNumber),
      stats
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal mencatat klik episode.",
      detail: error.message
    });
  }
});

app.get("/api/youtube/verification/config", async (req, res) => {
  try {
    const viewerId = getViewerIdFromRequest(req);
    let warning = "";
    if (YOUTUBE_SUBSCRIBE_GATE_ENABLED) {
      try {
        assertYoutubeGateConfig();
      } catch (error) {
        warning = error.message;
      }
    }

    return res.json({
      enabled: YOUTUBE_SUBSCRIBE_GATE_ENABLED,
      viewerId,
      minEpisode: YOUTUBE_SUBSCRIBE_MIN_EPISODE,
      requiredChannelId: YOUTUBE_REQUIRED_CHANNEL_ID,
      requiredChannelUrl: buildYoutubeChannelUrl(),
      oauthRedirectUri: resolveYoutubeOAuthRedirectUri(req),
      warning
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal membaca konfigurasi verifikasi YouTube.",
      detail: error.message
    });
  }
});

app.get("/api/youtube/verification/status", async (req, res) => {
  try {
    const viewerId = getViewerIdFromRequest(req);
    const status = await getYoutubeViewerVerificationStatus(viewerId);
    return res.json(status);
  } catch (error) {
    return res.status(500).json({
      message: "Gagal membaca status verifikasi YouTube.",
      detail: error.message
    });
  }
});

app.post("/api/youtube/verification/start", async (req, res) => {
  try {
    assertYoutubeGateConfig({ requireOAuth: true });
    const viewerId = getViewerIdFromRequest(req);
    if (!viewerId) {
      return res.status(400).json({
        message: "viewerId wajib diisi untuk verifikasi YouTube."
      });
    }

    const currentStatus = await getYoutubeViewerVerificationStatus(viewerId);
    if (currentStatus.verified) {
      return res.json({
        message: "Viewer sudah terverifikasi subscribe.",
        alreadyVerified: true,
        ...currentStatus
      });
    }

    const redirectUri = resolveYoutubeOAuthRedirectUri(req);
    const stateKey = createYoutubeOauthState(viewerId);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", YOUTUBE_OAUTH_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", YOUTUBE_OAUTH_SCOPE);
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("access_type", "online");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", stateKey);

    return res.json({
      message: "URL verifikasi YouTube berhasil dibuat.",
      authUrl: authUrl.toString(),
      redirectUri,
      stateExpiresInSeconds: YOUTUBE_OAUTH_STATE_TTL_SECONDS,
      viewerId,
      minEpisode: YOUTUBE_SUBSCRIBE_MIN_EPISODE,
      requiredChannelId: YOUTUBE_REQUIRED_CHANNEL_ID,
      requiredChannelUrl: buildYoutubeChannelUrl()
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal memulai verifikasi YouTube.",
      detail: error.message
    });
  }
});

app.get("/api/youtube/oauth/callback", async (req, res) => {
  const stateKey = String(req.query?.state || "").trim();
  const oauthError = String(req.query?.error || "").trim();
  const code = String(req.query?.code || "").trim();

  try {
    assertYoutubeGateConfig({ requireOAuth: true });
    const statePayload = consumeYoutubeOauthState(stateKey);
    if (!statePayload?.viewerId) {
      const html = renderYoutubeOauthCallbackPage({
        success: false,
        verified: false,
        message: "State verifikasi tidak valid atau sudah kadaluarsa.",
        viewerId: ""
      });
      return res.status(400).send(html);
    }

    const viewerId = statePayload.viewerId;
    if (oauthError) {
      const oauthErrorMessage = humanizeYoutubeOauthError(oauthError);
      const html = renderYoutubeOauthCallbackPage({
        success: false,
        verified: false,
        message: oauthErrorMessage || `Login Google dibatalkan: ${oauthError}`,
        viewerId
      });
      return res.status(400).send(html);
    }

    if (!code) {
      const html = renderYoutubeOauthCallbackPage({
        success: false,
        verified: false,
        message: "Kode OAuth tidak ditemukan.",
        viewerId
      });
      return res.status(400).send(html);
    }

    const redirectUri = resolveYoutubeOAuthRedirectUri(req);
    const oauthToken = await exchangeYoutubeOAuthCode({
      code,
      redirectUri
    });
    const verification = await verifyYoutubeSubscriptionByAccessToken(oauthToken.accessToken);

    const store = await readYoutubeVerificationStore();
    store.records[viewerId] = {
      viewerId,
      channelId: YOUTUBE_REQUIRED_CHANNEL_ID,
      verified: verification.isSubscribed,
      checkedAt: new Date().toISOString(),
      source: "youtube_oauth",
      youtubeChannelId: verification.youtubeChannelId
    };
    await writeYoutubeVerificationStore(store);

    const html = renderYoutubeOauthCallbackPage({
      success: true,
      verified: verification.isSubscribed,
      message: verification.isSubscribed
        ? "Akun YouTube terdeteksi sudah subscribe. Kamu bisa lanjut nonton."
        : "Akun YouTube belum subscribe ke channel yang diwajibkan.",
      viewerId
    });
    return res.send(html);
  } catch (error) {
    const html = renderYoutubeOauthCallbackPage({
      success: false,
      verified: false,
      message: `Verifikasi gagal: ${error.message}`,
      viewerId: ""
    });
    return res.status(500).send(html);
  }
});

app.get("/api/posters/telegram/:fileId", async (req, res) => {
  try {
    const fileId = decodeURIComponent(String(req.params.fileId || "").trim());
    if (!fileId) {
      return res.status(400).json({ message: "fileId poster wajib diisi." });
    }

    const streamUrl = await resolveTelegramFileUrl(fileId);
    const telegramResponse = await axios.get(streamUrl, {
      responseType: "stream",
      timeout: 30_000,
      validateStatus: () => true
    });

    if (telegramResponse.status < 200 || telegramResponse.status >= 300 || !telegramResponse.data) {
      const detail =
        telegramResponse.statusText ||
        `Gagal mengambil poster dari Telegram (HTTP ${telegramResponse.status}).`;
      throw new Error(detail);
    }

    const contentType = String(telegramResponse.headers?.["content-type"] || "").trim();
    if (contentType) {
      res.setHeader("content-type", contentType);
    }

    const contentLength = String(telegramResponse.headers?.["content-length"] || "").trim();
    if (contentLength) {
      res.setHeader("content-length", contentLength);
    }

    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    telegramResponse.data.pipe(res);
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil poster Telegram.",
      detail: error.message
    });
  }
});

app.get("/api/stream/:dramaId/:episodeNumber", async (req, res) => {
  try {
    if (!isLikelyApiFetchRequest(req)) {
      return res.status(403).json({
        message: "Akses ditolak: endpoint stream hanya untuk request API dari player."
      });
    }

    const { dramaId, episodeNumber } = req.params;
    const episodeNumberAsInt = Number(episodeNumber);

    if (Number.isNaN(episodeNumberAsInt)) {
      return res.status(400).json({ message: "Parameter episodeNumber harus angka." });
    }

    const library = await readLibrary();
    const drama = findDrama(library, dramaId);

    if (!drama) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    const isAdminPreview = isAdminAuthorizedRequest(req);
    if (
      normalizePublishStatus(drama.publishStatus, "private") !== "published" &&
      !isAdminPreview
    ) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    const episode = findEpisode(drama, episodeNumberAsInt);
    if (!episode) {
      return res.status(404).json({ message: "Episode tidak ditemukan." });
    }

    if (isEpisodeManuallyLocked(episode) && !isAdminPreview) {
      const lockReason = getEpisodeManualLockReason(episode);
      return res.status(403).json({
        message: "Episode ini sedang dikunci admin.",
        lockRequired: true,
        lockType: "episode_manual",
        episodeNumber: Number(episode.number),
        lockReason
      });
    }

    if (isYoutubeGateRequiredForEpisode(episode.number) && !isAdminPreview) {
      try {
        assertYoutubeGateConfig();
      } catch (configError) {
        return res.status(500).json({
          message: "Konfigurasi verifikasi YouTube belum lengkap.",
          detail: configError.message
        });
      }

      const viewerId = getViewerIdFromRequest(req);
      const verification = await getYoutubeViewerVerificationStatus(viewerId);
      if (!viewerId || !verification.verified) {
        const minEpisode = Math.max(1, Number(YOUTUBE_SUBSCRIBE_MIN_EPISODE) || 10);
        return res.status(403).json({
          message: `Akses episode ${minEpisode}+ dikunci. Verifikasi subscribe YouTube terlebih dahulu.`,
          verifyRequired: true,
          viewerId,
          minEpisode,
          episodeNumber: Number(episode.number),
          requiredChannelId: YOUTUBE_REQUIRED_CHANNEL_ID,
          requiredChannelUrl: buildYoutubeChannelUrl(),
          verifyApi: {
            config: "/api/youtube/verification/config",
            status: "/api/youtube/verification/status",
            start: "/api/youtube/verification/start"
          }
        });
      }
    }

    const streamSessionId = getOrCreateStreamSessionId(req, res);
    const userAgentFingerprint = buildUserAgentFingerprint(req.headers["user-agent"]);
    const issueStreamToken = ({ source, fileId }) => {
      const token = createStreamToken({
        source,
        fileId,
        sessionId: streamSessionId,
        ua: userAgentFingerprint
      });

      return {
        streamUrl: buildSecureStreamUrl(token),
        expiresInSeconds: STREAM_TOKEN_TTL_SECONDS
      };
    };

    const source = normalizeEpisodeSource(episode);
    if (source === "gdrive") {
      assertGoogleDriveConfig();
      const gdriveFileId = extractGoogleDriveId(episode.gdriveFileId);
      if (!gdriveFileId) {
        return res.status(404).json({
          message: "Episode source Google Drive, tetapi gdriveFileId belum diisi."
        });
      }

      return res.json(issueStreamToken({ source: "gdrive", fileId: gdriveFileId }));
    }

    if (!episode.telegramFileId) {
      if (hasValidGdriveFileId(episode)) {
        assertGoogleDriveConfig();
        await maybeSwitchEpisodeSourceToGdrive(library, drama, episode, { force: true });
        const gdriveFileId = extractGoogleDriveId(episode.gdriveFileId);
        if (!gdriveFileId) {
          return res.status(404).json({
            message: "Fallback Google Drive gagal: gdriveFileId tidak valid."
          });
        }

        return res.json(issueStreamToken({ source: "gdrive", fileId: gdriveFileId }));
      }

      return res.status(404).json({
        message: "Video episode ini belum dihubungkan ke Telegram."
      });
    }

    const openInTelegramUrl = buildTelegramMessageUrl(TELEGRAM_CHANNEL_ID, episode.telegramMessageId);
    if (
      Number.isFinite(Number(episode.telegramFileSize)) &&
      Number(episode.telegramFileSize) > TELEGRAM_STREAM_LIMIT_BYTES
    ) {
      if (hasValidGdriveFileId(episode) && AUTO_SWITCH_TO_GDRIVE_ON_TELEGRAM_ERROR) {
        assertGoogleDriveConfig();
        await maybeSwitchEpisodeSourceToGdrive(library, drama, episode);
        const gdriveFileId = extractGoogleDriveId(episode.gdriveFileId);
        if (!gdriveFileId) {
          return res.status(404).json({
            message: "Fallback Google Drive gagal: gdriveFileId tidak valid."
          });
        }

        return res.json({
          ...issueStreamToken({ source: "gdrive", fileId: gdriveFileId }),
          detail: `Telegram file terlalu besar (${bytesToMb(episode.telegramFileSize)}MB). Fallback ke Google Drive.`
        });
      }

      return res.status(422).json({
        message: "Video Telegram terlalu besar untuk diputar lewat Bot API.",
        detail: `Ukuran video ${bytesToMb(episode.telegramFileSize)}MB melebihi batas ${TELEGRAM_STREAM_LIMIT_MB}MB.`,
        openInTelegramUrl
      });
    }

    let streamUrl = "";
    try {
      streamUrl = await resolveTelegramFileUrl(episode.telegramFileId);
    } catch (telegramError) {
      if (hasValidGdriveFileId(episode) && AUTO_SWITCH_TO_GDRIVE_ON_TELEGRAM_ERROR) {
        assertGoogleDriveConfig();
        await maybeSwitchEpisodeSourceToGdrive(library, drama, episode);
        const gdriveFileId = extractGoogleDriveId(episode.gdriveFileId);
        if (!gdriveFileId) {
          return res.status(404).json({
            message: "Fallback Google Drive gagal: gdriveFileId tidak valid."
          });
        }

        return res.json({
          ...issueStreamToken({ source: "gdrive", fileId: gdriveFileId }),
          detail: `Telegram error: ${telegramError.message}. Fallback ke Google Drive.`
        });
      }

      throw telegramError;
    }

    if (!streamUrl) {
      return res.status(500).json({
        message: "URL stream Telegram kosong."
      });
    }

    return res.json({
      ...issueStreamToken({
        source: "telegram",
        fileId: String(episode.telegramFileId || "").trim()
      }),
      openInTelegramUrl
    });
  } catch (error) {
    if (isTelegramFileTooBigError(error)) {
      return res.status(422).json({
        message: "Video Telegram terlalu besar untuk diputar lewat Bot API.",
        detail: `Batas download bot Telegram sekitar ${TELEGRAM_STREAM_LIMIT_MB}MB. Kompres/re-encode lalu upload ulang episode.`,
        reuploadRequired: true
      });
    }

    res.status(500).json({
      message: "Gagal mendapatkan URL video Telegram.",
      detail: error.message
    });
  }
});

app.get("/api/play/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Token stream wajib diisi." });
    }

    const tokenPayload = getActiveStreamToken(token);
    if (!tokenPayload) {
      return res.status(410).json({
        message: "Token stream tidak valid atau sudah kadaluarsa. Silakan request ulang endpoint /api/stream."
      });
    }

    if (!isLikelyMediaRequest(req)) {
      return res.status(403).json({
        message: "Akses stream ditolak: endpoint ini hanya untuk request media dari player."
      });
    }

    const sessionId = readStreamSessionId(req);
    if (!sessionId || sessionId !== String(tokenPayload.sessionId || "")) {
      return res.status(403).json({
        message: "Akses stream ditolak: sesi player tidak valid."
      });
    }

    if (STREAM_TOKEN_REQUIRE_SAME_UA) {
      const requestUa = buildUserAgentFingerprint(req.headers["user-agent"]);
      const tokenUa = String(tokenPayload.ua || "");
      if (!tokenUa || requestUa !== tokenUa) {
        return res.status(403).json({
          message: "Akses stream ditolak: user-agent tidak cocok."
        });
      }
    }

    const activePayload = getActiveStreamToken(token, { consume: true });
    if (!activePayload) {
      return res.status(410).json({
        message: "Token stream sudah habis dipakai atau kadaluarsa. Silakan request ulang endpoint /api/stream."
      });
    }

    const source = String(activePayload.source || "").trim().toLowerCase();
    const fileId = String(activePayload.fileId || "").trim();
    if (!fileId) {
      return res.status(400).json({ message: "Token stream tidak valid: fileId kosong." });
    }

    const incomingRange = req.headers.range;
    let upstreamResponse;

    if (source === "gdrive") {
      assertGoogleDriveConfig();
      upstreamResponse = await fetchGoogleDriveStream(fileId, incomingRange);
    } else if (source === "telegram") {
      upstreamResponse = await fetchTelegramStreamByFileId(fileId, incomingRange);
    } else {
      return res.status(400).json({ message: "Token stream tidak valid: source tidak dikenal." });
    }

    if (upstreamResponse.status < 200 || upstreamResponse.status >= 300) {
      const fallbackMessage = `${source === "gdrive" ? "Google Drive" : "Telegram"} stream gagal (HTTP ${
        upstreamResponse.status
      }).`;
      const detail = await extractUpstreamErrorDetail(upstreamResponse, fallbackMessage);
      return res.status(upstreamResponse.status).json({
        message: `Gagal stream video dari ${source === "gdrive" ? "Google Drive" : "Telegram"}.`,
        detail
      });
    }

    applyUpstreamStreamHeaders(res, upstreamResponse.headers);
    res.setHeader("cache-control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-robots-tag", "noindex, nofollow, noarchive");
    res.setHeader("content-disposition", "inline");
    res.status(upstreamResponse.status);
    upstreamResponse.data.pipe(res);
  } catch (error) {
    return res.status(500).json({
      message: "Terjadi error saat stream video.",
      detail: error.message
    });
  }
});

app.get("/api/gdrive/stream/:dramaId/:episodeNumber", async (req, res) => {
  try {
    if (!ALLOW_LEGACY_GDRIVE_STREAM_ROUTE) {
      return res.status(403).json({
        message: "Endpoint ini dinonaktifkan demi keamanan. Gunakan /api/stream lalu /api/play/:token."
      });
    }

    const { dramaId, episodeNumber } = req.params;
    const episodeNumberAsInt = Number(episodeNumber);
    if (!Number.isInteger(episodeNumberAsInt) || episodeNumberAsInt <= 0) {
      return res.status(400).json({ message: "Parameter episodeNumber harus angka positif." });
    }

    const library = await readLibrary();
    const drama = findDrama(library, dramaId);
    if (!drama) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    const isAdminPreview = isAdminAuthorizedRequest(req);
    if (
      normalizePublishStatus(drama.publishStatus, "private") !== "published" &&
      !isAdminPreview
    ) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    const episode = findEpisode(drama, episodeNumberAsInt);
    if (!episode) {
      return res.status(404).json({ message: "Episode tidak ditemukan." });
    }

    const source = normalizeEpisodeSource(episode);
    if (source !== "gdrive") {
      return res.status(400).json({ message: "Episode ini bukan source Google Drive." });
    }

    const gdriveFileId = extractGoogleDriveId(episode.gdriveFileId);
    if (!gdriveFileId) {
      return res.status(404).json({ message: "gdriveFileId belum diisi untuk episode ini." });
    }

    const incomingRange = req.headers.range;
    const driveResponse = await fetchGoogleDriveStream(gdriveFileId, incomingRange);

    if (driveResponse.status < 200 || driveResponse.status >= 300) {
      let detail = `Google Drive stream gagal (HTTP ${driveResponse.status}).`;
      if (driveResponse.data && typeof driveResponse.data.on === "function") {
        const chunks = [];
        for await (const chunk of driveResponse.data) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }

        const text = Buffer.concat(chunks).toString("utf-8");
        try {
          const parsed = JSON.parse(text);
          detail = parsed.error?.message || detail;
        } catch {
          if (text) {
            detail = text;
          }
        }
      }

      return res.status(driveResponse.status).json({
        message: "Gagal stream video dari Google Drive.",
        detail
      });
    }

    const passHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified"
    ];
    for (const headerName of passHeaders) {
      const value = driveResponse.headers?.[headerName];
      if (value) {
        res.setHeader(headerName, value);
      }
    }

    res.status(driveResponse.status);
    driveResponse.data.pipe(res);
  } catch (error) {
    res.status(500).json({
      message: "Terjadi error saat stream Google Drive.",
      detail: error.message
    });
  }
});

app.get("/api/admin/library", requireAdmin, async (_, res) => {
  try {
    const library = await readLibrary();
    res.json({
      dramas: library.dramas.map((drama) => ({
        ...drama,
        episodes: getSortedEpisodes(drama).map((episode) => ({
          ...episode,
          source: normalizeEpisodeSource(episode),
          hasVideo: hasEpisodeVideo(episode),
          locked: isEpisodeManuallyLocked(episode),
          lockReason: getEpisodeManualLockReason(episode)
        }))
      }))
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal membaca data admin library.",
      detail: error.message
    });
  }
});

app.post("/api/admin/dramas", requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const title = String(payload.title || "").trim();
    const publishNow = parseBoolean(payload.publishNow, false);
    const ensureGdriveFolder = parseBoolean(payload.ensureGdriveFolder, true);
    if (!title) {
      return res.status(400).json({ message: "Judul drama wajib diisi." });
    }

    const preferredId = String(payload.id || title).trim();
    const dramaId = slugify(preferredId);
    const payloadGdriveFolderId = extractGoogleDriveId(payload.gdriveFolderId || "");
    const payloadGdriveParentFolderId = extractGoogleDriveId(payload.gdriveParentFolderId || "");

    if (!dramaId) {
      return res.status(400).json({ message: "ID drama tidak valid." });
    }

    const library = await readLibrary();
    let drama = findDrama(library, dramaId);
    const isCreate = !drama;
    const hasPublishStatusValue =
      payload.publishStatus !== undefined &&
      payload.publishStatus !== null &&
      String(payload.publishStatus).trim() !== "";
    const requestedPublishStatus = hasPublishStatusValue
      ? normalizePublishStatus(payload.publishStatus, "private")
      : normalizePublishStatus(drama?.publishStatus, "private");
    let publishStatus = publishNow ? "published" : requestedPublishStatus;
    if (isCreate && !publishNow) {
      publishStatus = "private";
    }

    const nextDrama = {
      id: dramaId,
      title,
      year: payload.year ? Number(payload.year) || null : null,
      country: String(payload.country || "").trim(),
      synopsis: String(payload.synopsis || "").trim(),
      poster: String(payload.poster || "").trim() || DEFAULT_POSTER,
      publishStatus
    };

    if (isCreate) {
      drama = {
        ...nextDrama,
        episodes: []
      };
      library.dramas.push(drama);
    } else {
      drama.id = nextDrama.id;
      drama.title = nextDrama.title;
      drama.year = nextDrama.year;
      drama.country = nextDrama.country;
      drama.synopsis = nextDrama.synopsis;
      drama.poster = nextDrama.poster;
      drama.publishStatus = nextDrama.publishStatus;
      if (!Array.isArray(drama.episodes)) {
        drama.episodes = [];
      }
    }

    if (payloadGdriveFolderId) {
      drama.gdriveFolderId = payloadGdriveFolderId;
    }

    const currentPublishStatus = normalizePublishStatus(drama.publishStatus, "private");
    drama.publishStatus = currentPublishStatus;
    if (currentPublishStatus === "published") {
      if (publishNow || !parseTimestampMs(drama.publishedAt)) {
        const nowIso = new Date().toISOString();
        drama.publishedAt = nowIso;
        drama.publishedAtWib = formatIndonesiaDateTime(nowIso);
      } else if (!String(drama.publishedAtWib || "").trim()) {
        drama.publishedAtWib = formatIndonesiaDateTime(drama.publishedAt);
      }
    }

    let gdriveFolderInfo = {
      folderId: extractGoogleDriveId(drama.gdriveFolderId || ""),
      folderName: String(drama.gdriveFolderName || "").trim(),
      created: false,
      skipped: true,
      reason: ""
    };
    let gdriveFolderWarning = "";
    if (ensureGdriveFolder && !payloadGdriveFolderId) {
      try {
        gdriveFolderInfo = await ensureDramaFolderForMetadata(drama, {
          preferredParentFolderId: payloadGdriveParentFolderId
        });

        if (gdriveFolderInfo.skipped && gdriveFolderInfo.reason === "missing_parent_folder_for_service_account") {
          gdriveFolderWarning =
            "Folder drama Google Drive belum dibuat otomatis karena mode service_account membutuhkan GOOGLE_DRIVE_DEFAULT_FOLDER_ID (Shared Drive parent).";
        }
      } catch (driveError) {
        gdriveFolderWarning = `Gagal membuat folder drama Google Drive otomatis: ${driveError.message}`;
      }
    }

    touchDramaTimestamps(drama, { isCreate });
    await writeLibrary(library);
    res.json({
      message: "Metadata drama berhasil disimpan.",
      drama,
      gdriveFolder: gdriveFolderInfo,
      warning: gdriveFolderWarning
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal menyimpan metadata drama.",
      detail: error.message
    });
  }
});

app.delete("/api/admin/dramas/:dramaId", requireAdmin, async (req, res) => {
  try {
    const dramaId = String(req.params.dramaId || "").trim();
    const deleteFromGdrive = parseBoolean(
      req.query?.deleteFromGdrive ?? req.body?.deleteFromGdrive,
      true
    );
    if (!dramaId) {
      return res.status(400).json({ message: "dramaId wajib diisi." });
    }

    const library = await readLibrary();
    const drama = findDrama(library, dramaId);
    if (!drama) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    const gdriveFileIds = collectDramaGoogleDriveFileIds(drama);
    const dramaFolderId = extractGoogleDriveId(drama.gdriveFolderId || "");
    const defaultParentFolderId = extractGoogleDriveId(GOOGLE_DRIVE_DEFAULT_FOLDER_ID || "");
    const canDeleteDramaFolder =
      Boolean(dramaFolderId) &&
      (!defaultParentFolderId || dramaFolderId !== defaultParentFolderId);
    const gdriveDeleteResults = [];
    const gdriveFolderDeleteResult = {
      folderId: dramaFolderId || null,
      attempted: false,
      deleted: 0,
      notFound: 0,
      skipped: 0,
      reason: ""
    };
    if (deleteFromGdrive && gdriveFileIds.length) {
      assertGoogleDriveConfig();

      for (const fileId of gdriveFileIds) {
        try {
          const result = await deleteGoogleDriveFile(fileId);
          gdriveDeleteResults.push({
            fileId,
            status: result.notFound ? "not_found" : "deleted"
          });
        } catch (error) {
          gdriveDeleteResults.push({
            fileId,
            status: "failed",
            detail: error.message
          });
        }
      }

      const failedDeletions = gdriveDeleteResults.filter((item) => item.status === "failed");
      if (failedDeletions.length) {
        const detail = failedDeletions
          .slice(0, 3)
          .map((item) => `${item.fileId}: ${item.detail}`)
          .join(" | ");
        return res.status(500).json({
          message:
            "Gagal menghapus sebagian file episode di Google Drive. Drama tidak jadi dihapus agar data konsisten.",
          detail,
          dramaId,
          gdrive: {
            attempted: gdriveDeleteResults.length,
            deleted: gdriveDeleteResults.filter((item) => item.status === "deleted").length,
            notFound: gdriveDeleteResults.filter((item) => item.status === "not_found").length,
            failed: failedDeletions.length,
            results: gdriveDeleteResults,
            folder: gdriveFolderDeleteResult
          }
        });
      }
    }

    if (deleteFromGdrive && dramaFolderId) {
      if (canDeleteDramaFolder) {
        gdriveFolderDeleteResult.attempted = true;
        try {
          const folderDelete = await deleteGoogleDriveFile(dramaFolderId);
          if (folderDelete.notFound) {
            gdriveFolderDeleteResult.notFound = 1;
          } else {
            gdriveFolderDeleteResult.deleted = 1;
          }
        } catch (error) {
          return res.status(500).json({
            message:
              "Gagal menghapus folder drama di Google Drive. Drama tidak jadi dihapus agar data konsisten.",
            detail: `${dramaFolderId}: ${error.message}`,
            dramaId,
            gdrive: {
              attempted: gdriveDeleteResults.length,
              deleted: gdriveDeleteResults.filter((item) => item.status === "deleted").length,
              notFound: gdriveDeleteResults.filter((item) => item.status === "not_found").length,
              failed: 1,
              results: gdriveDeleteResults,
              folder: gdriveFolderDeleteResult
            }
          });
        }
      } else {
        gdriveFolderDeleteResult.skipped = 1;
        gdriveFolderDeleteResult.reason =
          "Folder drama sama dengan GOOGLE_DRIVE_DEFAULT_FOLDER_ID (folder parent bersama), jadi tidak dihapus.";
      }
    } else if (!deleteFromGdrive && dramaFolderId) {
      gdriveFolderDeleteResult.skipped = 1;
      gdriveFolderDeleteResult.reason = "deleteFromGdrive=false";
    }

    library.dramas = library.dramas.filter((item) => item.id !== dramaId);
    await writeLibrary(library);
    res.json({
      message: "Drama berhasil dihapus.",
      dramaId,
      deleteFromGdrive,
      gdrive: {
        attempted: gdriveDeleteResults.length,
        deleted: gdriveDeleteResults.filter((item) => item.status === "deleted").length,
        notFound: gdriveDeleteResults.filter((item) => item.status === "not_found").length,
        skipped: !deleteFromGdrive ? gdriveFileIds.length : 0,
        folder: gdriveFolderDeleteResult
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal menghapus drama.",
      detail: error.message
    });
  }
});

app.delete("/api/admin/dramas/:dramaId/episodes/:episodeNumber", requireAdmin, async (req, res) => {
  try {
    const dramaId = String(req.params.dramaId || "").trim();
    const episodeNumber = Number(req.params.episodeNumber);
    const deleteFromGdrive = parseBoolean(
      req.query?.deleteFromGdrive ?? req.body?.deleteFromGdrive,
      true
    );

    if (!dramaId) {
      return res.status(400).json({ message: "dramaId wajib diisi." });
    }

    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
      return res.status(400).json({ message: "episodeNumber harus angka positif." });
    }

    const library = await readLibrary();
    const drama = findDrama(library, dramaId);
    if (!drama) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    const episode = findEpisode(drama, episodeNumber);
    if (!episode) {
      return res.status(404).json({ message: "Episode tidak ditemukan." });
    }

    const gdriveFileId = extractGoogleDriveId(episode.gdriveFileId);
    let gdriveDeleteResult = {
      attempted: Boolean(gdriveFileId),
      deleted: 0,
      notFound: 0,
      skipped: 0
    };

    if (gdriveFileId && deleteFromGdrive) {
      assertGoogleDriveConfig();
      try {
        const result = await deleteGoogleDriveFile(gdriveFileId);
        if (result.notFound) {
          gdriveDeleteResult.notFound = 1;
        } else {
          gdriveDeleteResult.deleted = 1;
        }
      } catch (error) {
        return res.status(500).json({
          message:
            "Gagal menghapus file episode di Google Drive. Episode tidak jadi dihapus agar data konsisten.",
          detail: `${gdriveFileId}: ${error.message}`,
          dramaId,
          episodeNumber,
          gdrive: {
            attempted: 1,
            deleted: 0,
            notFound: 0,
            skipped: 0,
            failed: 1,
            fileId: gdriveFileId
          }
        });
      }
    } else if (gdriveFileId && !deleteFromGdrive) {
      gdriveDeleteResult.skipped = 1;
    }

    const beforeCount = (drama.episodes || []).length;
    drama.episodes = (drama.episodes || []).filter(
      (episode) => Number(episode.number) !== Number(episodeNumber)
    );

    if (drama.episodes.length === beforeCount) {
      return res.status(404).json({ message: "Episode tidak ditemukan." });
    }

    sortEpisodesInPlace(drama);
    touchDramaTimestamps(drama);
    await writeLibrary(library);

    res.json({
      message: "Episode berhasil dihapus.",
      dramaId,
      episodeNumber,
      deleteFromGdrive,
      gdrive: gdriveDeleteResult
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal menghapus episode.",
      detail: error.message
    });
  }
});

app.post("/api/admin/dramas/:dramaId/episodes/:episodeNumber/source", requireAdmin, async (req, res) => {
  try {
    const dramaId = String(req.params.dramaId || "").trim();
    const episodeNumber = Number(req.params.episodeNumber);
    const source = String(req.body?.source || "").trim().toLowerCase();
    const title = String(req.body?.title || "").trim();

    if (!dramaId) {
      return res.status(400).json({ message: "dramaId wajib diisi." });
    }

    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
      return res.status(400).json({ message: "episodeNumber harus angka positif." });
    }

    if (source !== "telegram" && source !== "gdrive") {
      return res.status(400).json({ message: "source harus telegram atau gdrive." });
    }

    const library = await readLibrary();
    const drama = findDrama(library, dramaId);
    if (!drama) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    if (!Array.isArray(drama.episodes)) {
      drama.episodes = [];
    }

    let episode = findEpisode(drama, episodeNumber);
    if (!episode) {
      episode = {
        number: episodeNumber,
        title: title || `Episode ${episodeNumber}`
      };
      drama.episodes.push(episode);
    }

    if (title) {
      episode.title = title;
    }

    episode.source = source;
    episode.updatedAt = new Date().toISOString();

    if (source === "gdrive") {
      const gdriveFileId = extractGoogleDriveId(req.body?.gdriveFileId || episode.gdriveFileId || "");
      if (!gdriveFileId) {
        return res.status(400).json({ message: "gdriveFileId wajib diisi untuk source gdrive." });
      }

      episode.gdriveFileId = gdriveFileId;
    } else {
      const telegramFileId = String(req.body?.telegramFileId || episode.telegramFileId || "").trim();
      if (!telegramFileId) {
        return res.status(400).json({ message: "telegramFileId wajib diisi untuk source telegram." });
      }

      episode.telegramFileId = telegramFileId;
      const telegramMessageId = Number(req.body?.telegramMessageId);
      if (Number.isInteger(telegramMessageId) && telegramMessageId > 0) {
        episode.telegramMessageId = telegramMessageId;
      }

      const telegramFileSize = Number(req.body?.telegramFileSize);
      if (Number.isFinite(telegramFileSize) && telegramFileSize > 0) {
        episode.telegramFileSize = telegramFileSize;
      }
    }

    normalizeEpisodeLockState(episode);
    sortEpisodesInPlace(drama);
    touchDramaTimestamps(drama);
    await writeLibrary(library);

    return res.json({
      message: "Source episode berhasil diperbarui.",
      dramaId,
      episode
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal memperbarui source episode.",
      detail: error.message
    });
  }
});

app.post("/api/admin/dramas/:dramaId/episodes/:episodeNumber/lock", requireAdmin, async (req, res) => {
  try {
    const dramaId = String(req.params.dramaId || "").trim();
    const episodeNumber = Number(req.params.episodeNumber);
    if (!dramaId) {
      return res.status(400).json({ message: "dramaId wajib diisi." });
    }

    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
      return res.status(400).json({ message: "episodeNumber harus angka positif." });
    }

    const library = await readLibrary();
    const drama = findDrama(library, dramaId);
    if (!drama) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    const episode = findEpisode(drama, episodeNumber);
    if (!episode) {
      return res.status(404).json({ message: "Episode tidak ditemukan." });
    }

    const hasLockedValue = Object.prototype.hasOwnProperty.call(req.body || {}, "locked");
    const locked = hasLockedValue ? parseBoolean(req.body?.locked, false) : !isEpisodeManuallyLocked(episode);
    const lockReason = String(req.body?.lockReason || "").trim();

    episode.locked = locked;
    if (locked) {
      episode.lockReason = lockReason || getEpisodeManualLockReason(episode);
    } else {
      delete episode.lockReason;
    }
    episode.updatedAt = new Date().toISOString();

    normalizeEpisodeLockState(episode);
    sortEpisodesInPlace(drama);
    touchDramaTimestamps(drama);
    await writeLibrary(library);

    return res.json({
      message: locked ? "Episode berhasil dikunci." : "Kunci episode berhasil dibuka.",
      dramaId,
      episodeNumber,
      locked,
      lockReason: getEpisodeManualLockReason(episode),
      episode
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal memperbarui lock episode.",
      detail: error.message
    });
  }
});

app.post("/api/admin/dramas/:dramaId/sync-gdrive", requireAdmin, async (req, res) => {
  try {
    assertGoogleDriveConfig();

    const dramaId = String(req.params.dramaId || "").trim();
    const folderIdFromBody = extractGoogleDriveId(req.body?.folderId || "");
    const overwriteExisting = parseBoolean(req.body?.overwriteExisting, false);
    const switchSource = parseBoolean(req.body?.switchSource, true);
    const createMissingEpisodes = parseBoolean(req.body?.createMissingEpisodes, true);
    const recursive = parseBoolean(req.body?.recursive, true);
    const recursiveDepth = Math.max(1, Math.min(12, Number(req.body?.recursiveDepth) || 6));

    if (!dramaId) {
      return res.status(400).json({ message: "dramaId wajib diisi." });
    }

    const library = await readLibrary();
    const drama = findDrama(library, dramaId);
    if (!drama) {
      return res.status(404).json({ message: "Drama tidak ditemukan." });
    }

    if (!Array.isArray(drama.episodes)) {
      drama.episodes = [];
    }
    const originalDramaFolderId = extractGoogleDriveId(drama.gdriveFolderId || "");

    let targetFolderId = extractGoogleDriveId(folderIdFromBody || drama.gdriveFolderId || "");
    const defaultParentFolderId = extractGoogleDriveId(GOOGLE_DRIVE_DEFAULT_FOLDER_ID || "");
    const hasExplicitFolderFromBody = Boolean(folderIdFromBody);
    const usingSharedParentAsDramaFolder =
      !hasExplicitFolderFromBody &&
      Boolean(targetFolderId && defaultParentFolderId) &&
      targetFolderId === defaultParentFolderId;
    let folderResolvedByDramaName = false;

    if (!targetFolderId || usingSharedParentAsDramaFolder) {
      try {
        const resolvedFolder = await ensureDramaFolderForMetadata(drama, {
          preferredParentFolderId: defaultParentFolderId
        });
        if (resolvedFolder?.folderId) {
          targetFolderId = resolvedFolder.folderId;
          folderResolvedByDramaName = true;
        }
      } catch {
        // Fallback ke env default jika auto-resolve folder gagal.
      }
    }

    if (!targetFolderId) {
      targetFolderId = defaultParentFolderId;
    }

    if (!targetFolderId) {
      return res.status(400).json({
        message: "Folder Google Drive tidak ditemukan.",
        detail: "Isi folderId di panel admin atau upload sekali via panel agar folder drama tersimpan."
      });
    }

    const driveScanResult = recursive
      ? await listGoogleDriveFolderItemsRecursive(targetFolderId, { maxDepth: recursiveDepth })
      : {
          items: await listGoogleDriveFolderFiles(targetFolderId),
          scannedFolders: 1,
          maxDepth: 1
        };
    const driveFilesRaw = driveScanResult.items;
    const normalizedDriveFiles = driveFilesRaw.map((file) => normalizeDriveFileForVideo(file));
    const driveFiles = normalizedDriveFiles.filter((file) => file.isVideo);
    const mimeBreakdown = {};
    for (const item of normalizedDriveFiles) {
      const key = String(item.sourceMimeType || item.mimeType || "unknown").trim() || "unknown";
      mimeBreakdown[key] = (Number(mimeBreakdown[key]) || 0) + 1;
    }
    const filesByEpisode = new Map();

    for (const file of driveFiles) {
      const name = String(file.name || "").trim();
      if (!name) {
        continue;
      }

      const episodeNumber = parseEpisodeNumberFromFileName(name);
      if (!episodeNumber) {
        continue;
      }

      if (!filesByEpisode.has(episodeNumber)) {
        filesByEpisode.set(episodeNumber, []);
      }

      filesByEpisode.get(episodeNumber).push(file);
    }

    for (const group of filesByEpisode.values()) {
      group.sort((a, b) => naturalSort.compare(String(a.name || ""), String(b.name || "")));
    }

    const sortedEpisodeNumbers = [...filesByEpisode.keys()].sort((a, b) => a - b);
    const results = [];
    let changed = false;

    for (const episodeNumber of sortedEpisodeNumbers) {
      const candidates = filesByEpisode.get(episodeNumber) || [];
      if (!candidates.length) {
        continue;
      }

      const targetFile = candidates[0];
      const existingEpisode = findEpisode(drama, episodeNumber);
      if (!existingEpisode && !createMissingEpisodes) {
        results.push({
          episodeNumber,
          status: "skipped",
          reason: "Episode belum ada di metadata dan createMissingEpisodes=false."
        });
        continue;
      }

      if (!overwriteExisting && String(existingEpisode?.gdriveFileId || "").trim()) {
        results.push({
          episodeNumber,
          status: "skipped",
          reason: "Episode sudah punya gdriveFileId. Aktifkan overwriteExisting untuk menimpa."
        });
        continue;
      }

      const episodeTitle = cleanEpisodeTitle(String(targetFile.name || ""), episodeNumber);
      const episode = existingEpisode || {
        number: episodeNumber,
        title: episodeTitle
      };
      if (!existingEpisode) {
        drama.episodes.push(episode);
      }

      episode.title = episodeTitle;
      episode.gdriveFileId = String(targetFile.id || "").trim();
      episode.gdriveFileName = String(targetFile.name || "").trim();
      episode.gdriveFileSize = Number(targetFile.size || 0) || null;
      episode.gdriveMimeType = String(targetFile.mimeType || "").trim();
      episode.gdriveWebViewLink = String(targetFile.webViewLink || "").trim();
      if (switchSource) {
        episode.source = "gdrive";
      }
      episode.updatedAt = new Date().toISOString();
      changed = true;

      results.push({
        episodeNumber,
        status: existingEpisode ? "updated" : "created",
        fileName: episode.gdriveFileName,
        gdriveFileId: episode.gdriveFileId
      });
    }

    if (extractGoogleDriveId(drama.gdriveFolderId || "") !== targetFolderId) {
      drama.gdriveFolderId = targetFolderId;
      changed = true;
    }

    if (!changed && folderResolvedByDramaName && originalDramaFolderId !== targetFolderId) {
      changed = true;
    }

    if (changed) {
      sortEpisodesInPlace(drama);
      touchDramaTimestamps(drama);
      await writeLibrary(library);
    }

    let warningMessage = "";
    const subfoldersCount = normalizedDriveFiles.filter(
      (item) => String(item.sourceMimeType || item.mimeType || "").trim() === "application/vnd.google-apps.folder"
    ).length;

    if (driveFiles.length === 0 && driveFilesRaw.length > 0) {
      warningMessage =
        "Tidak ada file video yang cocok. Cek mimeBreakdown di response; kemungkinan isi folder adalah subfolder/format non-video/shortcut tidak valid.";
    } else if (driveFiles.length > 0 && sortedEpisodeNumbers.length === 0) {
      warningMessage =
        "File video ditemukan, tapi nomor episode tidak terbaca dari nama file. Gunakan format nama yang mengandung angka episode (contoh: EP1, Episode 1, 001).";
    }

    return res.json({
      message: "Sinkronisasi Google Drive selesai.",
      dramaId,
      folderId: targetFolderId,
      overwriteExisting,
      switchSource,
      createMissingEpisodes,
      folderResolvedByDramaName,
      recursive,
      recursiveDepth: driveScanResult.maxDepth,
      stats: {
        scannedFolders: driveScanResult.scannedFolders,
        subfoldersFound: subfoldersCount,
        totalFolderItems: driveFilesRaw.length,
        totalDriveVideoFiles: driveFiles.length,
        updated: results.filter((item) => item.status === "updated").length,
        created: results.filter((item) => item.status === "created").length,
        skipped: results.filter((item) => item.status === "skipped").length
      },
      mimeBreakdown,
      results,
      warning: warningMessage
    });
  } catch (error) {
    const help = buildGdriveErrorHelp(error.message);
    return res.status(500).json({
      message: "Gagal sinkronisasi Google Drive.",
      detail: help ? `${error.message} ${help}` : error.message
    });
  }
});

app.post("/api/admin/dramas/:dramaId/auto-map-gdrive", requireAdmin, async (req, res) => {
  try {
    return res.status(410).json({
      message: "Fitur Auto Map Folder Google Drive sudah dinonaktifkan."
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal memproses endpoint auto-map.",
      detail: error.message
    });
  }
});

app.post(
  "/api/admin/dramas/:dramaId/upload-episodes-gdrive",
  requireAdmin,
  upload.array("videos", 200),
  async (req, res) => {
    const uploadedFiles = req.files || [];

    try {
      if (!uploadedFiles.length) {
        return res.status(400).json({ message: "Belum ada file video yang dipilih." });
      }

      const dramaId = String(req.params.dramaId || "").trim();
      const folderId = extractGoogleDriveId(req.body?.folderId || GOOGLE_DRIVE_DEFAULT_FOLDER_ID || "");
      const authMode = assertGoogleDriveConfig();
      const detectFromFilename = parseBoolean(req.body?.detectFromFilename, true);
      const overwriteExisting = parseBoolean(req.body?.overwriteExisting, false);
      const switchSource = parseBoolean(req.body?.switchSource, true);
      const createDramaSubfolder = parseBoolean(
        req.body?.createDramaSubfolder,
        GOOGLE_DRIVE_AUTO_DRAMA_SUBFOLDER
      );

      if (authMode === "service_account" && !folderId) {
        return res.status(400).json({
          message: "Untuk Service Account, folderId wajib diisi dan harus folder Shared Drive.",
          detail:
            "Service Account tidak punya kuota My Drive. Isi folderId Shared Drive atau ganti ke GOOGLE_DRIVE_AUTH_MODE=oauth_refresh."
        });
      }

      if (authMode === "service_account" && folderId) {
        const folderMetadata = await getGoogleDriveFileMetadata(folderId);
        const mimeType = String(folderMetadata?.mimeType || "").trim();
        if (mimeType !== "application/vnd.google-apps.folder") {
          return res.status(400).json({
            message: "folderId bukan folder Google Drive yang valid.",
            detail: "Isi folderId tujuan upload yang benar."
          });
        }

        const driveId = String(folderMetadata?.driveId || "").trim();
        if (!driveId) {
          return res.status(400).json({
            message: "folderId bukan folder Shared Drive.",
            detail:
              "Service Account tidak bisa upload ke My Drive. Pindahkan target ke Shared Drive atau gunakan GOOGLE_DRIVE_AUTH_MODE=oauth_refresh."
          });
        }
      }

      const library = await readLibrary();
      const drama = findDrama(library, dramaId);
      if (!drama) {
        return res.status(404).json({ message: "Drama tidak ditemukan." });
      }

      if (!Array.isArray(drama.episodes)) {
        drama.episodes = [];
      }

      let uploadFolderId = folderId;
      let uploadFolderName = "";
      let dramaFolderCreated = false;
      if (createDramaSubfolder) {
        const dramaFolder = await ensureGoogleDriveDramaFolder({
          drama,
          parentFolderId: folderId
        });
        uploadFolderId = dramaFolder.id;
        uploadFolderName = dramaFolder.name;
        dramaFolderCreated = Boolean(dramaFolder.created);
      }

      const startEpisodeRaw = String(req.body?.startEpisode ?? "").trim();
      const hasManualStartEpisode = startEpisodeRaw !== "";
      const startEpisode = hasManualStartEpisode
        ? Math.max(1, Number(startEpisodeRaw) || 1)
        : getNextEpisodeNumber(drama);

      const assignments = computeEpisodeAssignments(uploadedFiles, startEpisode, detectFromFilename);
      const results = [];
      let changed = false;

      for (const assignment of assignments) {
        const { file, episodeNumber, episodeTitle } = assignment;
        const existingEpisode = findEpisode(drama, episodeNumber);

        if (!overwriteExisting && String(existingEpisode?.gdriveFileId || "").trim()) {
          results.push({
            fileName: file.originalname,
            episodeNumber,
            episodeTitle: existingEpisode.title || episodeTitle,
            status: "skipped",
            reason: "Episode sudah punya gdriveFileId. Aktifkan overwrite bila ingin ganti."
          });
          continue;
        }

        const uploaded = await uploadFileToGoogleDrive({
          localPath: file.path,
          originalName: file.originalname,
          mimeType: file.mimetype,
          folderId: uploadFolderId,
          fileSize: file.size
        });

        if (existingEpisode) {
          existingEpisode.title = episodeTitle;
          existingEpisode.gdriveFileId = uploaded.id;
          existingEpisode.gdriveFileName = uploaded.name;
          existingEpisode.gdriveFileSize = uploaded.size;
          existingEpisode.gdriveMimeType = uploaded.mimeType;
          existingEpisode.gdriveWebViewLink = uploaded.webViewLink;
          if (switchSource) {
            existingEpisode.source = "gdrive";
          }
          existingEpisode.updatedAt = new Date().toISOString();
        } else {
          drama.episodes.push({
            number: episodeNumber,
            title: episodeTitle,
            source: switchSource ? "gdrive" : "telegram",
            gdriveFileId: uploaded.id,
            gdriveFileName: uploaded.name,
            gdriveFileSize: uploaded.size,
            gdriveMimeType: uploaded.mimeType,
            gdriveWebViewLink: uploaded.webViewLink,
            updatedAt: new Date().toISOString()
          });
        }

        changed = true;
        results.push({
          fileName: file.originalname,
          episodeNumber,
          episodeTitle,
          status: "uploaded",
          gdriveFileId: uploaded.id,
          gdriveFileName: uploaded.name,
          gdriveFileSize: uploaded.size
        });
      }

      if (uploadFolderId && extractGoogleDriveId(drama.gdriveFolderId || "") !== uploadFolderId) {
        drama.gdriveFolderId = uploadFolderId;
        if (uploadFolderName) {
          drama.gdriveFolderName = uploadFolderName;
        }
        changed = true;
      }

      if (changed) {
        sortEpisodesInPlace(drama);
        touchDramaTimestamps(drama);
        await writeLibrary(library);
      }

      return res.json({
        message: "Upload episode ke Google Drive selesai.",
        dramaId,
        authMode,
        folderId: folderId || null,
        uploadFolderId: uploadFolderId || null,
        uploadFolderName: uploadFolderName || null,
        createDramaSubfolder,
        dramaFolderCreated,
        switchSource,
        detectFromFilename,
        startEpisodeUsed: startEpisode,
        stats: {
          totalFiles: assignments.length,
          uploaded: results.filter((item) => item.status === "uploaded").length,
          skipped: results.filter((item) => item.status === "skipped").length
        },
        results
      });
    } catch (error) {
      const help = buildGdriveErrorHelp(error.message);
      return res.status(500).json({
        message: "Gagal upload episode ke Google Drive.",
        detail: help ? `${error.message} ${help}` : error.message
      });
    } finally {
      await cleanupTempFiles(uploadedFiles);
    }
  }
);

app.post("/api/admin/upload-poster", requireAdmin, upload.single("posterFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File poster belum dipilih." });
    }

    if (!String(req.file.mimetype || "").startsWith("image/")) {
      await cleanupTempFiles([req.file]);
      return res.status(400).json({ message: "File poster harus berupa gambar." });
    }

    assertTelegramUploadConfig();
    const caption = `Poster upload ${new Date().toISOString()}`;
    const uploaded = await uploadPosterToTelegramChannel(
      req.file.path,
      req.file.originalname,
      req.file.mimetype,
      caption
    );
    const posterUrl = buildTelegramPosterProxyUrl(uploaded.fileId);
    const dramaId = String(req.body?.dramaId || "").trim();
    let dramaAutoSaved = false;
    let drama = null;
    let warning = "";

    if (dramaId) {
      const library = await readLibrary();
      drama = findDrama(library, dramaId);
      if (drama) {
        drama.poster = posterUrl;
        touchDramaTimestamps(drama);
        await writeLibrary(library);
        dramaAutoSaved = true;
      } else {
        warning = "Poster terupload, tetapi dramaId tidak ditemukan jadi metadata belum diupdate.";
      }
    }

    res.json({
      message: "Poster berhasil diupload ke Telegram Channel.",
      posterUrl,
      telegramFileId: uploaded.fileId,
      telegramMessageId: uploaded.messageId,
      dramaId: dramaId || null,
      dramaAutoSaved,
      warning,
      drama
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal upload poster.",
      detail: error.message
    });
  } finally {
    if (req.file?.path) {
      await cleanupTempFiles([req.file]);
    }
  }
});

app.post(
  "/api/admin/dramas/:dramaId/upload-episodes",
  requireAdmin,
  upload.array("videos", 200),
  async (req, res) => {
    const uploadedFiles = req.files || [];

    try {
      if (uploadedFiles.length) {
        await cleanupTempFiles(uploadedFiles);
      }

      return res.status(410).json({
        message: "Upload episode ke Telegram dinonaktifkan.",
        detail: "Gunakan fitur Upload Langsung ke Google Drive di panel admin."
      });
    } catch (error) {
      res.status(500).json({
        message: "Gagal memproses upload episode Telegram.",
        detail: error.message
      });
    }
  }
);

app.get("/admin", (_, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.get("/privacy", (_, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "privacy.html"));
});

app.get("/terms", (_, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "terms.html"));
});

app.get("*", (_, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

async function startServer() {
  await ensureDirectories();

  app.listen(PORT, () => {
    console.log(`TeleMiniDrama aktif di http://localhost:${PORT}`);
    if (GA4_ANALYTICS_ENABLED && isValidGa4MeasurementId(GA4_MEASUREMENT_ID)) {
      console.log(`GA4 aktif (${GA4_MEASUREMENT_ID}).`);
    } else {
      console.log("GA4 nonaktif.");
    }
    if (shouldUseFirebaseRealtimeDb()) {
      console.log(
        `Data store: Firebase RTDB (${FIREBASE_LIBRARY_PATH}, ${FIREBASE_YOUTUBE_VERIFICATIONS_PATH}, ${FIREBASE_ANALYTICS_PATH})`
      );
    } else {
      console.log(`Data store: local JSON file (${DATA_FILE})`);
    }
  });
}

if (process.env.VERCEL !== "1") {
  startServer().catch((error) => {
    console.error(`Gagal menjalankan server: ${error.message}`);
    process.exit(1);
  });
}

export default app;
