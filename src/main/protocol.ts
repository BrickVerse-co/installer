import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import type { BrickVerseApp } from "./types";

export type LaunchTarget = BrickVerseApp | "local";

const MAX_URL_LENGTH = 64 * 1024;
export const creatorExtensions = new Set([".bvxl", ".bvxw", ".bvworld", ".bvproject", ".bvxm", ".bvmodel", ".model", ".bvanim", ".bvaddon"]);

export function protocolUrls(argv: string[]): string[] {
	return argv.filter((value) => value.toLowerCase().startsWith("brickverse://"));
}

export async function creatorFiles(argv: string[]): Promise<string[]> {
	const output: string[] = [];
	for (const value of argv) {
		const candidate = path.resolve(value);
		if (!creatorExtensions.has(path.extname(candidate).toLowerCase())) continue;
		try { if ((await fs.stat(candidate)).isFile()) output.push(candidate); } catch { /* Ignore invalid shell arguments. */ }
	}
	return output;
}

function tokenize(value: string): string[] {
	const output: string[] = [];
	let current = "";
	let quote = "";
	for (let index = 0; index < value.length; index++) {
		const character = value[index];
		if (quote) {
			if (character === quote) quote = "";
			else current += character;
		} else if (character === "\"" || character === "'") quote = character;
		else if (/\s/.test(character)) {
			if (current) { output.push(current); current = ""; }
		} else current += character;
	}
	if (quote) throw new Error("Launch arguments contain an unclosed quote.");
	if (current) output.push(current);
	if (output.length > 128 || output.some((part) => part.includes("\0"))) throw new Error("Launch arguments are invalid.");
	return output;
}

export function parseProtocol(raw: string): { target: LaunchTarget; args: string[] } {
	if (raw.length > MAX_URL_LENGTH) throw new Error("BrickVerse launch URL is too large.");
	const url = new URL(raw);
	if (url.protocol !== "brickverse:") throw new Error("Unsupported launch protocol.");
	const route = url.hostname.toLowerCase();
	if (route !== "client" && route !== "creator" && route !== "local") throw new Error(`Unsupported BrickVerse route: ${route}`);
	const encoded = url.pathname.replace(/^\/+/, "");
	if (!encoded) return { target: route as LaunchTarget, args: [] };
	const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error("Launch payload is not valid Base64.");
	const decoded = Buffer.from(normalized + "=".repeat((4 - normalized.length % 4) % 4), "base64");
	if (!decoded.length || decoded.length > 32 * 1024) throw new Error("Launch payload is invalid or too large.");
	return { target: route as LaunchTarget, args: tokenize(decoded.toString("utf8")) };
}

export async function spawnProduct(executable: string, args: string[]): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: true, shell: false, cwd: path.dirname(executable) });
		child.once("error", reject);
		child.once("spawn", () => { child.unref(); resolve(); });
	});
}
