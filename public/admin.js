const STORAGE_KEY = "teleminidrama_admin_token";
const ADMIN_REALTIME_POLL_MS = 7000;

const state = {
  adminToken: localStorage.getItem(STORAGE_KEY) || "",
  library: { dramas: [] },
  selectedDramaId: "",
  formDirty: false,
  pollTimer: null,
  pollInFlight: false,
  selectedPosterFile: null,
  selectedUploadVideoFiles: []
};

const elements = {
  adminToken: document.getElementById("adminToken"),
  saveTokenBtn: document.getElementById("saveTokenBtn"),
  reloadBtn: document.getElementById("reloadBtn"),
  dramaSelect: document.getElementById("dramaSelect"),
  dramaForm: document.getElementById("dramaForm"),
  dramaId: document.getElementById("dramaId"),
  dramaTitle: document.getElementById("dramaTitle"),
  dramaYear: document.getElementById("dramaYear"),
  dramaCountry: document.getElementById("dramaCountry"),
  dramaPoster: document.getElementById("dramaPoster"),
  dramaSynopsis: document.getElementById("dramaSynopsis"),
  dramaPublishStatus: document.getElementById("dramaPublishStatus"),
  previewMiniAppBtn: document.getElementById("previewMiniAppBtn"),
  publishNowBtn: document.getElementById("publishNowBtn"),
  deleteDramaBtn: document.getElementById("deleteDramaBtn"),
  posterDropzone: document.getElementById("posterDropzone"),
  posterFile: document.getElementById("posterFile"),
  posterSelectedInfo: document.getElementById("posterSelectedInfo"),
  uploadPosterBtn: document.getElementById("uploadPosterBtn"),
  posterResult: document.getElementById("posterResult"),
  gdriveUploadFolderId: document.getElementById("gdriveUploadFolderId"),
  gdriveUploadStartEpisode: document.getElementById("gdriveUploadStartEpisode"),
  gdriveUploadDetectFromFilename: document.getElementById("gdriveUploadDetectFromFilename"),
  gdriveUploadOverwriteExisting: document.getElementById("gdriveUploadOverwriteExisting"),
  gdriveUploadSwitchSource: document.getElementById("gdriveUploadSwitchSource"),
  gdriveUploadDropzone: document.getElementById("gdriveUploadDropzone"),
  gdriveUploadFiles: document.getElementById("gdriveUploadFiles"),
  gdriveUploadSelectedInfo: document.getElementById("gdriveUploadSelectedInfo"),
  uploadToGdriveBtn: document.getElementById("uploadToGdriveBtn"),
  gdriveSyncFolderId: document.getElementById("gdriveSyncFolderId"),
  gdriveSyncOverwriteExisting: document.getElementById("gdriveSyncOverwriteExisting"),
  gdriveSyncSwitchSource: document.getElementById("gdriveSyncSwitchSource"),
  gdriveSyncCreateMissingEpisodes: document.getElementById("gdriveSyncCreateMissingEpisodes"),
  syncGdriveBtn: document.getElementById("syncGdriveBtn"),
  episodeSummaryMeta: document.getElementById("episodeSummaryMeta"),
  episodeTableBody: document.getElementById("episodeTableBody"),
  logBox: document.getElementById("logBox"),
  adminContent: document.getElementById("adminContent")
};

elements.adminToken.value = state.adminToken;

function currentTimeLabel() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

