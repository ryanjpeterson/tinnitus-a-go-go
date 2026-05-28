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
