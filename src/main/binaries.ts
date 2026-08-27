import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { net } from "electron";
import type { BinaryApiPayload, BrickVerseApp, ProgressEvent, ReleaseBranch, ResolvedBinary } from "./types";
import { apiPlatform } from "./platform";

const API_BASE = "https://api.brickverse.gg/api/v3/binaries";

export async function resolveBinary(
  app: BrickVerseApp,
  branch: ReleaseBranch
): Promise<ResolvedBinary> {
  if (app === "guild-chat") return resolveGuildChatBinary(branch);
  if (branch == "main") branch = "prod"; // Redirect main to prod as the API internally uses prod for the main release channel.
  
  const endpoint = `${API_BASE}/${apiPlatform()}/${branch}/${app}`;
  const response = await net.fetch(endpoint, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Binary API returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = await response.json() as Partial<BinaryApiPayload>;

  if (typeof payload.url !== "string" || !/^https?:\/\//i.test(payload.url)) {
    throw new Error("The binary API response did not contain a valid download URL.");
  }

  if (typeof payload.createdAt !== "string" || Number.isNaN(Date.parse(payload.createdAt))) {
    throw new Error("The binary API response did not contain a valid createdAt timestamp.");
  }

  return {
    url: payload.url,
    createdAt: payload.createdAt,
    format: "zip"
  };
}

interface GitHubRelease {
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

async function resolveGuildChatBinary(branch: ReleaseBranch): Promise<ResolvedBinary> {
  const response = await net.fetch("https://api.github.com/repos/BrickVerse-co/guild-channel-binaries/releases?per_page=20", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "BrickVerse-Installer" }
  });
  if (!response.ok) throw new Error(`Guild Chat releases returned HTTP ${response.status}.`);
  const releases = await response.json() as GitHubRelease[];
  const allowPrerelease = branch === "beta";
	const platformToken = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
	const architectureToken = process.platform === "darwin" ? "universal" : process.arch;
  for (const release of releases) {
    if (release.draft || (!allowPrerelease && release.prerelease)) continue;
	const assets = release.assets ?? [];
	const asset = assets.find((candidate) => {
		const name = candidate.name?.toLowerCase() ?? "";
		return name.endsWith(".zip") && name.includes(platformToken) && name.includes(architectureToken);
	}) ?? assets.find((candidate) => {
		const name = candidate.name?.toLowerCase() ?? "";
		return name.endsWith(".zip") && name.includes(platformToken);
	}) ?? (process.platform === "win32" ? assets.find((candidate) => candidate.name?.toLowerCase() === "brickverseguildchannels-setup.exe") : undefined);
    if (!asset?.browser_download_url || !release.published_at || Number.isNaN(Date.parse(release.published_at))) continue;
	return { url: asset.browser_download_url, createdAt: release.published_at, format: asset.name?.toLowerCase().endsWith(".exe") ? "nsis" : "zip" };
  }
	throw new Error(`No usable Guild Chat release was found for ${apiPlatform()} ${process.arch}.`);
}

export async function downloadFile(
  url: string,
  destination: string,
  onProgress: (event: ProgressEvent) => void
): Promise<void> {
  const response = await net.fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }

  await fsp.mkdir(path.dirname(destination), { recursive: true });

  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const stream = fs.createWriteStream(destination);
  let transferred = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await new Promise<void>((resolve, reject) => {
        stream.write(Buffer.from(value), (error) => error ? reject(error) : resolve());
      });

      transferred += value.byteLength;
      const percent = total > 0
        ? Math.min(100, Math.round((transferred / total) * 100))
        : 0;

      onProgress({
        phase: "downloading",
        percent,
        message: total > 0 ? `Downloading… ${percent}%` : "Downloading…",
        transferredBytes: transferred,
        totalBytes: total || undefined
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.end((error?: Error | null) => error ? reject(error) : resolve());
    });
  }
}