function log(message, payload = null, { append = false } = {}) {
  const time = currentTimeLabel();
  const lines = [`[${time}] ${message}`];

  if (payload !== null) {
    lines.push(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
  }

  const nextText = lines.join("\n");
  if (append && elements.logBox.textContent.trim()) {
    elements.logBox.textContent = `${elements.logBox.textContent}\n${nextText}`;
    return;
  }

  elements.logBox.textContent = nextText;
}

function appendLog(message, payload = null) {
  log(message, payload, { append: true });
}

function setAdminAccess(allowed) {
  if (!elements.adminContent) {
    return;
  }

  elements.adminContent.classList.toggle("hidden", !allowed);
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function tryAssignFilesToInput(inputElement, files) {
  if (!inputElement) {
    return false;
  }

  try {
    const transfer = new DataTransfer();
    for (const file of files || []) {
      transfer.items.add(file);
    }
    inputElement.files = transfer.files;
    return true;
  } catch {
    return false;
  }
}

function clearPosterSelection() {
  state.selectedPosterFile = null;
  if (elements.posterFile) {
    elements.posterFile.value = "";
  }
  if (elements.posterDropzone) {
    elements.posterDropzone.classList.remove("has-files");
  }
  if (elements.posterSelectedInfo) {
    elements.posterSelectedInfo.textContent = "Belum ada file poster dipilih.";
  }
}

function clearVideoSelection() {
  state.selectedUploadVideoFiles = [];
  if (elements.gdriveUploadFiles) {
    elements.gdriveUploadFiles.value = "";
  }
  if (elements.gdriveUploadDropzone) {
    elements.gdriveUploadDropzone.classList.remove("has-files");
  }
  if (elements.gdriveUploadSelectedInfo) {
    elements.gdriveUploadSelectedInfo.textContent = "Belum ada file video dipilih.";
  }
}

function updatePosterSelectionInfo() {
  if (!elements.posterSelectedInfo) {
    return;
  }

  const file = state.selectedPosterFile;
  if (!file) {
    elements.posterSelectedInfo.textContent = "Belum ada file poster dipilih.";
    elements.posterDropzone?.classList.remove("has-files");
    return;
  }

  elements.posterSelectedInfo.textContent = `Poster dipilih: ${file.name} (${formatFileSize(file.size)})`;
  elements.posterDropzone?.classList.add("has-files");
}

function updateVideoSelectionInfo() {
  if (!elements.gdriveUploadSelectedInfo) {
    return;
  }

  const files = state.selectedUploadVideoFiles || [];
  if (!files.length) {
    elements.gdriveUploadSelectedInfo.textContent = "Belum ada file video dipilih.";
    elements.gdriveUploadDropzone?.classList.remove("has-files");
    return;
  }

  const totalSize = files.reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
  const firstNames = files.slice(0, 3).map((file) => file.name).join(", ");
  const moreText = files.length > 3 ? ` (+${files.length - 3} file lagi)` : "";
  elements.gdriveUploadSelectedInfo.textContent =
    `${files.length} file dipilih (${formatFileSize(totalSize)}): ${firstNames}${moreText}`;
  elements.gdriveUploadDropzone?.classList.add("has-files");
}

function isLikelyVideoFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("video/")) {
    return true;
  }

  const name = String(file?.name || "").toLowerCase();
  return /\.(mp4|m4v|mov|mkv|avi|webm|wmv|mpeg|mpg)$/.test(name);
}

function selectPosterFile(files) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) {
    clearPosterSelection();
    return;
  }

  const imageFile = list.find((file) => String(file?.type || "").startsWith("image/"));
  if (!imageFile) {
    throw new Error("File poster harus berupa gambar (jpg/png/webp).");
  }

  state.selectedPosterFile = imageFile;
  tryAssignFilesToInput(elements.posterFile, [imageFile]);
  updatePosterSelectionInfo();
}

function selectVideoFiles(files) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) {
    clearVideoSelection();
    return;
  }

  const videoFiles = list.filter((file) => isLikelyVideoFile(file));
  if (!videoFiles.length) {
    throw new Error("File yang dipilih bukan video episode.");
  }

  state.selectedUploadVideoFiles = videoFiles;
  tryAssignFilesToInput(elements.gdriveUploadFiles, videoFiles);
  updateVideoSelectionInfo();
}

function bindDropzone(dropzone, inputElement, onSelectFiles) {
  if (!dropzone || !inputElement || typeof onSelectFiles !== "function") {
    return;
  }

  let dragDepth = 0;
  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  dropzone.addEventListener("dragenter", (event) => {
    preventDefaults(event);
    dragDepth += 1;
    dropzone.classList.add("is-dragover");
  });

  dropzone.addEventListener("dragover", (event) => {
    preventDefaults(event);
    dropzone.classList.add("is-dragover");
  });

  dropzone.addEventListener("dragleave", (event) => {
    preventDefaults(event);
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      dropzone.classList.remove("is-dragover");
    }
  });

  dropzone.addEventListener("drop", (event) => {
    preventDefaults(event);
    dragDepth = 0;
    dropzone.classList.remove("is-dragover");

    const droppedFiles = [...(event.dataTransfer?.files || [])];
    if (!droppedFiles.length) {
      return;
    }

    try {
      onSelectFiles(droppedFiles);
    } catch (error) {
      log("File drag & drop ditolak.", error.message);
    }
  });

  dropzone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    inputElement.click();
  });

  inputElement.addEventListener("change", () => {
    const pickedFiles = [...(inputElement.files || [])];
    try {
      onSelectFiles(pickedFiles);
    } catch (error) {
      log("File upload ditolak.", error.message);
    }
  });
}

function initUploadDropzones() {
  bindDropzone(elements.posterDropzone, elements.posterFile, selectPosterFile);
  bindDropzone(elements.gdriveUploadDropzone, elements.gdriveUploadFiles, selectVideoFiles);

  updatePosterSelectionInfo();
  updateVideoSelectionInfo();
}

function parseApiErrorMessage(payload, statusCode) {
  const baseMessage = payload?.message || `HTTP ${statusCode}`;
  const detail = payload?.detail ? String(payload.detail).trim() : "";
  return detail ? `${baseMessage} ${detail}` : baseMessage;
}

function apiFormWithProgress(url, formData, onProgress = null) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);

    if (state.adminToken) {
      xhr.setRequestHeader("x-admin-token", state.adminToken);
    }

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) {
        return;
      }

      const loaded = Number(event.loaded || 0);
      const total = Number(event.total || 0);
      const percent = total > 0 ? (loaded / total) * 100 : 0;
      onProgress({ loaded, total, percent });
    };

    xhr.onerror = () => {
      reject(new Error("Koneksi gagal saat upload ke server."));
    };

    xhr.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        payload = {};
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(parseApiErrorMessage(payload, xhr.status)));
        return;
      }

      resolve(payload);
    };

    xhr.send(formData);
  });
}

