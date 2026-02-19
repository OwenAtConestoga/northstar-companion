"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Credential } from "@/types/credential";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VaultStatus = "loading" | "new" | "locked" | "unlocked";

interface StoredVault {
  salt: string;    // base64 — 16-byte random salt (not secret)
  payload: string; // "<iv_b64>:<ciphertext+tag_b64>" — new IV on every write
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY       = "nsa-vault";
const PBKDF2_ITERATIONS = 100_000;

const toB64 = (u8: Uint8Array): string =>
  btoa(String.fromCharCode(...u8));

const fromB64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  // new Uint8Array(salt) ensures ArrayBuffer backing (not SharedArrayBuffer) for TS strict types
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJSON(data: unknown, key: CryptoKey): Promise<string> {
  const ivRaw = crypto.getRandomValues(new Uint8Array(12));
  const iv    = new Uint8Array(ivRaw); // ensure ArrayBuffer backing for Web Crypto types
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, plain);
  return toB64(iv) + ":" + toB64(new Uint8Array(cipher));
}

async function decryptJSON(payload: string, key: CryptoKey): Promise<unknown> {
  const [ivB64, dataB64] = payload.split(":");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(fromB64(ivB64)), tagLength: 128 },
    key,
    new Uint8Array(fromB64(dataB64))
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVaultStorage() {
  const [status, setStatus]       = useState<VaultStatus>("loading");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const keyRef  = useRef<CryptoKey | null>(null);
  const saltRef = useRef<Uint8Array | null>(null);

  // On mount, decide whether to show Create or Unlock screen
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    setStatus(raw ? "locked" : "new");
  }, []);

  // Create a brand-new vault with a chosen master password
  const createVault = useCallback(async (password: string) => {
    setUnlockError(null);
    try {
      const salt    = crypto.getRandomValues(new Uint8Array(16));
      const key     = await deriveKey(password, salt);
      const payload = await encryptJSON([], key);
      const stored: StoredVault = { salt: toB64(salt), payload };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      keyRef.current  = key;
      saltRef.current = salt;
      setCredentials([]);
      setStatus("unlocked");
    } catch {
      setUnlockError("Failed to create vault. Please try again.");
    }
  }, []);

  // Unlock an existing vault with the master password
  const unlock = useCallback(async (password: string) => {
    setUnlockError(null);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setStatus("new"); return; }
      const stored: StoredVault = JSON.parse(raw);
      const salt = fromB64(stored.salt);
      const key  = await deriveKey(password, salt);
      // decrypt throws if the password/key is wrong (AES-GCM auth tag fails)
      const creds = (await decryptJSON(stored.payload, key)) as Credential[];
      keyRef.current  = key;
      saltRef.current = salt;
      setCredentials(creds);
      setStatus("unlocked");
    } catch {
      setUnlockError("Incorrect password — please try again.");
    }
  }, []);

  // Re-encrypt and persist after any mutation
  const saveCredentials = useCallback(async (creds: Credential[]) => {
    const key  = keyRef.current;
    const salt = saltRef.current;
    if (!key || !salt) return;
    const payload = await encryptJSON(creds, key);
    const stored: StoredVault = { salt: toB64(salt), payload };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setCredentials(creds);
  }, []);

  // Lock the session (keeps vault in storage, clears key from memory)
  const lock = useCallback(() => {
    keyRef.current  = null;
    saltRef.current = null;
    setCredentials([]);
    setStatus("locked");
  }, []);

  // Wipe vault entirely (used by "Delete All" on device or future settings)
  const wipeVault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    keyRef.current  = null;
    saltRef.current = null;
    setCredentials([]);
    setStatus("new");
  }, []);

  return { status, credentials, unlockError, createVault, unlock, saveCredentials, lock, wipeVault };
}
