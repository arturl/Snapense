import { msalInstance } from "../auth/AuthProvider";
import { graphScopes } from "../auth/msalConfig";

async function getAccessToken(): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) throw new Error("Not authenticated");

  const response = await msalInstance.acquireTokenSilent({
    ...graphScopes,
    account,
  });
  return response.accessToken;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};

/** Download a blob (for ZIP files) */
export async function downloadBlob(path: string): Promise<Blob> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}