function buildGdriveUploadDetailLines(response, totalFiles) {
  const results = Array.isArray(response?.results) ? response.results : [];
  const total = Number(response?.stats?.totalFiles) || results.length || totalFiles || 0;
  if (!total) {
    return [];
  }

  return results.map((item, index) => {
    const progressPercent = Math.round(((index + 1) / total) * 100);
    const episodeNumber = Number(item?.episodeNumber);
    const episodeLabel = Number.isInteger(episodeNumber) && episodeNumber > 0 ? `EP${episodeNumber}` : "EP?";
    const fileName = String(item?.fileName || "").trim();
    const base = `${progressPercent}% ${episodeLabel}`;

    if (item?.status === "uploaded") {
      return `${base} terupload${fileName ? ` - ${fileName}` : ""}`;
    }

    if (item?.status === "skipped") {
      const reason = String(item?.reason || "sudah ada, dilewati").trim();
      return `${base} dilewati - ${reason}`;
    }

    if (item?.status === "rejected") {
      const reason = String(item?.reason || "ditolak").trim();
      return `${base} ditolak - ${reason}`;
    }

    const statusText = String(item?.status || "unknown").trim();
    return `${base} status ${statusText}${fileName ? ` - ${fileName}` : ""}`;
  });
}

function buildGdriveUploadSummary(response, totalFiles) {
  const total = Number(response?.stats?.totalFiles) || totalFiles || 0;
  const uploaded = Number(response?.stats?.uploaded) || 0;
  const skipped = Number(response?.stats?.skipped) || 0;
  const detailLines = buildGdriveUploadDetailLines(response, totalFiles);

  return [
    `Total file: ${total}`,
    `Uploaded: ${uploaded}`,
    `Skipped: ${skipped}`,
    ...detailLines
  ].join("\n");
}

function buildGdriveSyncSummary(response) {
  const stats = response?.stats || {};
  const results = Array.isArray(response?.results) ? response.results : [];
  const lines = [
    `Folder: ${response?.folderId || "-"}`,
    `Folder resolve otomatis by drama: ${response?.folderResolvedByDramaName ? "ya" : "tidak"}`,
    `Mode recursive: ${response?.recursive ? "ya" : "tidak"} (depth ${Number(response?.recursiveDepth) || 1})`,
    `Folder discan: ${Number(stats.scannedFolders) || 0}`,
    `Subfolder ditemukan: ${Number(stats.subfoldersFound) || 0}`,
    `Total item folder: ${Number(stats.totalFolderItems) || 0}`,
    `Video terdeteksi: ${Number(stats.totalDriveVideoFiles) || 0}`,
    `Updated: ${Number(stats.updated) || 0}`,
    `Created: ${Number(stats.created) || 0}`,
    `Skipped: ${Number(stats.skipped) || 0}`
  ];

  const warning = String(response?.warning || "").trim();
  if (warning) {
    lines.push(`Warning: ${warning}`);
  }

  for (const item of results) {
    const number = Number(item?.episodeNumber);
    const label = Number.isInteger(number) && number > 0 ? `EP${number}` : "EP?";
    const status = String(item?.status || "unknown").trim();
    const fileName = String(item?.fileName || "").trim();
    const reason = String(item?.reason || "").trim();
    lines.push(`${label} ${status}${fileName ? ` - ${fileName}` : ""}${reason ? ` (${reason})` : ""}`);
  }

  return lines.join("\n");
}

