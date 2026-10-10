// Minimal structured logger. Production (and Vercel) gets one JSON object per line so
// the platform's log search can filter on fields; development gets readable lines.
// Never pass secrets, passwords, OTP codes, tokens or full addresses as fields.
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const json = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const minimum =
  order[(process.env.LOG_LEVEL as Level) || (json ? "info" : "debug")] ?? order.info;

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  const extra = error as Error & { status?: number; code?: string };
  return {
    name: error.name,
    message: error.message,
    status: extra.status,
    code: extra.code,
    stack: error.stack,
  };
}

function write(level: Level, message: string, fields: Fields = {}) {
  if (order[level] < minimum) return;
  const data: Fields = {};
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined) data[key] = key === "error" ? serializeError(value) : value;
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (json) {
    out(JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...data }));
    return;
  }
  const { error, ...rest } = data as Fields & { error?: { stack?: string } };
  const context = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
  out(`${new Date().toISOString().slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${message}${context}`);
  if (error) out(error.stack || error);
}

export const log = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};

// Phone numbers appear in logs only as their last four digits.
export const maskPhone = (phone: string) => "******" + String(phone).slice(-4);
