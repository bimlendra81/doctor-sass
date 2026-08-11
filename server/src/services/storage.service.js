import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat, unlink, readdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { AppError, forbidden } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UPLOAD_ROOT = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.join(SERVER_ROOT, env.uploadDir);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/octet-stream",
]);

const EXT_BY_MIME = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "text/csv": ".csv",
};

let s3Instance = null;

function s3() {
  if (!s3Instance) {
    const config = {
      region: env.storage.region,
      credentials: {
        accessKeyId: env.storage.accessKey,
        secretAccessKey: env.storage.secretKey,
      },
    };
    if (env.storage.endpoint) config.endpoint = env.storage.endpoint;
    s3Instance = new S3Client(config);
  }
  return s3Instance;
}

export function isAllowedMime(mimeType) {
  return ALLOWED_MIME.has(mimeType);
}

function extFor(fileName, mimeType) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName ?? "");
  if (match) return `.${match[1].toLowerCase()}`;
  return EXT_BY_MIME[mimeType] ?? ".bin";
}

export function makeFileKey(clinicId, fileName, mimeType) {
  return `clinic/${clinicId}/records/${randomUUID()}${extFor(fileName, mimeType)}`;
}

export function isKeyAllowed(fileKey, clinicId) {
  return typeof fileKey === "string" && fileKey.startsWith(`clinic/${clinicId}/`) && !fileKey.includes("..");
}

function localPathFor(fileKey) {
  const absolute = path.resolve(UPLOAD_ROOT, fileKey);
  const root = path.resolve(UPLOAD_ROOT);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new AppError("Invalid file key", "INVALID_KEY", 400);
  }
  return absolute;
}

export async function createUploadUrl({ clinicId, fileName, mimeType }) {
  const fileKey = makeFileKey(clinicId, fileName, mimeType);
  const expiresAt = Date.now() + env.storage.presignTtlSeconds * 1000;

  if (env.storage.driver === "s3") {
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: env.storage.bucket, Key: fileKey, ContentType: mimeType ?? "application/octet-stream" }),
      { expiresIn: env.storage.presignTtlSeconds },
    );
    return { url, method: "PUT", fileKey, expiresAt: new Date(expiresAt).toISOString() };
  }

  const params = new URLSearchParams({ clinicId, key: fileKey, expires: String(expiresAt) });
  return { url: `/files?${params.toString()}`, method: "PUT", fileKey, expiresAt: new Date(expiresAt).toISOString() };
}

export async function getDownloadUrl({ clinicId, fileKey, fileName }) {
  const expiresAt = Date.now() + env.storage.presignTtlSeconds * 1000;

  if (env.storage.driver === "s3") {
    const url = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: env.storage.bucket, Key: fileKey }),
      { expiresIn: env.storage.presignTtlSeconds },
    );
    return { url, expiresAt: new Date(expiresAt).toISOString() };
  }

  const params = new URLSearchParams({ clinicId, key: fileKey, expires: String(expiresAt) });
  if (fileName) params.set("filename", fileName);
  return { url: `/files?${params.toString()}`, expiresAt: new Date(expiresAt).toISOString() };
}

export async function deleteObject(fileKey) {
  if (env.storage.driver === "s3") {
    await s3().send(new DeleteObjectCommand({ Bucket: env.storage.bucket, Key: fileKey }));
    return;
  }
  try {
    await unlink(localPathFor(fileKey));
  } catch (err) {
    if (err.code !== "ENOENT") logger.warn("local file delete failed", { error: err.message, fileKey });
  }
}

export async function objectExists(fileKey) {
  if (env.storage.driver === "s3") {
    try {
      await s3().send(new HeadObjectCommand({ Bucket: env.storage.bucket, Key: fileKey }));
      return true;
    } catch {
      return false;
    }
  }
  try {
    const info = await stat(localPathFor(fileKey));
    return info.isFile();
  } catch {
    return false;
  }
}

export async function writeLocalUpload(req, { clinicId, fileKey }) {
  if (!isKeyAllowed(fileKey, clinicId)) {
    throw new AppError("Invalid upload key", "INVALID_KEY", 400);
  }
  const target = localPathFor(fileKey);
  await mkdir(path.dirname(target), { recursive: true });

  return new Promise((resolve, reject) => {
    const out = createWriteStream(target);
    let bytes = 0;
    let finished = false;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_UPLOAD_BYTES && !finished) {
        finished = true;
        out.destroy();
        req.unpipe(out);
        reject(new AppError(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`, "FILE_TOO_LARGE", 400));
      }
    });
    out.on("error", (err) => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    });
    out.on("finish", () => resolve(bytes));
    req.pipe(out);
  }).catch(async (err) => {
    try {
      await unlink(target);
    } catch {
      /* keep original error */
    }
    throw err;
  });
}

export async function openLocalDownload(fileKey) {
  const target = localPathFor(fileKey);
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new AppError("File not found", "NOT_FOUND", 404);
  } catch {
    throw new AppError("File not found", "NOT_FOUND", 404);
  }
  return createReadStream(target);
}

export async function assertUploadAllowed(req, query) {
  const { clinicId, key, expires } = query;
  if (!isKeyAllowed(key, clinicId)) {
    throw new AppError("Invalid upload key", "INVALID_KEY", 400);
  }
  if (clinicId !== req.user.clinicId) {
    throw forbidden("Forbidden");
  }
  if (!expires || Number(expires) <= Date.now()) {
    throw new AppError("Upload link expired", "URL_EXPIRED", 400);
  }
  return { clinicId, key };
}

export async function assertDownloadAllowed(req, query) {
  const { clinicId, key, expires } = query;
  if (!isKeyAllowed(key, clinicId)) {
    throw new AppError("Invalid file key", "INVALID_KEY", 400);
  }
  if (clinicId !== req.user.clinicId) {
    throw forbidden("Forbidden");
  }
  if (!expires || Number(expires) <= Date.now()) {
    throw new AppError("Download link expired", "URL_EXPIRED", 403);
  }
  return { clinicId, key, fileName: query.filename ?? null };
}

export const storageDriver = env.storage.driver;

export async function ensureUploadRoot() {
  if (env.storage.driver === "local") {
    await mkdir(UPLOAD_ROOT, { recursive: true });
    logger.info("local storage ready", { driver: "local", root: UPLOAD_ROOT });
  } else {
    logger.info("object storage ready", { driver: "s3", bucket: env.storage.bucket });
  }
  return env.storage.driver;
}

export async function localFiles() {
  return readdir(UPLOAD_ROOT, { recursive: true });
}