function toSlug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractGoogleDriveId(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^["'<>]+|["'<>]+$/g, "");

  if (!raw) {
    return "";
  }

  if (!raw.includes("://")) {
    return raw.split(/[?#]/)[0].trim();
  }

  try {
    const parsed = new URL(raw);
    const fromQuery = String(parsed.searchParams.get("id") || "").trim();
    if (fromQuery) {
      return extractGoogleDriveId(fromQuery);
    }

    const patterns = [
      /\/folders\/([A-Za-z0-9_-]+)/i,
      /\/file\/d\/([A-Za-z0-9_-]+)/i,
      /\/document\/d\/([A-Za-z0-9_-]+)/i,
      /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/i,
      /\/presentation\/d\/([A-Za-z0-9_-]+)/i,
      /\/d\/([A-Za-z0-9_-]+)/i
    ];

    for (const pattern of patterns) {
      const match = parsed.pathname.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
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

async function api(url, options = {}, expectJson = true) {
  const headers = new Headers(options.headers || {});

  if (state.adminToken) {
    headers.set("x-admin-token", state.adminToken);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!expectJson) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const baseMessage = payload.message || `HTTP ${response.status}`;
    const detail = payload.detail ? String(payload.detail).trim() : "";
    const message = detail ? `${baseMessage} ${detail}` : baseMessage;
    throw new Error(message);
  }

  return payload;
}

function parseTimestamp(value) {
  const time = Date.parse(String(value || "").trim());
  return Number.isFinite(time) ? time : 0;
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

function getDramaById(dramaId) {
  return state.library.dramas.find((item) => item.id === dramaId) || null;
}

function getSortedEpisodes(drama) {
  return [...(drama?.episodes || [])].sort((a, b) => Number(a.number) - Number(b.number));
}

function normalizeEpisodeSource(episode) {
  const source = String(episode?.source || "").trim().toLowerCase();
  if (source === "telegram" || source === "gdrive") {
    return source;
  }

  if (String(episode?.gdriveFileId || "").trim()) {
    return "gdrive";
  }

  return "telegram";
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

function isEpisodeLocked(episode) {
  return parseBooleanFlag(episode?.locked);
}

function getEpisodeLockReason(episode) {
  return String(episode?.lockReason || "").trim();
}

function hasEpisodeVideo(episode) {
  const source = normalizeEpisodeSource(episode);
  if (source === "gdrive") {
    return Boolean(String(episode?.gdriveFileId || "").trim());
  }

  return Boolean(String(episode?.telegramFileId || "").trim());
}

function getNextEpisodeNumber(drama) {
  const episodes = getSortedEpisodes(drama);
  if (!episodes.length) {
    return 1;
  }

  const numbers = episodes
    .map((episode) => Number(episode.number))
    .filter((number) => Number.isInteger(number) && number > 0);

  if (!numbers.length) {
    return 1;
  }

  return Math.max(...numbers) + 1;
}

function setFormDirty(value) {
  state.formDirty = Boolean(value);
}

function captureDramaFormDraft() {
  return {
    selectedDramaId: state.selectedDramaId,
    dramaId: elements.dramaId.value,
    dramaTitle: elements.dramaTitle.value,
    dramaYear: elements.dramaYear.value,
    dramaCountry: elements.dramaCountry.value,
    dramaPoster: elements.dramaPoster.value,
    dramaSynopsis: elements.dramaSynopsis.value,
    dramaPublishStatus: elements.dramaPublishStatus.value,
    gdriveUploadFolderId: elements.gdriveUploadFolderId.value,
    gdriveUploadStartEpisode: elements.gdriveUploadStartEpisode.value,
    gdriveSyncFolderId: elements.gdriveSyncFolderId.value
  };
}

function restoreDramaFormDraft(draft) {
  if (!draft) {
    return;
  }

  if (String(draft.selectedDramaId || "").trim()) {
    state.selectedDramaId = String(draft.selectedDramaId || "").trim();
    elements.dramaSelect.value = state.selectedDramaId;
  }

  elements.dramaId.value = draft.dramaId || "";
  elements.dramaTitle.value = draft.dramaTitle || "";
  elements.dramaYear.value = draft.dramaYear || "";
  elements.dramaCountry.value = draft.dramaCountry || "";
  elements.dramaPoster.value = draft.dramaPoster || "";
  elements.dramaSynopsis.value = draft.dramaSynopsis || "";
  elements.dramaPublishStatus.value = normalizePublishStatus(draft.dramaPublishStatus, "private");
  elements.gdriveUploadFolderId.value = draft.gdriveUploadFolderId || "";
  elements.gdriveUploadStartEpisode.value = draft.gdriveUploadStartEpisode || "";
  elements.gdriveSyncFolderId.value = draft.gdriveSyncFolderId || "";
}

function fillDramaForm(drama) {
  if (!drama) {
    elements.dramaId.value = "";
    elements.dramaTitle.value = "";
    elements.dramaYear.value = "";
    elements.dramaCountry.value = "";
    elements.dramaPoster.value = "";
    elements.dramaSynopsis.value = "";
    elements.dramaPublishStatus.value = "private";
    elements.gdriveUploadFolderId.value = "";
    elements.gdriveUploadStartEpisode.value = "";
    elements.gdriveSyncFolderId.value = "";
    elements.deleteDramaBtn.disabled = true;
    return;
  }

  elements.dramaId.value = drama.id || "";
  elements.dramaTitle.value = drama.title || "";
  elements.dramaYear.value = drama.year || "";
  elements.dramaCountry.value = drama.country || "";
  elements.dramaPoster.value = drama.poster || "";
  elements.dramaSynopsis.value = drama.synopsis || "";
  elements.dramaPublishStatus.value = normalizePublishStatus(drama.publishStatus, "private");
  elements.gdriveUploadFolderId.value = "";
  elements.gdriveUploadStartEpisode.value = "";
  elements.gdriveSyncFolderId.value = drama.gdriveFolderId || "";
  elements.deleteDramaBtn.disabled = false;
}

function renderDramaSelect() {
  const dramas = state.library.dramas || [];
  elements.dramaSelect.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "+ Buat Drama Baru";
  elements.dramaSelect.appendChild(defaultOption);

  for (const drama of dramas) {
    const option = document.createElement("option");
    option.value = drama.id;
    option.textContent = `${drama.title} (${drama.id})`;
    elements.dramaSelect.appendChild(option);
  }

  if (state.selectedDramaId && getDramaById(state.selectedDramaId)) {
    elements.dramaSelect.value = state.selectedDramaId;
  } else {
    state.selectedDramaId = "";
    elements.dramaSelect.value = "";
  }

  fillDramaForm(getDramaById(state.selectedDramaId));
  renderEpisodeSummary();
}

function renderNoEpisodeRow(message) {
  elements.episodeTableBody.innerHTML = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.textContent = message;
  row.appendChild(cell);
  elements.episodeTableBody.appendChild(row);
}

function renderEpisodeSummary() {
  const drama = getDramaById(state.selectedDramaId);
  if (!drama) {
    elements.episodeSummaryMeta.textContent = "Pilih drama dulu untuk melihat episode.";
    renderNoEpisodeRow("Belum ada drama terpilih.");
    return;
  }

  const episodes = getSortedEpisodes(drama);
  const nextEpisode = getNextEpisodeNumber(drama);
  const lockedCount = episodes.filter((episode) => isEpisodeLocked(episode)).length;
  elements.episodeSummaryMeta.textContent = `Total episode: ${episodes.length}. Terkunci: ${lockedCount}. Episode berikutnya: ${nextEpisode}.`;

  if (!episodes.length) {
    renderNoEpisodeRow("Belum ada episode tersimpan.");
    return;
  }

  elements.episodeTableBody.innerHTML = "";
  for (const episode of episodes) {
    const row = document.createElement("tr");

    const numberCell = document.createElement("td");
    numberCell.textContent = `E${episode.number}`;

    const titleCell = document.createElement("td");
    titleCell.textContent = episode.title || "-";

    const sourceCell = document.createElement("td");
    const sourceBadge = document.createElement("span");
    const source = normalizeEpisodeSource(episode);
    sourceBadge.className = `source-badge ${source}`;
    sourceBadge.textContent = source;
    sourceCell.appendChild(sourceBadge);

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    const hasVideo = hasEpisodeVideo(episode);
    const locked = isEpisodeLocked(episode);
    statusBadge.className = `status-badge ${locked ? "locked" : hasVideo ? "ready" : "pending"}`;
    statusBadge.textContent = locked ? "Dikunci" : hasVideo ? "Siap putar" : "Belum ada video";
    statusCell.appendChild(statusBadge);

    const adCell = document.createElement("td");
    const adRequired = parseBooleanFlag(episode?.adRequired);
    const adButton = document.createElement("button");
    adButton.type = "button";
    adButton.className = `btn-inline ad ${adRequired ? "on" : "off"}`;
    adButton.dataset.action = "toggle-ad-episode";
    adButton.dataset.episodeNumber = String(episode.number);
    adButton.dataset.adRequired = adRequired ? "1" : "0";
    adButton.textContent = adRequired ? "Iklan ON" : "Iklan OFF";
    adCell.appendChild(adButton);

    const actionCell = document.createElement("td");
    actionCell.className = "actions";
    const lockButton = document.createElement("button");
    lockButton.type = "button";
    lockButton.className = `btn-inline ${locked ? "unlock" : "lock"}`;
    lockButton.dataset.action = "toggle-lock-episode";
    lockButton.dataset.episodeNumber = String(episode.number);
    lockButton.dataset.locked = locked ? "1" : "0";
    lockButton.dataset.lockReason = getEpisodeLockReason(episode);
    lockButton.textContent = locked ? "Buka Lock" : "Lock";
    actionCell.appendChild(lockButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-inline delete";
    deleteButton.dataset.action = "delete-episode";
    deleteButton.dataset.episodeNumber = String(episode.number);
    deleteButton.textContent = "Hapus";
    actionCell.appendChild(deleteButton);

    row.append(numberCell, titleCell, sourceCell, statusCell, adCell, actionCell);
    elements.episodeTableBody.appendChild(row);
  }
}

async function refreshLibrary({ silent = false, fromPolling = false } = {}) {
  const draft = fromPolling && state.formDirty ? captureDramaFormDraft() : null;
  const draftSelectedDramaId = String(draft?.selectedDramaId || "").trim();
  const hasDirtyCreateDraft = Boolean(draft) && !draftSelectedDramaId;
  const payload = await api("/api/admin/library");
  const dramas = Array.isArray(payload?.dramas) ? [...payload.dramas] : [];
  dramas.sort((a, b) => parseTimestamp(b?.createdAt) - parseTimestamp(a?.createdAt));

  state.library = {
    ...payload,
    dramas
  };

  if (state.selectedDramaId && !getDramaById(state.selectedDramaId)) {
    state.selectedDramaId = "";
    state.formDirty = false;
  }

  if (!state.selectedDramaId && state.library.dramas.length && !hasDirtyCreateDraft) {
    state.selectedDramaId = state.library.dramas[0].id;
  }

  renderDramaSelect();

  if (draft) {
    if (draftSelectedDramaId && getDramaById(draftSelectedDramaId)) {
      restoreDramaFormDraft(draft);
    } else if (!draftSelectedDramaId) {
      // Tetap di mode "Buat Drama Baru" saat polling realtime.
      state.selectedDramaId = "";
      elements.dramaSelect.value = "";
      restoreDramaFormDraft(draft);
      renderEpisodeSummary();
    }
  }

  if (!silent) {
    log("Library berhasil dimuat.", {
      totalDrama: state.library.dramas.length
    });
  }
}

function stopRealtimePolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startRealtimePolling() {
  stopRealtimePolling();

  if (!state.adminToken) {
    return;
  }

  state.pollTimer = setInterval(async () => {
    if (document.hidden || state.pollInFlight) {
      return;
    }

    state.pollInFlight = true;
    try {
      await refreshLibrary({ silent: true, fromPolling: true });
    } catch {
      // Abaikan error polling agar log tidak banjir.
    } finally {
      state.pollInFlight = false;
    }
  }, ADMIN_REALTIME_POLL_MS);
}

function requireTokenOrThrow() {
  if (!state.adminToken) {
    throw new Error("Isi ADMIN_TOKEN dulu.");
  }
}

async function validateAdminAccess() {
  if (!state.adminToken) {
    setAdminAccess(false);
    return false;
  }

  try {
    await refreshLibrary({ silent: true });
    setFormDirty(false);
    setAdminAccess(true);
    startRealtimePolling();
    return true;
  } catch (error) {
    setAdminAccess(false);
    stopRealtimePolling();
    throw error;
  }
}

function buildDramaPayload({ publishNow = false } = {}) {
  const idInput = elements.dramaId.value.trim();
  const title = elements.dramaTitle.value.trim();
  if (!title) {
    throw new Error("Judul drama wajib diisi.");
  }

  const isCreate = !String(state.selectedDramaId || "").trim();
  let publishStatus = publishNow
    ? "published"
    : normalizePublishStatus(elements.dramaPublishStatus.value, "private");
  if (isCreate && !publishNow) {
    publishStatus = "private";
  }

  return {
    id: idInput || (state.selectedDramaId || toSlug(title)),
    title,
    year: elements.dramaYear.value ? Number(elements.dramaYear.value) : null,
    country: elements.dramaCountry.value.trim(),
    poster: elements.dramaPoster.value.trim(),
    synopsis: elements.dramaSynopsis.value.trim(),
    publishStatus,
    publishNow
  };
}

async function saveDramaMetadata({ publishNow = false } = {}) {
  requireTokenOrThrow();
  const payload = buildDramaPayload({ publishNow });
  const response = await api("/api/admin/dramas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  state.selectedDramaId = response.drama.id;
  await refreshLibrary({ silent: true });
  setFormDirty(false);
  return response;
}

elements.saveTokenBtn.addEventListener("click", () => {
  state.adminToken = elements.adminToken.value.trim();
  localStorage.setItem(STORAGE_KEY, state.adminToken);
  validateAdminAccess()
    .then((ok) => {
      if (ok) {
        log("Token admin valid. Dashboard dibuka.", {
          totalDrama: state.library.dramas.length
        });
      }
    })
    .catch((error) => {
      log("Token admin tidak valid.", error.message);
    });
});

elements.reloadBtn.addEventListener("click", async () => {
  try {
    requireTokenOrThrow();
    await validateAdminAccess();
    log("Library berhasil dimuat.", { totalDrama: state.library.dramas.length });
  } catch (error) {
    log("Gagal reload library.", error.message);
  }
});

elements.dramaSelect.addEventListener("change", () => {
  state.selectedDramaId = elements.dramaSelect.value;
  setFormDirty(false);
  fillDramaForm(getDramaById(state.selectedDramaId));
  renderEpisodeSummary();
});

elements.dramaTitle.addEventListener("input", () => {
  setFormDirty(true);
  if (!state.selectedDramaId && !elements.dramaId.value.trim()) {
    elements.dramaId.value = toSlug(elements.dramaTitle.value);
  }
});

for (const input of [
  elements.dramaId,
  elements.dramaYear,
  elements.dramaCountry,
  elements.dramaPoster,
  elements.dramaSynopsis,
  elements.dramaPublishStatus,
  elements.gdriveUploadFolderId,
  elements.gdriveUploadStartEpisode,
  elements.gdriveSyncFolderId
]) {
  input?.addEventListener("input", () => {
    setFormDirty(true);
  });
  input?.addEventListener("change", () => {
    setFormDirty(true);
  });
}

elements.dramaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const response = await saveDramaMetadata();
    log("Metadata drama berhasil disimpan.", response.drama);
    if (response?.gdriveFolder?.folderId) {
      appendLog("Folder Google Drive drama:", response.gdriveFolder);
    }
    if (response?.warning) {
      appendLog("Catatan:", response.warning);
    }
  } catch (error) {
    log("Gagal simpan metadata drama.", error.message);
  }
});

elements.publishNowBtn.addEventListener("click", async () => {
  try {
    const response = await saveDramaMetadata({ publishNow: true });
    log("Drama berhasil dipublish sekarang.", response.drama);
    if (response?.gdriveFolder?.folderId) {
      appendLog("Folder Google Drive drama:", response.gdriveFolder);
    }
    if (response?.warning) {
      appendLog("Catatan:", response.warning);
    }
  } catch (error) {
    log("Gagal publish drama.", error.message);
  }
});

elements.previewMiniAppBtn.addEventListener("click", async () => {
  try {
    const response = await saveDramaMetadata();
    const dramaId = String(response?.drama?.id || "").trim();
    if (!dramaId) {
      throw new Error("Drama belum tersimpan.");
    }

    const token = String(state.adminToken || "").trim();
    if (!token) {
      throw new Error("ADMIN_TOKEN belum diisi.");
    }

    const previewUrl = new URL("/", window.location.origin);
    previewUrl.searchParams.set("adminPreview", "1");
    previewUrl.searchParams.set("dramaId", dramaId);
    previewUrl.searchParams.set("adminToken", token);
    window.open(previewUrl.toString(), "_blank", "noopener");

    log("Membuka mini app mode preview.", {
      dramaId,
      publishStatus: response.drama.publishStatus
    });
    if (response?.gdriveFolder?.folderId) {
      appendLog("Folder Google Drive drama:", response.gdriveFolder);
    }
    if (response?.warning) {
      appendLog("Catatan:", response.warning);
    }
  } catch (error) {
    log("Gagal membuka preview mini app.", error.message);
  }
});

elements.deleteDramaBtn.addEventListener("click", async () => {
  try {
    requireTokenOrThrow();
    const drama = getDramaById(state.selectedDramaId);
    if (!drama) {
      throw new Error("Pilih drama dulu.");
    }

    const confirmed = window.confirm(
      `Hapus drama "${drama.title}" beserta semua episode? Folder Google Drive drama juga akan dihapus (jika bukan folder parent default).`
    );
    if (!confirmed) {
      return;
    }

    const payload = await api(`/api/admin/dramas/${encodeURIComponent(drama.id)}`, {
      method: "DELETE"
    });

    state.selectedDramaId = "";
    setFormDirty(false);
    await refreshLibrary();
    log("Drama berhasil dihapus.", payload);
  } catch (error) {
    log("Gagal hapus drama.", error.message);
  }
});

elements.episodeTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  try {
    requireTokenOrThrow();
    const drama = getDramaById(state.selectedDramaId);
    if (!drama) {
      throw new Error("Pilih drama dulu.");
    }

    const episodeNumber = Number(button.dataset.episodeNumber);
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
      throw new Error("Nomor episode tidak valid.");
    }

  const action = String(button.dataset.action || "").trim();
  if (action === "toggle-ad-episode") {
    const currentAd = parseBooleanFlag(button.dataset.adRequired);
    const nextAd = !currentAd;
    const payload = await api(
      `/api/admin/dramas/${encodeURIComponent(drama.id)}/episodes/${encodeURIComponent(
        episodeNumber
      )}/ads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          adRequired: nextAd
        })
      }
    );

    await refreshLibrary();
    log(`Iklan episode ${episodeNumber} berhasil diperbarui.`, payload);
    return;
  }

  if (action === "toggle-lock-episode") {
      const currentLocked = parseBooleanFlag(button.dataset.locked);
      const shouldLock = !currentLocked;
      let lockReason = "";
      if (shouldLock) {
        const promptValue = window.prompt(
          `Masukkan alasan lock untuk episode ${episodeNumber} (opsional):`,
          String(button.dataset.lockReason || "").trim()
        );
        if (promptValue === null) {
          return;
        }
        lockReason = String(promptValue || "").trim();
      }

      const payload = await api(
        `/api/admin/dramas/${encodeURIComponent(drama.id)}/episodes/${encodeURIComponent(
          episodeNumber
        )}/lock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            locked: shouldLock,
            lockReason
          })
        }
      );

      await refreshLibrary();
      log(`Lock episode ${episodeNumber} berhasil diperbarui.`, payload);
      return;
    }

    if (action === "delete-episode") {
      const confirmed = window.confirm(
        `Hapus episode ${episodeNumber}? File episode di Google Drive juga akan dihapus.`
      );
      if (!confirmed) {
        return;
      }

      const payload = await api(
        `/api/admin/dramas/${encodeURIComponent(drama.id)}/episodes/${encodeURIComponent(episodeNumber)}`,
        {
          method: "DELETE"
        }
      );

      await refreshLibrary();
      log(`Episode ${episodeNumber} berhasil dihapus.`, payload);
    }
  } catch (error) {
    log("Gagal memproses aksi episode.", error.message);
  }
});

