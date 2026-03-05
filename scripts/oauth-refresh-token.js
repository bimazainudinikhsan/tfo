import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }
  return String(process.argv[index + 1] || "").trim();
}

function parseClientConfig(raw) {
  const parsed = JSON.parse(raw);
  return parsed.web || parsed.installed || {};
}

function resolveRedirectUri({ config, redirectUriArg }) {
  if (redirectUriArg) {
    return redirectUriArg;
  }

  const envRedirectUri = String(process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || "").trim();
  if (envRedirectUri) {
    return envRedirectUri;
  }

  const redirectUris = Array.isArray(config.redirect_uris) ? config.redirect_uris : [];
  if (redirectUris.length) {
    return String(redirectUris[0] || "").trim();
  }

  return "http://localhost";
}

async function requestToken({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Gagal tukar authorization code: ${detail}`);
  }

  return payload;
}

async function main() {
  const clientFileArg = getArg("--client-file");
  const authCodeArg = getArg("--code");
  const redirectUriArg = getArg("--redirect-uri");

  const clientFile = clientFileArg
    ? path.resolve(process.cwd(), clientFileArg)
    : path.resolve(__dirname, "..", "client_secret.json");

  if (!fs.existsSync(clientFile)) {
    throw new Error(`File client secret tidak ditemukan: ${clientFile}`);
  }

  const raw = fs.readFileSync(clientFile, "utf8");
  const config = parseClientConfig(raw);
  const clientId = String(config.client_id || "").trim();
  const clientSecret = String(config.client_secret || "").trim();
  const redirectUri = resolveRedirectUri({ config, redirectUriArg });

  if (!clientId || !clientSecret) {
    throw new Error("client_id / client_secret tidak ditemukan di file OAuth.");
  }

  const scope = "https://www.googleapis.com/auth/drive";
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope
    }).toString();

  const configuredRedirectUris = Array.isArray(config.redirect_uris) ? config.redirect_uris : [];
  if (!configuredRedirectUris.length) {
    console.log("Perhatian: file OAuth tidak berisi redirect_uris.");
    console.log("Tambahkan redirect URI ini di Google Cloud Console > OAuth Client:");
    console.log(redirectUri);
    console.log("");
  } else {
    console.log("Redirect URI yang dipakai:");
    console.log(redirectUri);
    console.log("");
  }

  console.log("=== Langkah 1: Buka URL ini dan login ===");
  console.log(authUrl);
  console.log("");

  if (!authCodeArg) {
    console.log("=== Langkah 2: Jalankan ulang dengan authorization code ===");
    console.log(
      `node scripts/oauth-refresh-token.js --code "PASTE_CODE_DI_SINI" --redirect-uri "${redirectUri}"`
    );
    return;
  }

  const token = await requestToken({
    clientId,
    clientSecret,
    code: authCodeArg,
    redirectUri
  });

  console.log("=== Refresh token berhasil dibuat ===");
  console.log(`GOOGLE_DRIVE_OAUTH_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${String(token.refresh_token || "").trim()}`);

  if (!token.refresh_token) {
    console.log("");
    console.log(
      "Perhatian: refresh_token kosong. Ulangi proses dengan akun yang sama sambil memastikan prompt=consent."
    );
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
