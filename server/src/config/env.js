import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name];
  if (!value) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const hasS3 = Boolean(process.env.S3_ACCESS_KEY && process.env.S3_BUCKET);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret"),
    refreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret"),
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
  },
  storage: {
    driver: hasS3 ? "s3" : "local",
    accessKey: process.env.S3_ACCESS_KEY ?? "",
    secretKey: process.env.S3_SECRET_KEY ?? "",
    bucket: process.env.S3_BUCKET ?? "",
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "us-east-1",
    presignTtlSeconds: Number(process.env.S3_PRESIGN_TTL_SECONDS ?? 900),
  },
  uploadDir: process.env.LOCAL_UPLOAD_DIR ?? "uploads",
  webappUrl: process.env.WEBAPP_URL ?? "http://localhost:5173",
  jitsiBaseUrl: process.env.JITSI_BASE_URL ?? "https://meet.jit.si",
};

export const isProduction = env.nodeEnv === "production";
