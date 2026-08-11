const MEDIA_TOKEN_ENV_KEYS = ["BLOB_READ_WRITE_TOKEN", "media_READ_WRITE_TOKEN"] as const;

export function getMediaBlobToken(): string | undefined {
  for (const key of MEDIA_TOKEN_ENV_KEYS) {
    const token = process.env[key]?.trim();
    if (token) return token;
  }

  return undefined;
}
