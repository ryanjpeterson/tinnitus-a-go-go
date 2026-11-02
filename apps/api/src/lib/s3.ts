import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

// MinIO is S3-compatible. `forcePathStyle: true` is required for non-AWS endpoints.
export const s3 = new S3Client({
  endpoint: `${env.MINIO_USE_SSL ? "https" : "http"}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: "us-east-1", // ignored by MinIO but the SDK requires a value
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

export const bucket = env.MINIO_BUCKET;

const mediaBase = `${env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`}/${bucket}`;

/**
 * Browser-accessible URL for a stored object. The bucket allows anonymous
 * download, so no presigning: MINIO_PUBLIC_URL is the externally reachable
 * address, not the internal Docker hostname.
 */
export function mediaUrl(key: string): string {
  return `${mediaBase}/${key}`;
}
