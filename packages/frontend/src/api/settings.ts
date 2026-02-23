export interface SettingsAuthResponse {
  enabled: boolean;
  username?: string;
  source: "environment" | "storage" | "none";
}

export async function fetchAuthSettings(): Promise<SettingsAuthResponse> {
  const response = await fetch("api/settings/auth");
  if (!response.ok) {
    throw new Error(`Failed to fetch auth settings: ${response.statusText}`);
  }
  return response.json();
}

export async function updateAuthSettings(
  username: string,
  password: string,
): Promise<SettingsAuthResponse> {
  const response = await fetch("api/settings/auth", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to update auth settings: ${response.statusText}`,
    );
  }
  return response.json();
}

export async function deleteAuthSettings(): Promise<SettingsAuthResponse> {
  const response = await fetch("api/settings/auth", {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to delete auth settings: ${response.statusText}`,
    );
  }
  return response.json();
}
