const telegram = window.Telegram?.WebApp;

if (telegram) {
  telegram.ready();
  telegram.expand();
  telegram.setHeaderColor("#0f2330");
}

const FAVORITES_KEY = "teleminidrama_favorites";
const WATCH_PROGRESS_KEY = "teleminidrama_watch_progress_v1";
const SAVED_HISTORY_KEY = "teleminidrama_saved_history_v1";
const WATCH_PROGRESS_SAVE_INTERVAL_MS = 5000;
const ADMIN_PREVIEW_TOKEN_KEY = "teleminidrama_admin_preview_token";
const LIBRARY_REALTIME_POLL_MS = 7000;
const YOUTUBE_VIEWER_ID_KEY = "top_film_one_viewer_id_v1";
const YOUTUBE_VERIFY_MESSAGE_TYPE = "top-film-one-youtube-verify";
const SUBSCRIBE_PROMO_COOLDOWN_KEY = "top_film_one_subscribe_promo_cooldown_until_v1";
const SUBSCRIBE_PROMO_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const countFormatter = new Intl.NumberFormat("id-ID");
const pageParams = new URLSearchParams(window.location.search || "");
const AD_VAST_TAG_URL =
  "https://ancientsnow.com/d.mlFpzldhGrN/vtZpGKUb/eeomb9ru/ZeUnlnkFPjTkY/4gNyTYYhwpNSz/Mwt/NkjRg/1sNDjqAq3YNiyaZqsqadWl1ZpxdzD/0-xI";
const AD_PREROLL_TIMEOUT_MS = 15000;

function getPageParam(name) {
  return String(pageParams.get(name) || "").trim();
}

const queryAdminPreviewToken = getPageParam("adminToken");
if (queryAdminPreviewToken) {
  try {
    sessionStorage.setItem(ADMIN_PREVIEW_TOKEN_KEY, queryAdminPreviewToken);
  } catch {
    // Abaikan jika sessionStorage tidak tersedia.
  }
}

const storedAdminPreviewToken = (() => {
  try {
    return String(sessionStorage.getItem(ADMIN_PREVIEW_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
})();

function generateFallbackViewerId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `web_${Date.now().toString(36)}_${random}`;
}

function getOrCreateViewerId() {
  const telegramUserId = String(telegram?.initDataUnsafe?.user?.id || "").trim();
  if (telegramUserId) {
    return `tg_${telegramUserId}`;
  }

  try {
    const existing = String(localStorage.getItem(YOUTUBE_VIEWER_ID_KEY) || "").trim();
    if (existing) {
      return existing;
    }

    const created = generateFallbackViewerId();
    localStorage.setItem(YOUTUBE_VIEWER_ID_KEY, created);
    return created;
  } catch {
    return generateFallbackViewerId();
  }
}

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)) : []);
  } catch {
    return new Set();
  }
}

function writeFavorites(values) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...values]));
}

