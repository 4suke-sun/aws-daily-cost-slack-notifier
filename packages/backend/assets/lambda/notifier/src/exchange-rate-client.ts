export const FALLBACK_RATE = 150;

const PRIMARY_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const BACKUP_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";

async function fetchRate(url: string, signal: AbortSignal): Promise<number> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Exchange rate API returned status ${response.status}`);
  }
  const data = await response.json() as { usd?: { jpy?: number } };
  const rate = data.usd?.jpy;
  if (typeof rate !== "number") {
    throw new Error("JPY rate not found in response");
  }
  return rate;
}

export async function getUsdJpyRate(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    try {
      return await fetchRate(PRIMARY_URL, controller.signal);
    }
    catch {
      return await fetchRate(BACKUP_URL, controller.signal);
    }
  }
  catch (error) {
    console.warn("Failed to fetch exchange rate, using fallback rate:", error);
    return FALLBACK_RATE;
  }
  finally {
    clearTimeout(timeout);
  }
}
