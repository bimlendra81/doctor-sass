const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function log(level, msg, meta) {
  const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
  if (LEVELS[level] < threshold) return;
  const line = { ts: new Date().toISOString(), level, msg, ...meta };
  const out = level === "warn" || level === "error" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (msg, meta) => log("debug", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};