elements.uploadPosterBtn.addEventListener("click", async () => {
  try {
    requireTokenOrThrow();

    const file = state.selectedPosterFile || elements.posterFile.files?.[0] || null;
    if (!file) {
      throw new Error("Pilih file poster dulu.");
    }

    let selectedDramaId = String(state.selectedDramaId || "").trim();
    if (!selectedDramaId) {
      const saveResponse = await saveDramaMetadata();
      selectedDramaId = String(saveResponse?.drama?.id || "").trim();
      appendLog("Metadata drama disimpan otomatis sebelum upload poster.", saveResponse?.drama || null);
    }

    const formData = new FormData();
    formData.append("posterFile", file);
    if (selectedDramaId) {
      formData.append("dramaId", selectedDramaId);
    }

    const payload = await api("/api/admin/upload-poster", {
      method: "POST",
      body: formData
    });

    elements.dramaPoster.value = payload.posterUrl;
    if (payload.dramaAutoSaved) {
      await refreshLibrary();
      elements.posterResult.textContent = `Poster terupload & tersimpan ke metadata: ${payload.posterUrl}`;
      log("Upload poster sukses dan metadata otomatis terupdate.", payload);
    } else {
      elements.posterResult.textContent = `Poster terupload: ${payload.posterUrl}`;
      log("Upload poster sukses.", payload);
      if (payload.warning) {
        appendLog("Catatan:", payload.warning);
      }
    }

    clearPosterSelection();
  } catch (error) {
    elements.posterResult.textContent = `Upload poster gagal: ${error.message}`;
    log("Upload poster gagal.", error.message);
  }
});

