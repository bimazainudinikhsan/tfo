import dotenv from "dotenv";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN belum diisi di .env");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, "..", "data", "library.json");
const apiBase = `https://api.telegram.org/bot${token}`;

async function checkFileId(fileId) {
  const url = `${apiBase}/getFile?file_id=${encodeURIComponent(String(fileId || "").trim())}`;
  const response = await fetch(url);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && payload?.ok && payload.result?.file_path) {
    return {
      ok: true,
      detail: payload.result.file_path
    };
  }

  return {
    ok: false,
    detail: payload?.description || `HTTP ${response.status}`
  };
}

async function main() {
  const raw = await readFile(dataPath, "utf-8");
  const library = JSON.parse(raw);
  const dramas = Array.isArray(library.dramas) ? library.dramas : [];

  if (!dramas.length) {
    console.log("Belum ada drama di data/library.json");
    return;
  }

  const rows = [];

  for (const drama of dramas) {
    const episodes = Array.isArray(drama.episodes) ? drama.episodes : [];
    for (const episode of episodes) {
      const source = String(episode.source || "").trim().toLowerCase();
      const isGdrive = source === "gdrive" || (!source && String(episode.gdriveFileId || "").trim());
      if (isGdrive) {
        rows.push({
          drama: drama.id,
          episode: episode.number,
          status: "SKIP",
          detail: "source gdrive"
        });
        continue;
      }

      if (!episode.telegramFileId) {
        rows.push({
          drama: drama.id,
          episode: episode.number,
          status: "EMPTY",
          detail: "telegramFileId kosong"
        });
        continue;
      }

      const result = await checkFileId(episode.telegramFileId);
      rows.push({
        drama: drama.id,
        episode: episode.number,
        status: result.ok ? "OK" : "FAIL",
        detail: result.detail
      });
    }
  }

  console.table(rows);
}

main().catch((error) => {
  console.error(`Gagal validasi file ID Telegram: ${error.message}`);
  process.exit(1);
});
