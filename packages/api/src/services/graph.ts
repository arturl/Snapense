/**
 * Microsoft Graph API helper for OneDrive operations.
 * All calls use the user's delegated access token.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Personal OneDrive doesn't support $orderby, so we fetch all children
 * and sort by createdDateTime on the server side.
 */
function sortByCreatedDesc(data: any): any {
  if (data.value && Array.isArray(data.value)) {
    data.value.sort(
      (a: any, b: any) =>
        new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
    );
  }
  return data;
}

export async function listDriveRoot(accessToken: string): Promise<any> {
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/root/children?$top=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  return sortByCreatedDesc(await res.json());
}

export async function listDriveFolder(
  accessToken: string,
  folderId: string
): Promise<any> {
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/items/${folderId}/children?$top=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  return sortByCreatedDesc(await res.json());
}

export async function getDriveItem(accessToken: string, itemId: string): Promise<any> {
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph API error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function downloadDriveItem(
  accessToken: string,
  itemId: string
): Promise<Buffer> {
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Graph download error: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Ensures /Expenses folder exists under "My files" (drive root).
 * Returns the folder's item ID.
 */
export async function ensureExpensesFolder(accessToken: string): Promise<string> {
  // Try to get existing folder
  const checkRes = await fetch(
    `${GRAPH_BASE}/me/drive/root:/Expenses`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (checkRes.ok) {
    const folder = (await checkRes.json()) as { id: string };
    return folder.id;
  }

  // Create it
  const createRes = await fetch(`${GRAPH_BASE}/me/drive/root/children`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Expenses",
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  if (!createRes.ok) {
    // Race condition: might have been created between check and create
    const retry = await fetch(`${GRAPH_BASE}/me/drive/root:/Expenses`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (retry.ok) return ((await retry.json()) as { id: string }).id;
    throw new Error(`Failed to create Expenses folder: ${createRes.status}`);
  }
  return ((await createRes.json()) as { id: string }).id;
}

/**
 * Uploads a file to the Expenses folder with a new name.
 */
export async function uploadToExpenses(
  accessToken: string,
  fileName: string,
  content: Buffer
): Promise<any> {
  const folderId = await ensureExpensesFolder(accessToken);
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: content,
    }
  );
  if (!res.ok) throw new Error(`Upload error: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Get metadata for a child item by name, or null when it does not exist. */
export async function getFolderChildByName(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<any | null> {
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph lookup error: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Download a named file from a folder, or return null when it does not exist. */
export async function downloadFolderFile(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<Buffer | null> {
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
    { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "follow" }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph download error: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Upload a small file to a specific OneDrive folder. Existing names are replaced. */
export async function uploadToFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  content: Buffer,
  contentType = "application/octet-stream"
): Promise<any> {
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: content,
    }
  );
  if (!res.ok) throw new Error(`Upload error: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Delete a named child file if it exists. */
export async function deleteFolderFile(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<void> {
  const item = await getFolderChildByName(accessToken, folderId, fileName);
  if (!item) return;
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${item.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete error: ${res.status} ${await res.text()}`);
  }
}

/** Choose a filename that does not already exist, using -2, -3, ... suffixes. */
export async function getUniqueFileName(
  accessToken: string,
  folderId: string,
  desiredName: string,
  reservedNames: Set<string> = new Set()
): Promise<string> {
  const dot = desiredName.lastIndexOf(".");
  const base = dot > 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot > 0 ? desiredName.slice(dot) : "";
  let candidate = desiredName;
  let suffix = 2;
  while (
    reservedNames.has(candidate.toLowerCase()) ||
    (await getFolderChildByName(accessToken, folderId, candidate))
  ) {
    candidate = `${base}-${suffix}${ext}`;
    suffix += 1;
  }
  reservedNames.add(candidate.toLowerCase());
  return candidate;
}