elements.uploadToGdriveBtn.addEventListener("click", async () => {
  try {
    requireTokenOrThrow();

    const drama = getDramaById(state.selectedDramaId);
    if (!drama) {
      throw new Error("Pilih/simpan drama terlebih dahulu.");
    }

    const files = state.selectedUploadVideoFiles.length
      ? [...state.selectedUploadVideoFiles]
      : [...(elements.gdriveUploadFiles.files || [])];
    if (!files.length) {
      throw new Error("Pilih minimal 1 file video untuk upload ke Google Drive.");
    }

    const formData = new FormData();
    const folderId = extractGoogleDriveId(elements.gdriveUploadFolderId.value);
    if (folderId) {
      formData.append("folderId", folderId);
    }

    const startEpisodeRaw = elements.gdriveUploadStartEpisode.value.trim();
    if (startEpisodeRaw) {
      formData.append("startEpisode", startEpisodeRaw);
    }

    formData.append(
      "detectFromFilename",
      elements.gdriveUploadDetectFromFilename.checked ? "true" : "false"
    );
    formData.append(
      "overwriteExisting",
      elements.gdriveUploadOverwriteExisting.checked ? "true" : "false"
    );
    formData.append("switchSource", elements.gdriveUploadSwitchSource.checked ? "true" : "false");

    for (const file of files) {
      formData.append("videos", file, file.name);
    }

    const uploadUrl = `/api/admin/dramas/${encodeURIComponent(drama.id)}/upload-episodes-gdrive`;
    let lastProgressPercent = -1;
    log(`Mengupload ${files.length} file episode ke Google Drive... 0%`);

    const response = await apiFormWithProgress(uploadUrl, formData, ({ percent }) => {
      const safePercent = Math.max(0, Math.min(100, Math.floor(Number(percent) || 0)));
      if (safePercent === lastProgressPercent) {
        return;
      }

      lastProgressPercent = safePercent;
      log(`Mengupload ${files.length} file episode ke Google Drive... ${safePercent}%`);
    });

    await refreshLibrary();
    const summary = buildGdriveUploadSummary(response, files.length);
    log("Upload episode ke Google Drive selesai.", summary);
    appendLog("Detail response:", response);
    clearVideoSelection();
  } catch (error) {
    log("Gagal upload episode ke Google Drive.", error.message);
  }
});

