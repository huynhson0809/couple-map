interface FormatErrorOptions {
  fallback?: string;
  includeCode?: boolean;
}

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";
const EMPTY_OBJECT_MESSAGE = "[object Object]";
const MESSAGE_FIELDS = ["message", "error", "error_description"] as const;
const DETAIL_FIELDS = ["details", "hint"] as const;
const NESTED_FIELDS = ["cause", "context", "body", "data"] as const;
const DETAIL_LABELS: Record<(typeof DETAIL_FIELDS)[number], string> = {
  details: "Details",
  hint: "Hint",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanString(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed === EMPTY_OBJECT_MESSAGE) return undefined;
  return trimmed;
}

function parseJsonString(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function pushUnique(parts: string[], value: string | undefined): void {
  if (!value) return;
  if (parts.includes(value)) return;
  parts.push(value);
}

function formatLabeledValue(
  label: string,
  value: unknown,
  options: Required<FormatErrorOptions>,
  seen: WeakSet<object>,
): string | undefined {
  const formatted = formatUnknown(value, options, seen);
  if (!formatted) return undefined;
  return `${label}: ${formatted}`;
}

function formatObject(
  value: Record<string, unknown>,
  options: Required<FormatErrorOptions>,
  seen: WeakSet<object>,
): string | undefined {
  if (seen.has(value)) return undefined;
  seen.add(value);

  const parts: string[] = [];

  if (options.includeCode) {
    pushUnique(parts, formatLabeledValue("Code", value.code, options, seen));
  }

  for (const field of MESSAGE_FIELDS) {
    pushUnique(parts, formatUnknown(value[field], options, seen));
  }

  for (const field of DETAIL_FIELDS) {
    pushUnique(
      parts,
      formatLabeledValue(
        DETAIL_LABELS[field],
        value[field],
        options,
        seen,
      ),
    );
  }

  for (const field of NESTED_FIELDS) {
    pushUnique(parts, formatUnknown(value[field], options, seen));
  }

  if (parts.length > 0) return parts.join(" ");

  const primitiveValues = Object.entries(value)
    .filter(([key]) => options.includeCode || key !== "code")
    .map(([, entry]) => entry)
    .map((entry) => formatUnknown(entry, options, seen))
    .filter((entry): entry is string => Boolean(entry));

  for (const entry of primitiveValues) {
    pushUnique(parts, entry);
  }

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function formatUnknown(
  error: unknown,
  options: Required<FormatErrorOptions>,
  seen: WeakSet<object>,
): string | undefined {
  if (typeof error === "string") {
    const parsed = parseJsonString(error);
    if (parsed !== undefined) {
      return formatUnknown(parsed, options, seen);
    }
    return cleanString(error);
  }

  if (error instanceof Error) {
    const message = cleanString(error.message);
    if (message) return message;

    const record = error as Error & Record<string, unknown>;
    return formatObject(record, options, seen);
  }

  if (typeof error === "number" || typeof error === "boolean") {
    return String(error);
  }

  if (isRecord(error)) {
    return formatObject(error, options, seen);
  }

  return undefined;
}

function resolveOptions(options?: FormatErrorOptions): Required<FormatErrorOptions> {
  return {
    fallback: cleanString(options?.fallback ?? "") ?? DEFAULT_FALLBACK,
    includeCode: options?.includeCode ?? false,
  };
}

function withFallback(message: string | undefined, fallback: string): string {
  return cleanString(message ?? "") ?? fallback;
}

function getFunction(value: Record<string, unknown>, key: string) {
  const fn = value[key];
  return typeof fn === "function" ? fn.bind(value) : undefined;
}

async function readContextPayload(context: Record<string, unknown>): Promise<unknown | undefined> {
  const clone = getFunction(context, "clone");
  const source = clone ? (clone() as unknown) : context;
  if (!isRecord(source)) return undefined;

  const json = getFunction(source, "json");
  if (json) {
    try {
      return await json();
    } catch {
      // Fall through to text().
    }
  }

  const text = getFunction(source, "text");
  if (text) {
    try {
      const raw = await text();
      if (typeof raw !== "string") return raw;

      const parsed = parseJsonString(raw);
      return parsed ?? raw;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function collectAsyncPayloads(
  error: unknown,
  seen: WeakSet<object>,
): Promise<unknown[]> {
  if (!isRecord(error) || seen.has(error)) return [];
  seen.add(error);

  const payloads: unknown[] = [];
  const contextPayload = await readContextPayload(error);
  if (contextPayload !== undefined) payloads.push(contextPayload);

  for (const field of NESTED_FIELDS) {
    const nested = error[field];
    if (isRecord(nested)) {
      payloads.push(...await collectAsyncPayloads(nested, seen));
    }
  }

  return payloads;
}

export function formatErrorMessage(
  error: unknown,
  options?: FormatErrorOptions,
): string {
  const resolvedOptions = resolveOptions(options);
  return withFallback(
    formatUnknown(error, resolvedOptions, new WeakSet()),
    resolvedOptions.fallback,
  );
}

export async function formatAsyncErrorMessage(
  error: unknown,
  options?: FormatErrorOptions,
): Promise<string> {
  const resolvedOptions = resolveOptions(options);
  const asyncPayloads = await collectAsyncPayloads(error, new WeakSet());
  for (const payload of asyncPayloads) {
    const message = formatUnknown(payload, resolvedOptions, new WeakSet());
    if (cleanString(message ?? "")) return message as string;
  }

  const initialMessage = formatUnknown(error, resolvedOptions, new WeakSet());
  if (cleanString(initialMessage ?? "")) return initialMessage as string;

  return resolvedOptions.fallback;
}
