export type ProviderBalance = {
  provider: "deepseek" | "moonshot" | "openrouter";
  amountText: string;
  details: string;
  available?: boolean;
};

type BalanceFetchInput = {
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
};

type BalanceProviderKind = "deepseek" | "moonshot-ai" | "moonshot-cn" | "openrouter";

function detectBalanceProvider(baseUrl: string): {
  kind: BalanceProviderKind;
  origin: string;
} | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === "api.deepseek.com") {
    return { kind: "deepseek", origin: url.origin };
  }
  if (host === "api.moonshot.ai") {
    return { kind: "moonshot-ai", origin: url.origin };
  }
  if (host === "api.moonshot.cn") {
    return { kind: "moonshot-cn", origin: url.origin };
  }
  if (host === "openrouter.ai" || host === "api.openrouter.ai") {
    return { kind: "openrouter", origin: "https://openrouter.ai" };
  }
  return null;
}

export function supportsProviderBalance(baseUrl: string): boolean {
  return detectBalanceProvider(baseUrl) !== null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const formatted =
    abs > 0 && abs < 0.01 ? amount.toFixed(4) : amount.toFixed(2);
  const upper = currency.toUpperCase();
  if (upper === "USD") return `$${formatted}`;
  if (upper === "CNY" || upper === "RMB") return `¥${formatted}`;
  if (upper === "EUR") return `€${formatted}`;
  return `${formatted} ${upper}`;
}

export async function fetchProviderBalance(
  input: BalanceFetchInput,
): Promise<ProviderBalance | null> {
  const detected = detectBalanceProvider(input.baseUrl);
  if (!detected || !input.apiKey.trim()) return null;

  const fetchImpl = input.fetch ?? globalThis.fetch;
  let endpoint: string;
  switch (detected.kind) {
    case "deepseek":
      endpoint = `${detected.origin}/user/balance`;
      break;
    case "moonshot-ai":
    case "moonshot-cn":
      endpoint = `${detected.origin}/v1/users/me/balance`;
      break;
    case "openrouter":
      endpoint = `${detected.origin}/api/v1/credits`;
      break;
  }

  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
    },
    signal: input.signal,
  });

  if (!response.ok) return null;

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (detected.kind === "deepseek") {
    const infosRaw = Array.isArray(obj.balance_infos) ? obj.balance_infos : [];
    const infos = infosRaw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        currency: typeof item.currency === "string" ? item.currency : "USD",
        total: toFiniteNumber(item.total_balance) ?? 0,
        granted: toFiniteNumber(item.granted_balance) ?? 0,
        toppedUp: toFiniteNumber(item.topped_up_balance) ?? 0,
      }));
    if (infos.length === 0) return null;

    const primary =
      infos.find((i) => i.currency.toUpperCase() === "USD" && i.total > 0) ??
      infos.find((i) => i.total > 0) ??
      infos[0];
    const available =
      typeof obj.is_available === "boolean" ? obj.is_available : undefined;
    const lines = infos.map(
      (i) =>
        `${formatMoney(i.total, i.currency)} (granted: ${formatMoney(i.granted, i.currency)}, topped up: ${formatMoney(i.toppedUp, i.currency)})`,
    );
    return {
      provider: "deepseek",
      amountText: formatMoney(primary.total, primary.currency),
      details: `DeepSeek balance: ${lines.join("; ")}`,
      available,
    };
  }

  if (detected.kind === "moonshot-ai" || detected.kind === "moonshot-cn") {
    const data =
      obj.data && typeof obj.data === "object"
        ? (obj.data as Record<string, unknown>)
        : null;
    if (!data) return null;
    const availableBalance = toFiniteNumber(data.available_balance);
    if (availableBalance === null) return null;
    const currency = detected.kind === "moonshot-cn" ? "CNY" : "USD";
    const cash = toFiniteNumber(data.cash_balance);
    const voucher = toFiniteNumber(data.voucher_balance);
    const parts: string[] = [];
    if (cash !== null) parts.push(`cash: ${formatMoney(cash, currency)}`);
    if (voucher !== null) parts.push(`voucher: ${formatMoney(voucher, currency)}`);
    const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    return {
      provider: "moonshot",
      amountText: formatMoney(availableBalance, currency),
      details: `Moonshot AI balance: ${formatMoney(availableBalance, currency)}${suffix}`,
      available: availableBalance > 0,
    };
  }

  // OpenRouter
  const data =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : null;
  if (!data) return null;
  const totalCredits = toFiniteNumber(data.total_credits);
  const totalUsage = toFiniteNumber(data.total_usage);
  if (totalCredits === null || totalUsage === null) return null;
  const remaining = Math.max(0, totalCredits - totalUsage);
  return {
    provider: "openrouter",
    amountText: formatMoney(remaining, "USD"),
    details: `OpenRouter credits: ${formatMoney(remaining, "USD")} remaining (${formatMoney(totalUsage, "USD")} used of ${formatMoney(totalCredits, "USD")})`,
    available: remaining > 0,
  };
}