elements.syncGdriveBtn.addEventListener("click", async () => {
  try {
    requireTokenOrThrow();

    const drama = getDramaById(state.selectedDramaId);
    if (!drama) {
      throw new Error("Pilih drama dulu sebelum sinkronisasi.");
    }

    const folderId = extractGoogleDriveId(elements.gdriveSyncFolderId.value);
    const body = {
      overwriteExisting: elements.gdriveSyncOverwriteExisting.checked,
      switchSource: elements.gdriveSyncSwitchSource.checked,
      createMissingEpisodes: elements.gdriveSyncCreateMissingEpisodes.checked
    };
    if (folderId) {
      body.folderId = folderId;
    }

    log("Memulai sinkronisasi episode dari Google Drive...", body);
    const payload = await api(`/api/admin/dramas/${encodeURIComponent(drama.id)}/sync-gdrive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    await refreshLibrary({ silent: true });
    setFormDirty(false);
    const summary = buildGdriveSyncSummary(payload);
    log("Sinkronisasi Google Drive selesai.", summary);
    appendLog("Detail response:", payload);
  } catch (error) {
    log("Gagal sinkronisasi Google Drive.", error.message);
  }
});

async function init() {
  setAdminAccess(false);
  if (!state.adminToken) {
    log("Isi token admin, lalu klik Simpan Token.");
    return;
  }

  try {
    await validateAdminAccess();
    log("Library berhasil dimuat.", {
      totalDrama: state.library.dramas.length
    });
  } catch (error) {
    log("Gagal memuat data admin.", error.message);
  }
}

window.addEventListener("beforeunload", stopRealtimePolling);

initUploadDropzones();
init();
