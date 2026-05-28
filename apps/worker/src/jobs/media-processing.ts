/**
 * Media processing job — Sharp WebP variants + ffmpeg video transcoding.
 *
 * Image pipeline (JPEG / PNG / WebP / HEIC / GIF):
 *   original → Sharp → 200w (thumb), 800w (medium), 1600w (large) in WebP
 *
 * Video pipeline (MP4 / MOV):
 *   original → ffmpeg → 1080p MP4 (H.264 + AAC, capped bitrate)
 *             → poster frame extracted at 0s as WebP thumb
 *
 * GPS/EXIF strips automatically via Sharp's `withMetadata({ exif: {} })`.
 * Original is kept; variants are stored at `photos/variants/{photoId}_{size}.webp`.
 * On completion, `photos.variants` JSONB is updated and `width`/`height`/`duration_sec` set.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { Job } from "bullmq";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import type { MediaProcessJobData, MediaProcessJobResult } from "@tagg/shared";
import { db, schema } from "../db.js";
import { s3, bucket } from "../s3.js";

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// S3 helpers
// ─────────────────────────────────────────────────────────────────────────────

async function download(key: string): Promise<Buffer> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!out.Body) throw new Error(`Empty body from S3 key: ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of out.Body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function upload(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Image processing (Sharp)
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_VARIANTS = [
  { name: "thumb", width: 200 },
  { name: "medium", width: 800 },
  { name: "large", width: 1600 },
] as const;

async function processImage(
  photoId: string,
  objectKey: string,
  original: Buffer,
): Promise<{ variants: Record<string, string>; width: number; height: number }> {
  // Build one pipeline that corrects EXIF orientation and strips GPS metadata.
  // We clone it for each variant so libvips only decodes the source image once,
  // avoiding the ~72 MB raw-pixel spike that occurred when we called
  // sharp(original) separately for every size.
  const pipeline = sharp(original, { failOn: "none" })
    .rotate()                    // apply EXIF orientation
    .withMetadata({ exif: {} }); // strip GPS; keep corrected orientation

  const meta = await pipeline.clone().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const variants: Record<string, string> = {};

  for (const v of IMAGE_VARIANTS) {
    // Only generate a variant if the original is wider than that breakpoint
    if (width <= v.width && v.name !== "thumb") continue;

    const variantKey = `photos/variants/${photoId}_${v.name}.webp`;
    const buf = await pipeline
      .clone()
      .resize({ width: v.width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    await upload(variantKey, buf, "image/webp");
    variants[v.name] = variantKey;
  }

  return { variants, width, height };
}

// ─────────────────────────────────────────────────────────────────────────────
// Video processing (ffmpeg)
// ─────────────────────────────────────────────────────────────────────────────

async function processVideo(
  photoId: string,
  objectKey: string,
  original: Buffer,
): Promise<{ variants: Record<string, string>; durationSec: number }> {
  // Write original to a temp file — ffmpeg needs a seekable file path
  const tmpDir = await mkdtemp(join(tmpdir(), "tagg-media-"));
  const ext = extname(objectKey) || ".mp4";
  const inputPath = join(tmpDir, `input${ext}`);
  const outputPath = join(tmpDir, "output.mp4");
  const posterPath = join(tmpDir, "poster.webp");

  try {
    await writeFile(inputPath, original);

    // Probe duration
    let durationSec = 0;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ]);
      durationSec = Math.round(parseFloat(stdout.trim())) || 0;
    } catch {
      // ffprobe missing or failed — duration stays 0
    }

    // Transcode to 1080p max (preserve aspect ratio, strip audio metadata, no GPS)
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
      "-c:v", "libx264",
      "-crf", "23",
      "-preset", "fast",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-map_metadata", "-1", // strip all metadata (GPS etc.)
      outputPath,
    ]);

    // Poster frame at 0 seconds
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss", "0",
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale=800:-1",
      "-f", "webp",
      posterPath,
    ]);

    const variants: Record<string, string> = {};

    // Upload transcoded video
    const videoKey = `photos/variants/${photoId}_1080p.mp4`;
    await upload(videoKey, await readFile(outputPath), "video/mp4");
    variants["video"] = videoKey;

    // Upload poster
    const posterKey = `photos/variants/${photoId}_poster.webp`;
    await upload(posterKey, await readFile(posterPath), "image/webp");
    variants["thumb"] = posterKey;
    variants["poster"] = posterKey;

    return { variants, durationSec };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job handler
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set([".mp4", ".mov", ".mpeg", ".m4v"]);

export async function runMediaProcess(
  job: Job<MediaProcessJobData>,
): Promise<MediaProcessJobResult> {
  const { photoId } = job.data;

  const photo = await db.query.photos.findFirst({
    where: eq(schema.photos.id, photoId),
  });
  if (!photo) throw new Error(`Photo ${photoId} not found`);

  const isVideo = VIDEO_EXTS.has(extname(photo.objectKey).toLowerCase());

  await job.updateProgress(10);
  const original = await download(photo.objectKey);
  await job.updateProgress(30);

  let variants: Record<string, string>;
  let width: number | null = null;
  let height: number | null = null;
  let durationSec: number | null = null;

  if (isVideo) {
    const result = await processVideo(photoId, photo.objectKey, original);
    variants = result.variants;
    durationSec = result.durationSec;
  } else {
    const result = await processImage(photoId, photo.objectKey, original);
    variants = result.variants;
    width = result.width;
    height = result.height;
  }

  await job.updateProgress(90);

  // Persist results
  await db
    .update(schema.photos)
    .set({
      variants,
      width,
      height,
      durationSec,
    })
    .where(eq(schema.photos.id, photoId));

  await job.updateProgress(100);

  return { photoId, variants, width, height, durationSec };
}