function readSavedHistory() {
  try {
    const raw = localStorage.getItem(SAVED_HISTORY_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const cleaned = {};
    for (const [dramaId, timestamp] of Object.entries(parsed)) {
      const safeDramaId = String(dramaId || "").trim();
      if (!safeDramaId) {
        continue;
      }

      cleaned[safeDramaId] = String(timestamp || "").trim();
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeSavedHistory(history) {
  localStorage.setItem(SAVED_HISTORY_KEY, JSON.stringify(history || {}));
}

function readWatchProgress() {
  try {
    const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const cleaned = {};
    for (const [dramaId, entry] of Object.entries(parsed)) {
      if (!dramaId || !entry || typeof entry !== "object") {
        continue;
      }

      const episodeNumber = Number(entry.episodeNumber);
      const timeSec = Number(entry.timeSec);
      if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
        continue;
      }

      cleaned[dramaId] = {
        episodeNumber,
        timeSec: Number.isFinite(timeSec) && timeSec > 0 ? Math.floor(timeSec) : 0,
        updatedAt: String(entry.updatedAt || "")
      };
    }

    return cleaned;
  } catch {
    return {};
  }
}

function writeWatchProgress(progressByDrama) {
  localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(progressByDrama || {}));
}

function readSubscribePromoCooldownUntil() {
  try {
    const raw = Number(localStorage.getItem(SUBSCRIBE_PROMO_COOLDOWN_KEY) || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}

function writeSubscribePromoCooldownUntil(value) {
  try {
    localStorage.setItem(SUBSCRIBE_PROMO_COOLDOWN_KEY, String(Math.max(0, Number(value) || 0)));
  } catch {
    // Abaikan jika localStorage tidak tersedia.
  }
}

const state = {
  dramas: [],
  drama: null,
  currentEpisodeNumber: null,
  viewMode: "home",
  searchQuery: "",
  favorites: readFavorites(),
  savedHistory: readSavedHistory(),
  watchProgress: readWatchProgress(),
  isSeeking: false,
  pendingResumeSeconds: null,
  lastProgressSavedAt: 0,
  librarySignature: "",
  engagementSignature: "",
  realtimePollTimer: null,
  realtimePollInFlight: false,
  viewerId: getOrCreateViewerId(),
  engagement: {
    totals: {
      visits: 0,
      visitors: 0
    },
    dramaClicks: {},
    episodeClicks: {}
  },
  youtubeGate: {
    enabled: false,
    verified: true,
    checking: false,
    verifyInProgress: false,
    minEpisode: 10,
    requiredChannelId: "",
    requiredChannelUrl: "https://www.youtube.com"
  },
  youtubeVerifyPopupWindow: null,
  youtubeVerifyPopupMonitor: null,
  adminPreviewToken: queryAdminPreviewToken || storedAdminPreviewToken,
  adminPreviewEnabled:
    getPageParam("adminPreview") === "1" && Boolean(queryAdminPreviewToken || storedAdminPreviewToken),
  adminPreviewDramaId: getPageParam("dramaId") || null
};

if (state.adminPreviewEnabled && state.adminPreviewToken) {
  const safeUrl = new URL(window.location.href);
  safeUrl.searchParams.delete("adminToken");
  window.history.replaceState({}, "", `${safeUrl.pathname}${safeUrl.search}${safeUrl.hash}`);
}

const elements = {
  appTopBar: document.getElementById("appTopBar"),
  youtubeGateBar: document.getElementById("youtubeGateBar"),
  youtubeGateText: document.getElementById("youtubeGateText"),
  youtubeChannelLink: document.getElementById("youtubeChannelLink"),
  youtubeVerifyBtn: document.getElementById("youtubeVerifyBtn"),
  status: document.getElementById("status"),
  homeBtn: document.getElementById("homeBtn"),
  dramaSearch: document.getElementById("dramaSearch"),
  homeScreen: document.getElementById("homeScreen"),
  visitorStats: document.getElementById("visitorStats"),
  resumeSection: document.getElementById("resumeSection"),
  resumeGrid: document.getElementById("resumeGrid"),
  savedSection: document.getElementById("savedSection"),
  savedGrid: document.getElementById("savedGrid"),
  dramaGrid: document.getElementById("dramaGrid"),
  previewScreen: document.getElementById("previewScreen"),
  previewBackBtn: document.getElementById("previewBackBtn"),
  previewBackdrop: document.getElementById("previewBackdrop"),
  previewPoster: document.getElementById("previewPoster"),
  previewTitle: document.getElementById("previewTitle"),
  previewTag: document.getElementById("previewTag"),
  previewEpisodeCount: document.getElementById("previewEpisodeCount"),
  previewDramaClicks: document.getElementById("previewDramaClicks"),
  previewSynopsis: document.getElementById("previewSynopsis"),
  watchNowBtn: document.getElementById("watchNowBtn"),
  detailLayout: document.getElementById("detailLayout"),
  dramaPicker: document.getElementById("dramaPicker"),
  playerBackBtn: document.getElementById("playerBackBtn"),
  playerDramaTitle: document.getElementById("playerDramaTitle"),
  playerEpisodeBadge: document.getElementById("playerEpisodeBadge"),
  videoPlayer: document.getElementById("videoPlayer"),
  centerPlayBtn: document.getElementById("centerPlayBtn"),
  playerLoader: document.getElementById("playerLoader"),
  playerLoaderText: document.getElementById("playerLoaderText"),
  playerControls: document.getElementById("playerControls"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  playerCurrentTime: document.getElementById("playerCurrentTime"),
  playerSeek: document.getElementById("playerSeek"),
  playerDuration: document.getElementById("playerDuration"),
  playerHint: document.getElementById("playerHint"),
  saveDramaBtn: document.getElementById("saveDramaBtn"),
  openEpisodeSheetBtn: document.getElementById("openEpisodeSheetBtn"),
  shareDramaBtn: document.getElementById("shareDramaBtn"),
  episodeSheetBackdrop: document.getElementById("episodeSheetBackdrop"),
  episodeSheet: document.getElementById("episodeSheet"),
  episodeSheetGrid: document.getElementById("episodeSheetGrid"),
  lockNoticeBackdrop: document.getElementById("lockNoticeBackdrop"),
  lockNotice: document.getElementById("lockNotice"),
  lockNoticeTitle: document.getElementById("lockNoticeTitle"),
  lockNoticeMessage: document.getElementById("lockNoticeMessage"),
  lockNoticeChannelLink: document.getElementById("lockNoticeChannelLink"),
  lockNoticeVerifyBtn: document.getElementById("lockNoticeVerifyBtn"),
  lockNoticeCloseBtn: document.getElementById("lockNoticeCloseBtn"),
  subscribePromoBackdrop: document.getElementById("subscribePromoBackdrop"),
  subscribePromo: document.getElementById("subscribePromo"),
  subscribePromoOpenBtn: document.getElementById("subscribePromoOpenBtn"),
  subscribePromoLaterBtn: document.getElementById("subscribePromoLaterBtn"),
  imaAdContainer: document.getElementById("imaAdContainer")
};

function setStatus(message, type = "") {
  if (!elements.status) {
    return;
  }

  elements.status.textContent = message;
  elements.status.className = type ? `status ${type}` : "status";
}

function buildAdminPreviewHeaders() {
  if (!state.adminPreviewEnabled || !state.adminPreviewToken) {
    return {};
  }

  return {
    "x-admin-token": state.adminPreviewToken
  };
}

function buildViewerHeaders() {
  const viewerId = String(state.viewerId || "").trim();
  if (!viewerId) {
    return {};
  }

  return {
    "x-viewer-id": viewerId
  };
}

function buildRequestHeaders(extraHeaders = {}) {
  return {
    ...buildViewerHeaders(),
    ...buildAdminPreviewHeaders(),
    ...(extraHeaders || {})
  };
}

const GA4_SCRIPT_SRC_BASE = "https://www.googletagmanager.com/gtag/js";
let ga4BootstrappedId = "";
let adPrerollPlayed = new Set();
let imaAdsLoader = null;
let imaAdsManager = null;
let imaAdDisplayContainer = null;
let imaSdkLoaded = false;

function isValidGa4MeasurementId(value) {
  return /^G-[A-Z0-9]{5,}$/i.test(String(value || "").trim());
}

function ensureGa4ScriptTag(measurementId) {
  if (!measurementId) {
    return;
  }

  if (document.querySelector(`script[data-ga4-id="${measurementId}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `${GA4_SCRIPT_SRC_BASE}?id=${encodeURIComponent(measurementId)}`;
  script.setAttribute("data-ga4-id", measurementId);
  document.head.appendChild(script);
}

function initGa4Tracking(measurementId) {
  const safeMeasurementId = String(measurementId || "").trim();
  if (!isValidGa4MeasurementId(safeMeasurementId)) {
    return false;
  }

  if (ga4BootstrappedId === safeMeasurementId) {
    return true;
  }

  ensureGa4ScriptTag(safeMeasurementId);
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };
  window.gtag("js", new Date());
  window.gtag("config", safeMeasurementId, {
    anonymize_ip: true,
    send_page_view: true
  });
  ga4BootstrappedId = safeMeasurementId;
  return true;
}

async function setupGa4TrackingFromServerConfig() {
  try {
    const response = await fetch("/api/public-config", {
      headers: buildRequestHeaders()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return;
    }

    const enabled = Boolean(payload?.analytics?.ga4?.enabled);
    const measurementId = String(payload?.analytics?.ga4?.measurementId || "").trim();
    if (!enabled) {
      return;
    }

    initGa4Tracking(measurementId);
  } catch {
    // Abaikan error analytics eksternal agar app utama tetap jalan.
  }
}

function sendGaEvent(eventName, params = {}) {
  if (typeof window.gtag !== "function") {
    return;
  }

  try {
    window.gtag("event", String(eventName || "").trim(), params || {});
  } catch {
    // Abaikan error tracking eksternal.
  }
}

function loadImaSdk() {
  if (imaSdkLoaded || typeof window.google?.ima === "object") {
    imaSdkLoaded = true;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="imasdk.googleapis.com/js/sdkloader/ima3.js"]');
    if (existing && existing.dataset.loaded === "1") {
      imaSdkLoaded = true;
      resolve();
      return;
    }

    if (existing) {
      existing.addEventListener("load", () => {
        imaSdkLoaded = true;
        resolve();
      });
      existing.addEventListener("error", () => reject(new Error("Gagal memuat IMA SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
    script.async = true;
    script.dataset.loaded = "0";
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      imaSdkLoaded = true;
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("Gagal memuat IMA SDK")));
    document.head.appendChild(script);
  });
}

function destroyImaManager() {
  try {
    imaAdsManager?.destroy();
  } catch {
    // ignore
  }
  imaAdsManager = null;
}

async function playVastPreroll({ dramaId, episodeNumber }) {
  if (!elements.videoPlayer || !elements.imaAdContainer) {
    return { played: false, reason: "no-container" };
  }

  await loadImaSdk().catch(() => {});
  if (typeof google?.ima !== "object") {
    return { played: false, reason: "ima-unavailable" };
  }

  if (!imaAdDisplayContainer) {
    imaAdDisplayContainer = new google.ima.AdDisplayContainer(elements.imaAdContainer, elements.videoPlayer);
  }
  imaAdDisplayContainer.initialize();

  imaAdsLoader = new google.ima.AdsLoader(imaAdDisplayContainer);

  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) {
        return;
      }
      done = true;
      resolve(result);
    };

    const cleanup = () => {
      destroyImaManager();
      elements.imaAdContainer.classList.add("hidden");
      imaAdsLoader?.destroy?.();
      imaAdsLoader = null;
    };

    imaAdsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event) => {
      try {
        imaAdsManager = event.getAdsManager(elements.videoPlayer);
        imaAdsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (event) => {
          const error = event?.getError?.();
          const message = error ? `${error.getErrorCode?.() || ""} ${error.getMessage?.() || ""}`.trim() : "";
          if (message) {
            setStatus(`Iklan error: ${message}`, "error");
          }
          cleanup();
          finish({ played: false, reason: "ad-error" });
        });
        imaAdsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
          cleanup();
          finish({ played: true });
        });
        imaAdsManager.addEventListener(google.ima.AdEvent.Type.COMPLETE, () => {
          cleanup();
          finish({ played: true });
        });

        elements.imaAdContainer.classList.remove("hidden");
        imaAdsManager.init(elements.videoPlayer.clientWidth, elements.videoPlayer.clientHeight, google.ima.ViewMode.NORMAL);
        imaAdsManager.start();
      } catch {
        cleanup();
        finish({ played: false, reason: "start-failed" });
      }
    });

    imaAdsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (event) => {
      const error = event?.getError?.();
      const message = error ? `${error.getErrorCode?.() || ""} ${error.getMessage?.() || ""}`.trim() : "";
      if (message) {
        setStatus(`Iklan error: ${message}`, "error");
      }
      cleanup();
      finish({ played: false, reason: "ad-error" });
    });

    const adsRequest = new google.ima.AdsRequest();
    adsRequest.adTagUrl = AD_VAST_TAG_URL;
    adsRequest.linearAdSlotWidth = elements.videoPlayer.clientWidth;
    adsRequest.linearAdSlotHeight = elements.videoPlayer.clientHeight;
    adsRequest.nonLinearAdSlotWidth = elements.videoPlayer.clientWidth;
    adsRequest.nonLinearAdSlotHeight = Math.floor(elements.videoPlayer.clientHeight / 3);
    try {
      imaAdsLoader.requestAds(adsRequest);
    } catch {
      cleanup();
      finish({ played: false, reason: "request-failed" });
    }

    setTimeout(() => {
      cleanup();
      finish({ played: false, reason: "timeout" });
    }, AD_PREROLL_TIMEOUT_MS);
  });
}

async function maybePlayPreroll(episode) {
  if (!episode || !parseBooleanFlag(episode?.adRequired)) {
    return true;
  }
  const key = `drama:${state.drama?.id || ""}-ep:${episode.number}`;
  if (adPrerollPlayed.has(key)) {
    return true;
  }
  adPrerollPlayed.add(key);
  const result = await playVastPreroll({ dramaId: state.drama?.id, episodeNumber: episode.number });
  return Boolean(result?.played);
}

function sanitizeCountValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function normalizeDramaClickRecord(input) {
  const normalized = {};
  const source = input && typeof input === "object" ? input : {};
  for (const [dramaIdRaw, value] of Object.entries(source)) {
    const dramaId = String(dramaIdRaw || "").trim();
    if (!dramaId) {
      continue;
    }

    normalized[dramaId] = sanitizeCountValue(value);
  }

  return normalized;
}

function normalizeEpisodeClickRecord(input) {
  const normalized = {};
  const source = input && typeof input === "object" ? input : {};
  for (const [dramaIdRaw, episodeRecord] of Object.entries(source)) {
    const dramaId = String(dramaIdRaw || "").trim();
    if (!dramaId || !episodeRecord || typeof episodeRecord !== "object") {
      continue;
    }

    const normalizedEpisodes = {};
    for (const [episodeKeyRaw, value] of Object.entries(episodeRecord)) {
      const episodeKey = String(episodeKeyRaw || "").trim();
      if (!episodeKey) {
        continue;
      }

      normalizedEpisodes[episodeKey] = sanitizeCountValue(value);
    }

    normalized[dramaId] = normalizedEpisodes;
  }

  return normalized;
}

function normalizeEngagementPayload(input) {
  return {
    totals: {
      visits: sanitizeCountValue(input?.totals?.visits),
      visitors: sanitizeCountValue(input?.totals?.visitors)
    },
    dramaClicks: normalizeDramaClickRecord(input?.dramaClicks),
    episodeClicks: normalizeEpisodeClickRecord(input?.episodeClicks)
  };
}

function buildEngagementSignature(input) {
  return JSON.stringify(normalizeEngagementPayload(input));
}

function formatCount(value) {
  return countFormatter.format(sanitizeCountValue(value));
}

function getDramaClickCount(dramaId) {
  const safeDramaId = String(dramaId || "").trim();
  if (!safeDramaId) {
    return 0;
  }

  return sanitizeCountValue(state.engagement?.dramaClicks?.[safeDramaId]);
}

function getEpisodeClickCount(dramaId, episodeNumber) {
  const safeDramaId = String(dramaId || "").trim();
  const safeEpisodeNumber = String(Number(episodeNumber) || "").trim();
  if (!safeDramaId || !safeEpisodeNumber) {
    return 0;
  }

  return sanitizeCountValue(state.engagement?.episodeClicks?.[safeDramaId]?.[safeEpisodeNumber]);
}

function renderVisitorStats() {
  if (!elements.visitorStats) {
    return;
  }

  const visitors = sanitizeCountValue(state.engagement?.totals?.visitors);
  const visits = sanitizeCountValue(state.engagement?.totals?.visits);
  elements.visitorStats.textContent = `Total pengunjung: ${formatCount(visitors)} orang | ${formatCount(
    visits
  )} kunjungan`;
}

function renderPreviewDramaClickCount(dramaId) {
  if (!elements.previewDramaClicks) {
    return;
  }

  const count = getDramaClickCount(dramaId);
  elements.previewDramaClicks.textContent = `👁 Views ${formatCount(count)}`;
}

function applyEngagementStats(input, { rerender = true } = {}) {
  const normalized = normalizeEngagementPayload(input);
  const signature = buildEngagementSignature(normalized);
  const changed = signature !== state.engagementSignature;
  state.engagement = normalized;
  state.engagementSignature = signature;
  renderVisitorStats();

  if (!state.drama) {
    return;
  }

  renderPreviewDramaClickCount(state.drama.id);
  if (!rerender || !changed) {
    return;
  }

  if (state.viewMode === "home") {
    renderHomeGrid();
    return;
  }

  if (state.viewMode === "player") {
    renderEpisodeSheet();
  }
}

async function fetchEngagementStats({ silent = false, apply = true } = {}) {
  try {
    const response = await fetch("/api/analytics/stats", {
      headers: buildRequestHeaders()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Gagal membaca statistik pengunjung.");
    }

    if (apply) {
      applyEngagementStats(payload);
    }
    return payload;
  } catch (error) {
    if (!silent) {
      throw error;
    }

    return null;
  }
}

async function trackWebsiteVisit() {
  const response = await fetch("/api/analytics/visit", {
    method: "POST",
    headers: buildRequestHeaders({
      "content-type": "application/json"
    }),
    body: JSON.stringify({
      viewerId: state.viewerId
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Gagal mencatat kunjungan.");
  }

  applyEngagementStats(payload.stats || payload);
}

async function trackDramaClickMetric(dramaId) {
  const safeDramaId = String(dramaId || "").trim();
  if (!safeDramaId) {
    return;
  }

  try {
    const response = await fetch("/api/analytics/drama-click", {
      method: "POST",
      headers: buildRequestHeaders({
        "content-type": "application/json"
      }),
      body: JSON.stringify({
        dramaId: safeDramaId
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return;
    }

    applyEngagementStats(payload.stats || payload);
  } catch {
    // Abaikan error analytics agar UX utama tidak terganggu.
  }
}

async function trackEpisodeClickMetric(dramaId, episodeNumber) {
  const safeDramaId = String(dramaId || "").trim();
  const safeEpisodeNumber = Number(episodeNumber);
  if (!safeDramaId || !Number.isInteger(safeEpisodeNumber) || safeEpisodeNumber <= 0) {
    return;
  }

  try {
    const response = await fetch("/api/analytics/episode-click", {
      method: "POST",
      headers: buildRequestHeaders({
        "content-type": "application/json"
      }),
      body: JSON.stringify({
        dramaId: safeDramaId,
        episodeNumber: safeEpisodeNumber
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return;
    }

    applyEngagementStats(payload.stats || payload);
  } catch {
    // Abaikan error analytics agar UX utama tidak terganggu.
  }
}

function isYoutubeVerificationRequired() {
  return (
    Boolean(state.youtubeGate.enabled) &&
    !Boolean(state.youtubeGate.verified) &&
    !Boolean(state.adminPreviewEnabled)
  );
}

function parseBooleanFlag(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function isEpisodeLockedByYoutube(episodeNumber) {
  if (!isYoutubeVerificationRequired()) {
    return false;
  }

  const safeEpisodeNumber = Number(episodeNumber);
  const minEpisode = Math.max(1, Number(state.youtubeGate.minEpisode) || 10);
  if (!Number.isInteger(safeEpisodeNumber) || safeEpisodeNumber <= 0) {
    return false;
  }

  return safeEpisodeNumber >= minEpisode;
}

function isEpisodeMarkedLocked(episode) {
  return parseBooleanFlag(episode?.locked);
}

function getEpisodeManualLockReason(episode) {
  return String(episode?.lockReason || "").trim();
}

function isEpisodeManuallyLockedForViewer(episode) {
  if (state.adminPreviewEnabled) {
    return false;
  }

  return isEpisodeMarkedLocked(episode);
}

function getEpisodeLockState(episode) {
  const youtube = isEpisodeLockedByYoutube(episode?.number);
  const manual = isEpisodeManuallyLockedForViewer(episode);
  return {
    locked: youtube || manual,
    youtube,
    manual,
    reason: manual ? getEpisodeManualLockReason(episode) : ""
  };
}

function isLockNoticeVisible() {
  return Boolean(elements.lockNotice && !elements.lockNotice.classList.contains("hidden"));
}

function hideLockNotice() {
  if (!elements.lockNotice || !elements.lockNoticeBackdrop) {
    return;
  }

  elements.lockNotice.classList.add("hidden");
  elements.lockNoticeBackdrop.classList.add("hidden");
}

function showLockNotice({ title, message, requireYoutube = false } = {}) {
  if (
    !elements.lockNotice ||
    !elements.lockNoticeBackdrop ||
    !elements.lockNoticeTitle ||
    !elements.lockNoticeMessage
  ) {
    return;
  }

  const safeTitle = String(title || "Episode Masih Di-lock").trim();
  const safeMessage = String(
    message || "Episode ini masih di-lock. Untuk unlock wajib subscribe channel kami."
  ).trim();

  elements.lockNoticeTitle.textContent = safeTitle;
  elements.lockNoticeMessage.textContent = safeMessage;

  if (elements.lockNoticeChannelLink) {
    const channelUrl = String(state.youtubeGate.requiredChannelUrl || "https://www.youtube.com").trim();
    elements.lockNoticeChannelLink.href = channelUrl || "https://www.youtube.com";
    elements.lockNoticeChannelLink.classList.toggle("hidden", !requireYoutube);
  }

  if (elements.lockNoticeVerifyBtn) {
    elements.lockNoticeVerifyBtn.classList.toggle("hidden", !requireYoutube);
    elements.lockNoticeVerifyBtn.disabled = state.youtubeGate.verifyInProgress;
    elements.lockNoticeVerifyBtn.textContent = state.youtubeGate.verifyInProgress
      ? "Memproses..."
      : "Subscribe & Verifikasi";
  }

  elements.lockNotice.classList.remove("hidden");
  elements.lockNoticeBackdrop.classList.remove("hidden");
}

function isSubscribePromoVisible() {
  return Boolean(elements.subscribePromo && !elements.subscribePromo.classList.contains("hidden"));
}

function hideSubscribePromo({ setCooldown = false } = {}) {
  if (!elements.subscribePromo || !elements.subscribePromoBackdrop) {
    return;
  }

  if (setCooldown) {
    writeSubscribePromoCooldownUntil(Date.now() + SUBSCRIBE_PROMO_COOLDOWN_MS);
  }

  elements.subscribePromo.classList.add("hidden");
  elements.subscribePromoBackdrop.classList.add("hidden");
}

function maybeShowSubscribePromo() {
  if (!elements.subscribePromo || !elements.subscribePromoBackdrop || !elements.subscribePromoOpenBtn) {
    return;
  }

  if (state.adminPreviewEnabled || state.viewMode !== "home" || state.youtubeGate.enabled) {
    hideSubscribePromo({ setCooldown: false });
    return;
  }

  const cooldownUntil = readSubscribePromoCooldownUntil();
  if (cooldownUntil > Date.now()) {
    hideSubscribePromo({ setCooldown: false });
    return;
  }

  const channelUrl = String(state.youtubeGate.requiredChannelUrl || "https://www.youtube.com").trim();
  elements.subscribePromoOpenBtn.href = channelUrl || "https://www.youtube.com";
  elements.subscribePromo.classList.remove("hidden");
  elements.subscribePromoBackdrop.classList.remove("hidden");
}

function renderYoutubeGate() {
  if (!elements.youtubeGateBar || !elements.youtubeVerifyBtn || !elements.youtubeGateText) {
    return;
  }

  const gateEnabled =
    Boolean(state.youtubeGate.enabled) &&
    !state.adminPreviewEnabled &&
    !state.youtubeGate.verified &&
    state.viewMode === "home";

  if (state.youtubeGate.enabled && isSubscribePromoVisible()) {
    hideSubscribePromo({ setCooldown: false });
  }

  if (!gateEnabled) {
    elements.youtubeGateBar.classList.add("hidden");
    return;
  }

  const channelUrl = String(state.youtubeGate.requiredChannelUrl || "https://www.youtube.com").trim();
  if (elements.youtubeChannelLink) {
    elements.youtubeChannelLink.href = channelUrl || "https://www.youtube.com";
  }

  if (state.youtubeGate.verified) {
    elements.youtubeGateText.textContent = "Verifikasi YouTube sudah aktif. Kamu bisa menonton semua drama.";
    elements.youtubeVerifyBtn.textContent = "Terverifikasi";
    elements.youtubeVerifyBtn.disabled = true;
  } else if (state.youtubeGate.checking) {
    elements.youtubeGateText.textContent = "Memeriksa status subscribe YouTube...";
    elements.youtubeVerifyBtn.textContent = "Memeriksa...";
    elements.youtubeVerifyBtn.disabled = true;
  } else if (state.youtubeGate.verifyInProgress) {
    elements.youtubeGateText.textContent = "Menunggu proses verifikasi Google selesai...";
    elements.youtubeVerifyBtn.textContent = "Proses Verifikasi...";
    elements.youtubeVerifyBtn.disabled = true;
  } else {
    const minEpisode = Math.max(1, Number(state.youtubeGate.minEpisode) || 10);
    elements.youtubeGateText.textContent = `Wajib subscribe channel YouTube dulu untuk membuka episode ${minEpisode}+.`;
    elements.youtubeVerifyBtn.textContent = "Subscribe & Verifikasi";
    elements.youtubeVerifyBtn.disabled = false;
  }

  if (isLockNoticeVisible() && elements.lockNoticeVerifyBtn) {
    elements.lockNoticeVerifyBtn.disabled = state.youtubeGate.verifyInProgress;
    elements.lockNoticeVerifyBtn.textContent = state.youtubeGate.verifyInProgress
      ? "Memproses..."
      : "Subscribe & Verifikasi";
  }

  elements.youtubeGateBar.classList.remove("hidden");
}

async function loadYoutubeGateConfig() {
  try {
    const response = await fetch(
      `/api/youtube/verification/config?viewerId=${encodeURIComponent(state.viewerId)}`,
      {
        headers: buildRequestHeaders()
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Gagal membaca konfigurasi verifikasi YouTube.");
    }

    state.youtubeGate.enabled = Boolean(payload.enabled);
    state.youtubeGate.minEpisode = Math.max(1, Number(payload.minEpisode) || 10);
    state.youtubeGate.requiredChannelId = String(payload.requiredChannelId || "").trim();
    state.youtubeGate.requiredChannelUrl = String(payload.requiredChannelUrl || "https://www.youtube.com").trim();
    if (payload.warning) {
      setStatus(String(payload.warning), "error");
    }
  } catch (error) {
    state.youtubeGate.enabled = false;
    setStatus(error.message, "error");
  } finally {
    renderYoutubeGate();
  }
}

async function refreshYoutubeVerificationStatus({ silent = false } = {}) {
  if (!state.youtubeGate.enabled || state.adminPreviewEnabled) {
    state.youtubeGate.verified = true;
    renderYoutubeGate();
    return true;
  }

  state.youtubeGate.checking = true;
  renderYoutubeGate();
  try {
    const response = await fetch(
      `/api/youtube/verification/status?viewerId=${encodeURIComponent(state.viewerId)}`,
      {
        headers: buildRequestHeaders()
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Gagal membaca status verifikasi YouTube.");
    }

    state.youtubeGate.verified = Boolean(payload.verified);
    state.youtubeGate.minEpisode = Math.max(1, Number(payload.minEpisode) || state.youtubeGate.minEpisode || 10);
    if (state.youtubeGate.verified) {
      hideLockNotice();
    }
    if (!silent) {
      if (state.youtubeGate.verified) {
        setStatus("Verifikasi YouTube berhasil.", "ok");
      } else {
        setStatus("Wajib subscribe dan verifikasi YouTube sebelum menonton.", "error");
      }
    }
  } catch (error) {
    state.youtubeGate.verified = false;
    if (!silent) {
      setStatus(error.message, "error");
    }
  } finally {
    state.youtubeGate.checking = false;
    renderYoutubeGate();
    if (state.drama && state.viewMode === "preview") {
      renderPreview(state.drama);
    }
  }

  return state.youtubeGate.verified;
}

function stopYoutubeVerifyPopupMonitor() {
  if (state.youtubeVerifyPopupMonitor) {
    window.clearInterval(state.youtubeVerifyPopupMonitor);
    state.youtubeVerifyPopupMonitor = null;
  }

  state.youtubeVerifyPopupWindow = null;
}

function startYoutubeVerifyPopupMonitor(popupWindow) {
  stopYoutubeVerifyPopupMonitor();
  state.youtubeVerifyPopupWindow = popupWindow;
  state.youtubeVerifyPopupMonitor = window.setInterval(async () => {
    const popup = state.youtubeVerifyPopupWindow;
    if (!popup) {
      stopYoutubeVerifyPopupMonitor();
      return;
    }

    if (!popup.closed) {
      return;
    }

    stopYoutubeVerifyPopupMonitor();
    if (!state.youtubeGate.verifyInProgress) {
      return;
    }

    state.youtubeGate.verifyInProgress = false;
    renderYoutubeGate();
    await refreshYoutubeVerificationStatus({ silent: true });
    setStatus("Verifikasi YouTube dibatalkan.", "error");
  }, 450);
}

async function startYoutubeVerification() {
  if (!state.youtubeGate.enabled || state.adminPreviewEnabled) {
    return;
  }

  stopYoutubeVerifyPopupMonitor();
  state.youtubeGate.verifyInProgress = true;
  renderYoutubeGate();

  try {
    const response = await fetch("/api/youtube/verification/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildRequestHeaders()
      },
      body: JSON.stringify({
        viewerId: state.viewerId
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Gagal memulai verifikasi YouTube.");
    }

    if (payload.alreadyVerified || payload.verified) {
      state.youtubeGate.verified = true;
      state.youtubeGate.verifyInProgress = false;
      stopYoutubeVerifyPopupMonitor();
      renderYoutubeGate();
      hideLockNotice();
      setStatus("Akun sudah terverifikasi subscribe.", "ok");
      return;
    }

    const authUrl = String(payload.authUrl || "").trim();
    if (!authUrl) {
      throw new Error("URL verifikasi YouTube tidak tersedia.");
    }

    const popup = window.open(authUrl, "youtubeVerifyWindow", "width=520,height=740");
    if (!popup) {
      stopYoutubeVerifyPopupMonitor();
      window.location.href = authUrl;
      return;
    }

    startYoutubeVerifyPopupMonitor(popup);
  } catch (error) {
    stopYoutubeVerifyPopupMonitor();
    setStatus(error.message, "error");
    state.youtubeGate.verifyInProgress = false;
    renderYoutubeGate();
  }
}

function getStartParamDramaId() {
  const value = String(telegram?.initDataUnsafe?.start_param || "").trim();
  return value || null;
}

function getSortedEpisodes(drama) {
  return [...(drama?.episodes || [])].sort((a, b) => Number(a.number) - Number(b.number));
}

function getDramaById(dramaId) {
  return state.dramas.find((drama) => drama.id === dramaId) || null;
}

function parseTimestamp(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function sortDramasByCreatedAt(dramas) {
  return [...(dramas || [])].sort((a, b) => {
    const aTime = parseTimestamp(a?.createdAt);
    const bTime = parseTimestamp(b?.createdAt);
    return bTime - aTime;
  });
}

function buildLibrarySignature(dramas) {
  const normalized = [...(dramas || [])]
    .map((drama) => ({
      id: String(drama?.id || ""),
      title: String(drama?.title || ""),
      poster: String(drama?.poster || ""),
      synopsis: String(drama?.synopsis || ""),
      publishStatus: String(drama?.publishStatus || ""),
      createdAt: String(drama?.createdAt || ""),
      updatedAt: String(drama?.updatedAt || ""),
      episodes: [...(drama?.episodes || [])]
        .map((episode) => ({
          number: Number(episode?.number) || 0,
          title: String(episode?.title || ""),
          source: String(episode?.source || ""),
          telegramFileId: String(episode?.telegramFileId || ""),
          gdriveFileId: String(episode?.gdriveFileId || ""),
          locked: parseBooleanFlag(episode?.locked),
          lockReason: String(episode?.lockReason || ""),
          updatedAt: String(episode?.updatedAt || "")
        }))
        .sort((a, b) => a.number - b.number)
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return JSON.stringify(normalized);
}

function getLibraryApiPath() {
  return state.adminPreviewEnabled ? "/api/admin/library" : "/api/library";
}

async function fetchLibraryPayload() {
  const response = await fetch(getLibraryApiPath(), {
    headers: buildRequestHeaders()
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Gagal membaca library.");
  }

  return payload;
}

function cleanupLocalStateForRemovedDramas() {
  const validDramaIds = new Set(state.dramas.map((drama) => drama.id));

  let favoritesChanged = false;
  for (const dramaId of [...state.favorites]) {
    if (!validDramaIds.has(dramaId)) {
      state.favorites.delete(dramaId);
      favoritesChanged = true;
    }
  }
  if (favoritesChanged) {
    writeFavorites(state.favorites);
  }

  let savedHistoryChanged = false;
  for (const dramaId of Object.keys(state.savedHistory || {})) {
    if (!validDramaIds.has(dramaId)) {
      delete state.savedHistory[dramaId];
      savedHistoryChanged = true;
    }
  }
  if (savedHistoryChanged) {
    writeSavedHistory(state.savedHistory);
  }

  let watchProgressChanged = false;
  for (const dramaId of Object.keys(state.watchProgress || {})) {
    if (!validDramaIds.has(dramaId)) {
      delete state.watchProgress[dramaId];
      watchProgressChanged = true;
    }
  }
  if (watchProgressChanged) {
    writeWatchProgress(state.watchProgress);
  }
}

function applyLibraryDramas(nextDramas, { fromPolling = false } = {}) {
  const previousDramaId = String(state.drama?.id || "").trim();
  const previousEpisodeNumber = Number(state.currentEpisodeNumber);
  const currentViewMode = state.viewMode;

  state.dramas = sortDramasByCreatedAt(nextDramas);
  state.librarySignature = buildLibrarySignature(state.dramas);

  cleanupLocalStateForRemovedDramas();
  ensureSavedHistoryConsistency();

  if (!state.dramas.length) {
    state.drama = null;
    state.currentEpisodeNumber = null;
    clearVideo();
    renderDramaPicker();
    renderHomeGrid();
    updateSaveButton();
    setViewMode("home");
    setStatus("Belum ada drama yang dipublish.", "error");
    return;
  }

  const previousDramaStillExists = previousDramaId
    ? state.dramas.some((drama) => drama.id === previousDramaId)
    : false;
  const nextDrama =
    (previousDramaStillExists && getDramaById(previousDramaId)) || selectDefaultDrama(state.dramas) || null;

  state.drama = nextDrama;
  if (!state.drama) {
    return;
  }

  renderDramaPicker();
  renderHomeGrid();
  updateSaveButton();

  if (elements.dramaPicker) {
    elements.dramaPicker.value = state.drama.id;
  }

  if (currentViewMode === "preview") {
    renderPreview(state.drama);
  }

  if (currentViewMode === "player") {
    if (!previousDramaStillExists) {
      clearVideo();
      closeEpisodeSheet();
      state.currentEpisodeNumber = null;
      renderPreview(state.drama);
      setViewMode("preview");
      setStatus("Drama yang sedang dibuka berubah. Menampilkan data terbaru.", "ok");
      return;
    }

    const activeEpisode = getSortedEpisodes(state.drama).find(
      (episode) => Number(episode.number) === previousEpisodeNumber
    );
    if (!activeEpisode || !activeEpisode.hasVideo) {
      clearVideo();
      const resumeTarget = resolveResumeTargetForDrama(state.drama);
      state.currentEpisodeNumber = resumeTarget.episode?.number ?? null;
      updatePlayerHeader();
      renderEpisodeSheet();
      setPlayerHint("Episode saat ini sudah tidak tersedia di server.");
      setStatus("Episode aktif tidak tersedia lagi setelah update data.", "error");
      return;
    }

    state.currentEpisodeNumber = activeEpisode.number;
    updatePlayerHeader();
    renderEpisodeSheet();
  }

  if (fromPolling && currentViewMode !== "player") {
    setStatus("Data terbaru dimuat otomatis.", "ok");
  }
}

function stopRealtimeLibraryPolling() {
  if (state.realtimePollTimer) {
    clearInterval(state.realtimePollTimer);
    state.realtimePollTimer = null;
  }
}

function startRealtimeLibraryPolling() {
  stopRealtimeLibraryPolling();

  state.realtimePollTimer = setInterval(async () => {
    if (document.hidden || state.realtimePollInFlight) {
      return;
    }

    state.realtimePollInFlight = true;
    try {
      const [payload, engagementPayload] = await Promise.all([
        fetchLibraryPayload(),
        fetchEngagementStats({ silent: true, apply: false })
      ]);
      const nextDramas = Array.isArray(payload?.dramas) ? payload.dramas : [];
      const nextSignature = buildLibrarySignature(nextDramas);
      if (nextSignature !== state.librarySignature) {
        applyLibraryDramas(nextDramas, { fromPolling: true });
      }

      if (engagementPayload) {
        applyEngagementStats(engagementPayload);
      }
    } catch {
      // Abaikan error polling background.
    } finally {
      state.realtimePollInFlight = false;
    }
  }, LIBRARY_REALTIME_POLL_MS);
}

function dramaMatchesCurrentQuery(drama) {
  const query = String(state.searchQuery || "")
    .trim()
    .toLowerCase();
  if (!query) {
    return true;
  }

  return String(drama?.title || "").toLowerCase().includes(query);
}

function ensureSavedHistoryConsistency() {
  let changed = false;
  for (const dramaId of state.favorites) {
    if (!state.savedHistory[dramaId]) {
      state.savedHistory[dramaId] = new Date().toISOString();
      changed = true;
    }
  }

  for (const dramaId of Object.keys(state.savedHistory)) {
    if (!state.favorites.has(dramaId)) {
      delete state.savedHistory[dramaId];
      changed = true;
    }
  }

  if (changed) {
    writeSavedHistory(state.savedHistory);
  }
}

function renderDramaPicker() {
  if (!elements.dramaPicker) {
    return;
  }

  elements.dramaPicker.innerHTML = "";

  for (const drama of state.dramas) {
    const option = document.createElement("option");
    option.value = drama.id;
    option.textContent = drama.title;
    elements.dramaPicker.appendChild(option);
  }

  if (state.drama) {
    elements.dramaPicker.value = state.drama.id;
  }
}

function renderHomeGrid() {
  elements.dramaGrid.innerHTML = "";

  const visibleDramas = state.dramas.filter((drama) => dramaMatchesCurrentQuery(drama));

  if (!visibleDramas.length) {
    const empty = document.createElement("div");
    empty.className = "home-empty";
    empty.textContent = "Drama tidak ditemukan. Coba kata kunci lain.";
    elements.dramaGrid.appendChild(empty);
    renderHomeCollections();
    return;
  }

  for (const drama of visibleDramas) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `home-card ${state.drama?.id === drama.id ? "active" : ""}`.trim();

    const cover = document.createElement("div");
    cover.className = "cover-wrap";

    const image = document.createElement("img");
    image.src = drama.poster;
    image.alt = `Poster ${drama.title}`;

    const badge = document.createElement("div");
    badge.className = "card-badge";
    const badgeIcon = document.createElement("span");
    badgeIcon.className = "card-badge-icon";
    badgeIcon.textContent = "👁";
    const badgeText = document.createElement("span");
    badgeText.className = "card-badge-text";
    badgeText.textContent = formatCount(getDramaClickCount(drama.id));
    badge.append(badgeIcon, badgeText);

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = drama.title;

    cover.append(image, badge);
    button.append(cover, title);
    button.addEventListener("click", async () => {
      await setDramaById(drama.id, { openFirstEpisode: false, trackDramaClick: true });
      setViewMode("preview");
    });

    elements.dramaGrid.appendChild(button);
  }

  renderHomeCollections();
}

function buildHomeCollectionCard(drama, metaText, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "home-mini-card";

  const image = document.createElement("img");
  image.className = "home-mini-poster";
  image.src = drama.poster;
  image.alt = `Poster ${drama.title}`;

  const textWrap = document.createElement("div");
  textWrap.className = "home-mini-text";

  const title = document.createElement("div");
  title.className = "home-mini-title";
  title.textContent = drama.title;

  const meta = document.createElement("div");
  meta.className = "home-mini-meta";
  meta.textContent = metaText;

  textWrap.append(title, meta);
  button.append(image, textWrap);
  button.addEventListener("click", onClick);
  return button;
}

function renderHomeCollections() {
  if (!elements.resumeSection || !elements.resumeGrid || !elements.savedSection || !elements.savedGrid) {
    return;
  }

  const resumeItems = Object.entries(state.watchProgress || {})
    .map(([dramaId, progress]) => ({
      drama: getDramaById(dramaId),
      progress
    }))
    .filter((item) => item.drama && dramaMatchesCurrentQuery(item.drama))
    .sort((a, b) => parseTimestamp(b.progress.updatedAt) - parseTimestamp(a.progress.updatedAt));

  elements.resumeGrid.innerHTML = "";
  if (!resumeItems.length) {
    elements.resumeSection.classList.add("hidden");
  } else {
    elements.resumeSection.classList.remove("hidden");
    for (const item of resumeItems.slice(0, 12)) {
      const drama = item.drama;
      const episodeNumber = Number(item.progress?.episodeNumber) || 1;
      const timeSec = Math.max(0, Number(item.progress?.timeSec) || 0);
      const metaText = `EP.${episodeNumber} - ${formatPlaybackTime(timeSec)}`;
      const card = buildHomeCollectionCard(drama, metaText, async () => {
        await setDramaById(drama.id, { openFirstEpisode: false, trackDramaClick: true });
        const resume = resolveResumeTargetForDrama(drama);
        if (!resume.episode) {
          setViewMode("preview");
          return;
        }

        setViewMode("player");
        await openEpisode(resume.episode.number, {
          resumeSeconds: resume.resumeSeconds
        });
      });
      elements.resumeGrid.appendChild(card);
    }
  }

  const savedItems = [...state.favorites]
    .map((dramaId) => ({
      drama: getDramaById(dramaId),
      savedAt: state.savedHistory?.[dramaId] || ""
    }))
    .filter((item) => item.drama && dramaMatchesCurrentQuery(item.drama))
    .sort((a, b) => parseTimestamp(b.savedAt) - parseTimestamp(a.savedAt));

  elements.savedGrid.innerHTML = "";
  if (!savedItems.length) {
    elements.savedSection.classList.add("hidden");
  } else {
    elements.savedSection.classList.remove("hidden");
    for (const item of savedItems.slice(0, 20)) {
      const drama = item.drama;
      const episodeCount = getSortedEpisodes(drama).length;
      const metaText = `${episodeCount} Episode`;
      const card = buildHomeCollectionCard(drama, metaText, async () => {
        await setDramaById(drama.id, { openFirstEpisode: false, trackDramaClick: true });
        setViewMode("preview");
      });
      elements.savedGrid.appendChild(card);
    }
  }
}

function detectDramaTag(drama) {
  const publishStatus = String(drama?.publishStatus || "")
    .trim()
    .toLowerCase();
  if (publishStatus === "private") {
    return "Private";
  }

  const text = `${drama?.title || ""} ${drama?.synopsis || ""}`.toLowerCase();
  if (/(cinta|romance|romansa|menikah|suami|istri|hati)/.test(text)) {
    return "Romansa";
  }

  return "Drama";
}

function updateSaveButton() {
  if (!state.drama) {
    elements.saveDramaBtn.textContent = "Simpan";
    elements.saveDramaBtn.classList.remove("active");
    return;
  }

  const isSaved = state.favorites.has(state.drama.id);
  elements.saveDramaBtn.textContent = isSaved ? "Tersimpan" : "Simpan";
  elements.saveDramaBtn.classList.toggle("active", isSaved);
}

function renderPreview(drama) {
  const episodes = getSortedEpisodes(drama);
  const episodeCount = episodes.length;
  const allEpisodesLocked = episodeCount > 0 && !episodes.some((episode) => !getEpisodeLockState(episode).locked);
  const hasYoutubeLockedEpisode = episodes.some((episode) => getEpisodeLockState(episode).youtube);
  elements.previewPoster.src = drama.poster;
  elements.previewPoster.alt = `Poster ${drama.title}`;
  elements.previewBackdrop.style.backgroundImage = `url("${drama.poster}")`;
  elements.previewTitle.textContent = drama.title;
  elements.previewTag.textContent = detectDramaTag(drama);
  elements.previewEpisodeCount.textContent = String(episodeCount);
  elements.previewSynopsis.textContent = drama.synopsis || "-";
  renderPreviewDramaClickCount(drama.id);
  elements.watchNowBtn.disabled = episodeCount === 0 || allEpisodesLocked;
  if (episodeCount === 0) {
    elements.watchNowBtn.textContent = "Belum Ada Episode";
  } else if (allEpisodesLocked && hasYoutubeLockedEpisode) {
    elements.watchNowBtn.textContent = "Verifikasi YouTube Dulu";
  } else if (allEpisodesLocked) {
    elements.watchNowBtn.textContent = "Episode Dikunci";
  } else {
    elements.watchNowBtn.textContent = "Tonton Sekarang";
  }
  elements.watchNowBtn.classList.toggle("is-locked", allEpisodesLocked);
}

function updatePlayerHeader() {
  elements.playerDramaTitle.textContent = state.drama?.title || "-";
  if (state.currentEpisodeNumber) {
    elements.playerEpisodeBadge.textContent = `EP.${state.currentEpisodeNumber}`;
  } else {
    elements.playerEpisodeBadge.textContent = "EP.-";
  }
}

function renderEpisodeSheet() {
  elements.episodeSheetGrid.innerHTML = "";
  const episodes = getSortedEpisodes(state.drama);

  if (!episodes.length) {
    const empty = document.createElement("div");
    empty.className = "episode-sheet-empty";
    empty.textContent = "Belum ada episode.";
    elements.episodeSheetGrid.appendChild(empty);
    return;
  }

  for (const episode of episodes) {
    const lockState = getEpisodeLockState(episode);
    const isLocked = lockState.locked;
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "episode-chip",
      episode.hasVideo ? "" : "pending",
      isLocked ? "locked" : "",
      lockState.manual ? "locked-manual" : "",
      Number(episode.number) === Number(state.currentEpisodeNumber) ? "active" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const label = document.createElement("span");
    label.className = "episode-chip-label";
    label.textContent = `EP${episode.number}`;

    const clickMeta = document.createElement("span");
    clickMeta.className = "episode-chip-click";
    clickMeta.textContent = `${formatCount(getEpisodeClickCount(state.drama?.id, episode.number))} klik`;

    button.append(label, clickMeta);
    if (parseBooleanFlag(episode?.adRequired)) {
      const adBadge = document.createElement("span");
      adBadge.className = "episode-chip-ad";
      adBadge.textContent = "Iklan";
      button.appendChild(adBadge);
    }
    if (isLocked) {
      button.title = lockState.manual
        ? `Episode ${episode.number} dikunci admin.`
        : `Episode ${episode.number} terkunci. Verifikasi YouTube dulu.`;
    }
    button.addEventListener("click", async () => {
      if (isLocked) {
        if (lockState.manual) {
          const reason = lockState.reason || "Episode ini sedang dikunci admin.";
          setStatus(reason, "error");
          closeEpisodeSheet();
          showLockNotice({
            title: `EP.${episode.number} Masih Di-lock`,
            message: reason,
            requireYoutube: false
          });
          return;
        }

        const minEpisode = Math.max(1, Number(state.youtubeGate.minEpisode) || 10);
        setStatus(`Episode ${minEpisode}+ terkunci. Verifikasi YouTube dulu.`, "error");
        closeEpisodeSheet();
        showLockNotice({
          title: `EP.${episode.number} Masih Di-lock`,
          message: "Episode ini masih di-lock. Untuk unlock wajib subscribe channel kami lalu verifikasi akun YouTube.",
          requireYoutube: true
        });
        return;
      }

      closeEpisodeSheet();
      await openEpisode(episode.number);
    });
    elements.episodeSheetGrid.appendChild(button);
  }
}

function openEpisodeSheet() {
  if (state.viewMode !== "player") {
    return;
  }

  elements.episodeSheetBackdrop.classList.remove("hidden");
  elements.episodeSheet.classList.remove("hidden");
}

function closeEpisodeSheet() {
  elements.episodeSheetBackdrop.classList.add("hidden");
  elements.episodeSheet.classList.add("hidden");
}

function setPlayerHint(message, { html = false } = {}) {
  const text = String(message || "").trim();
  if (!text) {
    elements.playerHint.textContent = "";
    elements.playerHint.classList.add("hidden");
    return;
  }

  if (html) {
    elements.playerHint.innerHTML = text;
  } else {
    elements.playerHint.textContent = text;
  }
  elements.playerHint.classList.remove("hidden");
}

function setPlayerLoader(visible, message = "") {
  if (message) {
    elements.playerLoaderText.textContent = String(message);
  }

  elements.playerLoader.classList.toggle("hidden", !visible);
}

function getStoredProgressForDrama(dramaId) {
  if (!dramaId) {
    return null;
  }

  const progress = state.watchProgress?.[dramaId];
  if (!progress) {
    return null;
  }

  const episodeNumber = Number(progress.episodeNumber);
  if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    return null;
  }

  return {
    episodeNumber,
    timeSec: Math.max(0, Math.floor(Number(progress.timeSec) || 0))
  };
}

function resolveResumeTargetForDrama(drama) {
  const episodes = getSortedEpisodes(drama);
  const firstEpisode = episodes[0] || null;
  if (!firstEpisode) {
    return {
      episode: null,
      resumeSeconds: 0,
      hasResume: false
    };
  }

  const progress = getStoredProgressForDrama(drama?.id);
  if (!progress) {
    return {
      episode: firstEpisode,
      resumeSeconds: 0,
      hasResume: false
    };
  }

  const episode = episodes.find((item) => Number(item.number) === Number(progress.episodeNumber));
  if (!episode) {
    return {
      episode: firstEpisode,
      resumeSeconds: 0,
      hasResume: false
    };
  }

  return {
    episode,
    resumeSeconds: Math.max(0, Number(progress.timeSec) || 0),
    hasResume: true
  };
}

function upsertWatchProgress(dramaId, episodeNumber, timeSec) {
  const safeDramaId = String(dramaId || "").trim();
  const safeEpisodeNumber = Number(episodeNumber);
  if (!safeDramaId || !Number.isInteger(safeEpisodeNumber) || safeEpisodeNumber <= 0) {
    return;
  }

  state.watchProgress[safeDramaId] = {
    episodeNumber: safeEpisodeNumber,
    timeSec: Math.max(0, Math.floor(Number(timeSec) || 0)),
    updatedAt: new Date().toISOString()
  };
  writeWatchProgress(state.watchProgress);

  if (state.viewMode === "home") {
    renderHomeCollections();
  }
}

function getCurrentWatchSnapshot() {
  const dramaId = String(state.drama?.id || "").trim();
  const episodeNumber = Number(state.currentEpisodeNumber);
  const hasSource = Boolean(elements.videoPlayer.getAttribute("src"));
  if (!dramaId || !Number.isInteger(episodeNumber) || episodeNumber <= 0 || !hasSource) {
    return null;
  }

  return {
    dramaId,
    episodeNumber,
    timeSec: Math.max(0, Math.floor(Number(elements.videoPlayer.currentTime) || 0))
  };
}

function persistCurrentWatchProgress({ force = false } = {}) {
  const snapshot = getCurrentWatchSnapshot();
  if (!snapshot) {
    return;
  }

  const now = Date.now();
  if (!force && now - state.lastProgressSavedAt < WATCH_PROGRESS_SAVE_INTERVAL_MS) {
    return;
  }

  upsertWatchProgress(snapshot.dramaId, snapshot.episodeNumber, snapshot.timeSec);
  state.lastProgressSavedAt = now;
}

function formatPlaybackTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hour = Math.floor(safeSeconds / 3600);
  const minute = Math.floor((safeSeconds % 3600) / 60);
  const second = safeSeconds % 60;

  if (hour > 0) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function syncPlaybackControls({ previewTime = null } = {}) {
  const duration = Number(elements.videoPlayer.duration);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const current = previewTime ?? Number(elements.videoPlayer.currentTime);
  const safeCurrent = Math.max(0, Number.isFinite(current) ? current : 0);
  const max = hasDuration ? Math.floor(duration) : 0;
  const clamped = hasDuration ? Math.min(safeCurrent, max) : safeCurrent;

  elements.playerCurrentTime.textContent = formatPlaybackTime(clamped);
  elements.playerDuration.textContent = formatPlaybackTime(max);
  elements.playerSeek.disabled = !hasDuration;
  elements.playerSeek.max = String(max || 1);

  if (!state.isSeeking || previewTime !== null) {
    elements.playerSeek.value = String(Math.floor(clamped));
  }
}

function updatePlayPauseButton() {
  elements.playPauseBtn.textContent = elements.videoPlayer.paused ? "Putar" : "Pause";
}

function updatePlaybackControlsVisibility() {
  const hasSource = Boolean(elements.videoPlayer.getAttribute("src"));
  const canShow = state.viewMode === "player" && !elements.detailLayout.classList.contains("is-playing");
  elements.playerControls.classList.toggle("hidden", !(hasSource && canShow));
}

function updateCenterPlayButton() {
  const hasSource = Boolean(elements.videoPlayer.getAttribute("src"));
  const canShow = state.viewMode === "player" && !elements.detailLayout.classList.contains("is-playing");
  elements.centerPlayBtn.classList.toggle("hidden", !(hasSource && canShow));
  updatePlaybackControlsVisibility();
  updatePlayPauseButton();
}

function getNextEpisodeAfter(number) {
  const current = Number(number);
  const episodes = getSortedEpisodes(state.drama);
  return (
    episodes.find(
      (episode) => Number(episode.number) > current && episode.hasVideo
    ) || null
  );
}

function setPlayerPlaying(isPlaying) {
  elements.detailLayout.classList.toggle("is-playing", Boolean(isPlaying));
  updateCenterPlayButton();
}

async function playNextEpisodeIfAny() {
  const nextEpisode = getNextEpisodeAfter(state.currentEpisodeNumber);
  if (!nextEpisode) {
    setPlayerPlaying(false);
    setStatus("Episode selesai diputar.", "ok");
    return;
  }

  await openEpisode(nextEpisode.number, { trackEpisodeClick: false });
}

function setViewMode(mode) {
  const nextMode = ["home", "preview", "player"].includes(mode) ? mode : "home";
  state.viewMode = nextMode;

  const showHome = nextMode === "home";
  const showPreview = nextMode === "preview";
  const showPlayer = nextMode === "player";

  elements.homeScreen.classList.toggle("hidden", !showHome);
  elements.previewScreen.classList.toggle("hidden", !showPreview);
  elements.detailLayout.classList.toggle("hidden", !showPlayer);
  elements.homeBtn.classList.toggle("hidden", showHome);
  elements.appTopBar.classList.toggle("hidden", showPlayer || showPreview);
  elements.status.classList.toggle("hidden", !showHome);
  document.body.classList.toggle("preview-mode", showPreview);
  document.body.classList.toggle("player-mode", showPlayer);

  if (!showPlayer) {
    persistCurrentWatchProgress({ force: true });
    closeEpisodeSheet();
    setPlayerPlaying(false);
    setPlayerLoader(false);
  }

  if (showHome || showPreview) {
    hideLockNotice();
  }
  updateCenterPlayButton();
  renderYoutubeGate();
  if (!showHome && isSubscribePromoVisible()) {
    hideSubscribePromo({ setCooldown: false });
  }

  if (showHome) {
    renderHomeGrid();
    setStatus("", "");
    maybeShowSubscribePromo();
  }
}

function clearVideo() {
  elements.videoPlayer.pause();
  elements.videoPlayer.removeAttribute("src");
  elements.videoPlayer.load();
  state.isSeeking = false;
  state.pendingResumeSeconds = null;
  setPlayerLoader(false);
  syncPlaybackControls();
  updateCenterPlayButton();
}

async function openEpisode(episodeNumber, { resumeSeconds = null, trackEpisodeClick = true } = {}) {
  persistCurrentWatchProgress({ force: true });

  const episode = (state.drama?.episodes || []).find(
    (item) => Number(item.number) === Number(episodeNumber)
  );
  if (!episode) {
    return;
  }

  const lockState = getEpisodeLockState(episode);
  if (lockState.manual) {
    const reason = lockState.reason || "Episode ini sedang dikunci admin.";
    setStatus(reason, "error");
    setPlayerHint(reason);
    showLockNotice({
      title: `EP.${episode.number} Masih Di-lock`,
      message: reason,
      requireYoutube: false
    });
    return;
  }

  if (lockState.youtube) {
    const minEpisode = Math.max(1, Number(state.youtubeGate.minEpisode) || 10);
    setStatus(`Episode ${minEpisode}+ terkunci. Verifikasi YouTube dulu.`, "error");
    setPlayerHint(`Akses video episode ${minEpisode}+ dikunci sampai verifikasi YouTube selesai.`);
    showLockNotice({
      title: `EP.${episode.number} Masih Di-lock`,
      message: "Episode ini masih di-lock. Untuk unlock wajib subscribe channel kami lalu verifikasi akun YouTube.",
      requireYoutube: true
    });
    return;
  }

  if (trackEpisodeClick) {
    trackEpisodeClickMetric(state.drama?.id, episode.number);
    sendGaEvent("episode_select", {
      drama_id: String(state.drama?.id || ""),
      drama_title: String(state.drama?.title || ""),
      episode_number: Number(episode.number) || 0
    });
  }

  state.currentEpisodeNumber = episode.number;
  const resumeValue = Number(resumeSeconds);
  state.pendingResumeSeconds =
    Number.isFinite(resumeValue) && resumeValue > 0 ? Math.floor(resumeValue) : null;
  setPlayerPlaying(false);
  updatePlayerHeader();
  renderEpisodeSheet();

  if (!episode.hasVideo) {
    clearVideo();
    state.pendingResumeSeconds = null;
    setPlayerLoader(false);
    setPlayerHint("Video untuk episode ini belum dihubungkan ke channel Telegram.");
    setStatus("Episode dipilih, video belum tersedia.", "error");
    return;
  }

  setPlayerLoader(true, "Mengambil video...");
  setStatus("Mengambil URL video...", "");

  try {
    const response = await fetch(
      `/api/stream/${encodeURIComponent(state.drama.id)}/${encodeURIComponent(episode.number)}`,
      {
        headers: buildRequestHeaders()
      }
    );
    const payload = await response.json();

    if (!response.ok) {
      const error = new Error(payload.message || "Gagal memuat stream video.");
      error.detail = payload.detail || "";
      error.openInTelegramUrl = payload.openInTelegramUrl || "";
      error.verifyRequired = Boolean(payload.verifyRequired);
      error.lockRequired = Boolean(payload.lockRequired);
      error.lockReason = String(payload.lockReason || "").trim();
      error.minEpisode = Number(payload.minEpisode) || 0;
      error.requiredChannelUrl = String(payload.requiredChannelUrl || "").trim();
      throw error;
    }

    elements.videoPlayer.src = payload.streamUrl;
    setPlayerLoader(true, "Memuat video...");
    setPlayerHint("");
    setStatus("Video siap diputar.", "ok");
    syncPlaybackControls();
    updateCenterPlayButton();

    const adOk = await maybePlayPreroll(episode);
    if (!adOk) {
      setStatus("Iklan gagal dimuat. Coba lagi sebentar.", "error");
      setPlayerHint("Iklan gagal dimuat. Coba ulang untuk memutar episode.");
      return;
    }

    try {
      await elements.videoPlayer.play();
    } catch {
      // Browser dapat memblok autoplay.
    }
  } catch (error) {
    clearVideo();
    state.pendingResumeSeconds = null;
    setPlayerLoader(false);
    const detail = error.detail ? ` ${error.detail}` : "";
    const fallbackUrl = error.openInTelegramUrl || "";
    if (error.verifyRequired) {
      state.youtubeGate.enabled = true;
      state.youtubeGate.verified = false;
      if (Number.isInteger(Number(error.minEpisode)) && Number(error.minEpisode) > 0) {
        state.youtubeGate.minEpisode = Number(error.minEpisode);
      }
      if (error.requiredChannelUrl) {
        state.youtubeGate.requiredChannelUrl = error.requiredChannelUrl;
      }
      state.youtubeGate.verifyInProgress = false;
      renderYoutubeGate();
      setPlayerHint("Akses video dikunci. Silakan subscribe dan verifikasi YouTube dulu.");
      setStatus(error.message || "Verifikasi YouTube dibutuhkan sebelum menonton.", "error");
      showLockNotice({
        title: `EP.${episode.number} Masih Di-lock`,
        message: "Episode ini masih di-lock. Untuk unlock wajib subscribe channel kami lalu verifikasi akun YouTube.",
        requireYoutube: true
      });
      return;
    }

    if (error.lockRequired) {
      const lockMessage = String(error.lockReason || error.message || "Episode ini sedang dikunci admin.").trim();
      setPlayerHint(lockMessage);
      setStatus(lockMessage, "error");
      showLockNotice({
        title: `EP.${episode.number} Masih Di-lock`,
        message: lockMessage,
        requireYoutube: false
      });
      return;
    }

    if (fallbackUrl) {
      setPlayerHint(
        `Video belum bisa diputar. <a href="${fallbackUrl}" target="_blank" rel="noreferrer">Buka di Telegram</a>`,
        { html: true }
      );
    } else {
      setPlayerHint(`Terjadi masalah saat mengambil video.${detail}`);
    }

    setStatus(`${error.message}${detail}`, "error");
  }
}

async function setDramaById(dramaId, { openFirstEpisode = false, trackDramaClick = false } = {}) {
  const drama = state.dramas.find((item) => item.id === dramaId);
  if (!drama) {
    return;
  }

  state.drama = drama;
  if (trackDramaClick) {
    trackDramaClickMetric(drama.id);
    sendGaEvent("drama_select", {
      drama_id: String(drama.id || ""),
      drama_title: String(drama.title || "")
    });
  }
  if (elements.dramaPicker) {
    elements.dramaPicker.value = drama.id;
  }

  renderPreview(drama);
  renderHomeGrid();

  const resumeTarget = resolveResumeTargetForDrama(drama);
  const firstEpisode = getSortedEpisodes(drama)[0];
  state.currentEpisodeNumber = resumeTarget.episode?.number ?? null;
  updatePlayerHeader();
  renderEpisodeSheet();
  updateSaveButton();

  if (firstEpisode && openFirstEpisode) {
    await openEpisode(resumeTarget.episode.number, {
      resumeSeconds: resumeTarget.resumeSeconds,
      trackEpisodeClick: false
    });
  } else if (firstEpisode) {
    clearVideo();
    const minEpisode = Math.max(1, Number(state.youtubeGate.minEpisode) || 10);
    const hasUnlockedEpisode = getSortedEpisodes(drama).some(
      (episode) => !getEpisodeLockState(episode).locked
    );
    const hasManualLockedEpisode = getSortedEpisodes(drama).some((episode) => getEpisodeLockState(episode).manual);
    if (isYoutubeVerificationRequired() && !hasUnlockedEpisode) {
      setPlayerHint(`Episode ${minEpisode}+ terkunci sampai verifikasi YouTube selesai.`);
      setStatus(`Semua episode drama ini terkunci (>=EP${minEpisode}).`, "error");
      return;
    }

    if (hasManualLockedEpisode && !hasUnlockedEpisode) {
      setPlayerHint("Semua episode drama ini sedang dikunci admin.");
      setStatus("Episode dikunci admin.", "error");
      return;
    }

    if (resumeTarget.hasResume) {
      setPlayerHint(
        `Progress tersimpan di EP.${resumeTarget.episode.number} (${formatPlaybackTime(
          resumeTarget.resumeSeconds
        )}). Klik Tonton Sekarang untuk lanjut.`
      );
      setStatus("Drama dipilih. Lanjutkan dari progres terakhir.", "ok");
    } else {
      setPlayerHint("Klik Episode untuk memilih, lalu putar video.");
      setStatus("Drama dipilih. Klik Tonton Sekarang.", "ok");
    }
  } else {
    clearVideo();
    setPlayerHint("Drama ini belum punya episode.");
    setStatus("Drama tersedia, tetapi episode belum diisi.", "error");
  }
}

function selectDefaultDrama(dramas) {
  if (state.adminPreviewDramaId) {
    const fromPreview = dramas.find((drama) => drama.id === state.adminPreviewDramaId);
    if (fromPreview) {
      return fromPreview;
    }
  }

  const startDramaId = getStartParamDramaId();
  if (!startDramaId) {
    return dramas[0] || null;
  }

  return dramas.find((drama) => drama.id === startDramaId) || dramas[0] || null;
}

function toggleSavedDrama() {
  if (!state.drama) {
    return;
  }

  if (state.favorites.has(state.drama.id)) {
    state.favorites.delete(state.drama.id);
    delete state.savedHistory[state.drama.id];
    setStatus("Drama dihapus dari simpanan.", "ok");
  } else {
    state.favorites.add(state.drama.id);
    state.savedHistory[state.drama.id] = new Date().toISOString();
    setStatus("Drama disimpan.", "ok");
  }

  writeFavorites(state.favorites);
  writeSavedHistory(state.savedHistory);
  updateSaveButton();
  renderHomeCollections();
}

async function shareCurrentDrama() {
  if (!state.drama) {
    return;
  }

  const shareText = `Nonton ${state.drama.title} di TeleMiniDrama`;
  try {
    if (navigator.share) {
      await navigator.share({
        title: state.drama.title,
        text: shareText
      });
      setStatus("Berhasil membuka menu bagikan.", "ok");
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      setStatus("Teks share disalin ke clipboard.", "ok");
      return;
    }

    setStatus("Fitur bagikan tidak didukung di perangkat ini.", "error");
  } catch {
    setStatus("Bagikan dibatalkan.", "");
  }
}

function wireEvents() {
  if (elements.youtubeVerifyBtn) {
    elements.youtubeVerifyBtn.addEventListener("click", async () => {
      await startYoutubeVerification();
    });
  }

  window.addEventListener("message", async (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }

    const payload = event.data;
    if (!payload || payload.type !== YOUTUBE_VERIFY_MESSAGE_TYPE) {
      return;
    }

    stopYoutubeVerifyPopupMonitor();
    state.youtubeGate.verifyInProgress = false;
    if (payload.success && payload.verified) {
      await refreshYoutubeVerificationStatus({ silent: false });
      renderYoutubeGate();
      hideLockNotice();
      return;
    }

    const message = String(payload.message || "Verifikasi YouTube belum berhasil.").trim();
    setStatus(message, "error");
    await refreshYoutubeVerificationStatus({ silent: true });
    renderYoutubeGate();
  });

  elements.homeBtn.addEventListener("click", () => {
    persistCurrentWatchProgress({ force: true });
    clearVideo();
    setViewMode("home");
  });

  elements.playerBackBtn.addEventListener("click", () => {
    persistCurrentWatchProgress({ force: true });
    clearVideo();
    setViewMode("preview");
  });

  if (elements.previewBackBtn) {
    elements.previewBackBtn.addEventListener("click", () => {
      setViewMode("home");
    });
  }

  elements.watchNowBtn.addEventListener("click", async () => {
    if (!state.drama) {
      return;
    }

    const episodes = getSortedEpisodes(state.drama);
    if (!episodes.length) {
      setStatus("Drama ini belum punya episode.", "error");
      return;
    }

    const unlockedEpisodes = episodes.filter((episode) => !getEpisodeLockState(episode).locked);
    if (!unlockedEpisodes.length) {
      const minEpisode = Math.max(1, Number(state.youtubeGate.minEpisode) || 10);
      if (isYoutubeVerificationRequired()) {
        setStatus(`Episode ${minEpisode}+ terkunci. Subscribe dan verifikasi YouTube dulu.`, "error");
        showLockNotice({
          title: "Episode Masih Di-lock",
          message: "Semua episode yang tersedia masih di-lock. Untuk unlock wajib subscribe channel kami lalu verifikasi akun YouTube.",
          requireYoutube: true
        });
      } else {
        setStatus("Semua episode sedang dikunci admin.", "error");
        showLockNotice({
          title: "Episode Masih Di-lock",
          message: "Semua episode drama ini sedang di-lock oleh admin.",
          requireYoutube: false
        });
      }
      renderYoutubeGate();
      return;
    }

    const resumeTarget = resolveResumeTargetForDrama(state.drama);
    setViewMode("player");
    const targetEpisode = episodes.find(
      (episode) => Number(episode.number) === Number(state.currentEpisodeNumber)
    );
    let selectedEpisode = targetEpisode || resumeTarget.episode || episodes[0];
    if (selectedEpisode && getEpisodeLockState(selectedEpisode).locked) {
      selectedEpisode = unlockedEpisodes[0];
      setStatus("Episode lanjut terkunci. Diputar dari episode yang terbuka.", "ok");
    }

    const shouldResume =
      resumeTarget.hasResume &&
      Number(selectedEpisode?.number) === Number(resumeTarget.episode?.number) &&
      !getEpisodeLockState(selectedEpisode).locked;
    await openEpisode(selectedEpisode.number, {
      resumeSeconds: shouldResume ? resumeTarget.resumeSeconds : null
    });
  });

  elements.openEpisodeSheetBtn.addEventListener("click", () => {
    if (elements.episodeSheet.classList.contains("hidden")) {
      openEpisodeSheet();
      return;
    }

    closeEpisodeSheet();
  });

  elements.episodeSheetBackdrop.addEventListener("click", closeEpisodeSheet);
  if (elements.lockNoticeBackdrop) {
    elements.lockNoticeBackdrop.addEventListener("click", hideLockNotice);
  }
  if (elements.lockNoticeCloseBtn) {
    elements.lockNoticeCloseBtn.addEventListener("click", hideLockNotice);
  }
  if (elements.lockNoticeVerifyBtn) {
    elements.lockNoticeVerifyBtn.addEventListener("click", async () => {
      await startYoutubeVerification();
    });
  }
  if (elements.subscribePromoBackdrop) {
    elements.subscribePromoBackdrop.addEventListener("click", () => {
      hideSubscribePromo({ setCooldown: true });
    });
  }
  if (elements.subscribePromoLaterBtn) {
    elements.subscribePromoLaterBtn.addEventListener("click", () => {
      hideSubscribePromo({ setCooldown: true });
    });
  }
  if (elements.subscribePromoOpenBtn) {
    elements.subscribePromoOpenBtn.addEventListener("click", () => {
      hideSubscribePromo({ setCooldown: true });
    });
  }
  elements.saveDramaBtn.addEventListener("click", toggleSavedDrama);
  elements.shareDramaBtn.addEventListener("click", shareCurrentDrama);
  elements.centerPlayBtn.addEventListener("click", async () => {
    try {
      await elements.videoPlayer.play();
    } catch {
      // Abaikan jika browser masih menolak autoplay.
    }
  });
  elements.playPauseBtn.addEventListener("click", async () => {
    if (elements.videoPlayer.paused) {
      try {
        await elements.videoPlayer.play();
      } catch {
        // Abaikan jika browser menolak autoplay.
      }
      return;
    }

    elements.videoPlayer.pause();
  });
  elements.playerSeek.addEventListener("input", () => {
    state.isSeeking = true;
    syncPlaybackControls({ previewTime: Number(elements.playerSeek.value) || 0 });
  });
  elements.playerSeek.addEventListener("change", () => {
    const nextTime = Number(elements.playerSeek.value) || 0;
    elements.videoPlayer.currentTime = Math.max(0, nextTime);
    state.isSeeking = false;
    syncPlaybackControls();
    persistCurrentWatchProgress({ force: true });
  });
  elements.playerSeek.addEventListener("pointerup", () => {
    const nextTime = Number(elements.playerSeek.value) || 0;
    elements.videoPlayer.currentTime = Math.max(0, nextTime);
    state.isSeeking = false;
    syncPlaybackControls();
    persistCurrentWatchProgress({ force: true });
  });
  elements.videoPlayer.addEventListener("play", () => {
    setPlayerLoader(false);
    setPlayerPlaying(true);
    closeEpisodeSheet();
    setPlayerHint("");
    syncPlaybackControls();
  });
  elements.videoPlayer.addEventListener("loadstart", () => {
    setPlayerLoader(true, "Memuat video...");
  });
  elements.videoPlayer.addEventListener("waiting", () => {
    setPlayerLoader(true, "Buffering...");
  });
  elements.videoPlayer.addEventListener("stalled", () => {
    setPlayerLoader(true, "Koneksi lambat, buffering...");
  });
  elements.videoPlayer.addEventListener("seeking", () => {
    if (!elements.videoPlayer.paused) {
      setPlayerLoader(true, "Mencari posisi video...");
    }
  });
  elements.videoPlayer.addEventListener("seeked", () => {
    if (elements.videoPlayer.readyState >= 2) {
      setPlayerLoader(false);
    }
  });
  elements.videoPlayer.addEventListener("canplay", () => {
    setPlayerLoader(false);
  });
  elements.videoPlayer.addEventListener("canplaythrough", () => {
    setPlayerLoader(false);
  });
  elements.videoPlayer.addEventListener("playing", () => {
    setPlayerLoader(false);
  });
  elements.videoPlayer.addEventListener("loadedmetadata", () => {
    state.isSeeking = false;
    if (Number.isFinite(Number(state.pendingResumeSeconds)) && Number(state.pendingResumeSeconds) > 0) {
      const duration = Number(elements.videoPlayer.duration);
      const maxSeek = Number.isFinite(duration) && duration > 2 ? duration - 1 : Number(state.pendingResumeSeconds);
      const safeSeek = Math.max(0, Math.min(Number(state.pendingResumeSeconds), maxSeek));
      if (safeSeek > 0) {
        elements.videoPlayer.currentTime = safeSeek;
      }
    }
    state.pendingResumeSeconds = null;
    setPlayerLoader(false);
    syncPlaybackControls();
    updateCenterPlayButton();
  });
  elements.videoPlayer.addEventListener("durationchange", syncPlaybackControls);
  elements.videoPlayer.addEventListener("timeupdate", () => {
    if (!state.isSeeking) {
      syncPlaybackControls();
    }

    if (!elements.videoPlayer.paused) {
      persistCurrentWatchProgress();
    }
  });
  elements.videoPlayer.addEventListener("pause", () => {
    setPlayerPlaying(false);
    setPlayerLoader(false);
    state.isSeeking = false;
    syncPlaybackControls();
    persistCurrentWatchProgress({ force: true });
  });
  elements.videoPlayer.addEventListener("ended", async () => {
    setPlayerLoader(false);
    state.isSeeking = false;
    syncPlaybackControls();
    persistCurrentWatchProgress({ force: true });
    await playNextEpisodeIfAny();
  });
  elements.videoPlayer.addEventListener("error", () => {
    setPlayerLoader(false);
  });
  elements.videoPlayer.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  elements.videoPlayer.addEventListener("click", async () => {
    if (state.viewMode !== "player") {
      return;
    }

    if (elements.videoPlayer.paused) {
      try {
        await elements.videoPlayer.play();
      } catch {
        // Abaikan jika browser menolak autoplay.
      }
      return;
    }

    elements.videoPlayer.pause();
  });

  if (elements.dramaPicker) {
    elements.dramaPicker.addEventListener("change", async () => {
      await setDramaById(elements.dramaPicker.value, { openFirstEpisode: false, trackDramaClick: true });
      setViewMode("preview");
    });
  }

  if (elements.dramaSearch) {
    elements.dramaSearch.addEventListener("input", () => {
      state.searchQuery = String(elements.dramaSearch.value || "");
      renderHomeGrid();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isLockNoticeVisible()) {
        hideLockNotice();
      }
      closeEpisodeSheet();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      persistCurrentWatchProgress({ force: true });
    }
  });

  window.addEventListener("beforeunload", () => {
    persistCurrentWatchProgress({ force: true });
    stopYoutubeVerifyPopupMonitor();
    stopRealtimeLibraryPolling();
  });
}

async function init() {
  try {
    elements.videoPlayer.controls = false;
    elements.videoPlayer.setAttribute("controlsList", "nodownload noplaybackrate noremoteplayback");
    elements.videoPlayer.setAttribute("disablePictureInPicture", "true");
    elements.videoPlayer.setAttribute("disableRemotePlayback", "true");
    setPlayerLoader(false);
    syncPlaybackControls();
    updateCenterPlayButton();
    setupGa4TrackingFromServerConfig();
    renderVisitorStats();
    await loadYoutubeGateConfig();
    await refreshYoutubeVerificationStatus({ silent: true });

    const payload = await fetchLibraryPayload();
    if (!Array.isArray(payload?.dramas) || !payload.dramas.length) {
      throw new Error("Belum ada drama di data/library.json.");
    }

    applyLibraryDramas(payload.dramas);
    await fetchEngagementStats({ silent: true });
    try {
      await trackWebsiteVisit();
    } catch {
      // Abaikan jika pencatatan kunjungan gagal.
    }
    if (state.adminPreviewEnabled) {
      setStatus("Mode preview admin aktif.", "ok");
    }
    wireEvents();
    startRealtimeLibraryPolling();

    const startDramaId = getStartParamDramaId();
    const shouldOpenPreviewDrama = Boolean(startDramaId || state.adminPreviewDramaId);
    if (shouldOpenPreviewDrama) {
      const startDrama = selectDefaultDrama(state.dramas);
      if (startDrama) {
        await setDramaById(startDrama.id, { openFirstEpisode: false });
        setViewMode("preview");
        return;
      }
    }

    setViewMode("home");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

init();
