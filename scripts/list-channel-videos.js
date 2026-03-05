import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const channelFilterRaw = process.env.TELEGRAM_CHANNEL_ID;
const channelFilter = channelFilterRaw ? String(channelFilterRaw).trim() : "";
const offsetArg = process.argv.find((item) => item.startsWith("--offset="));
const offset = offsetArg ? Number(offsetArg.split("=")[1]) : null;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN belum diisi di file .env");
  process.exit(1);
}

const apiBase = `https://api.telegram.org/bot${token}`;

function sameChannel(post) {
  if (!channelFilter) {
    return true;
  }

  const chatId = String(post.chat?.id || "");
  const username = post.chat?.username ? `@${post.chat.username}` : "";

  return chatId === channelFilter || username.toLowerCase() === channelFilter.toLowerCase();
}

function sanitizeCaption(caption = "") {
  return caption.replace(/\s+/g, " ").trim().slice(0, 80);
}

async function main() {
  const query = new URLSearchParams();
  if (Number.isFinite(offset)) {
    query.set("offset", String(offset));
  }

  query.set("limit", "100");

  const response = await fetch(`${apiBase}/getUpdates?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Telegram API error: HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.description || "Telegram API getUpdates gagal.");
  }

  const updates = payload.result || [];
  if (!updates.length) {
    console.log("Tidak ada update baru. Upload video ke channel privat lalu jalankan lagi.");
    return;
  }

  const rows = [];
  for (const update of updates) {
    const post = update.channel_post || update.edited_channel_post;
    if (!post) {
      continue;
    }

    if (!sameChannel(post)) {
      continue;
    }

    const video = post.video || post.document;
    if (!video?.file_id) {
      continue;
    }

    rows.push({
      update_id: update.update_id,
      chat_id: post.chat?.id,
      msg_id: post.message_id,
      date: new Date((post.date || 0) * 1000).toISOString(),
      caption: sanitizeCaption(post.caption),
      file_id: video.file_id
    });
  }

  if (!rows.length) {
    console.log("Update ada, tapi tidak ada video dari channel yang difilter.");
  } else {
    console.table(rows);
    console.log("Salin nilai file_id ke data/library.json -> episodes[].telegramFileId");
  }

  const nextOffset = Math.max(...updates.map((item) => item.update_id)) + 1;
  console.log(`Gunakan offset berikutnya agar tidak baca ulang update lama: --offset=${nextOffset}`);
}

main().catch((error) => {
  console.error(`Gagal membaca channel video: ${error.message}`);
  process.exit(1);
});
