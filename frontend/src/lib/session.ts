"use client";

/**
 * Access tokens live in localStorage, which is readable by any script on the
 * page. That is the tradeoff for talking to the FastAPI backend directly from
 * the browser; an httpOnly cookie would require same-site hosting. The token
 * expires after a day, and signing out removes it immediately.
 */
const TOKEN_KEY = "invoice.access_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}
