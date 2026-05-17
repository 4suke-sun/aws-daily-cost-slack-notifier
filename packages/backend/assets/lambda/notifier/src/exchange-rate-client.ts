const EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";
const FALLBACK_RATE = 150.0;
const TIMEOUT_MS = 5000;

interface ExchangeRateResponse {
  rates: Record<string, number>;
}

export async function getExchangeRate(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(EXCHANGE_RATE_API_URL, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`Exchange rate API returned status ${response.status}, using fallback rate`);
      return FALLBACK_RATE;
    }

    const data = await response.json() as ExchangeRateResponse;
    const rate = data.rates?.JPY;

    if (typeof rate !== "number" || isNaN(rate)) {
      console.warn("Invalid exchange rate data, using fallback rate");
      return FALLBACK_RATE;
    }

    return rate;
  }
  catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn("Exchange rate API request timed out, using fallback rate");
    }
    else {
      console.warn("Failed to fetch exchange rate, using fallback rate:", error);
    }
    return FALLBACK_RATE;
  }
  finally {
    clearTimeout(timeout);
  }
}

export function getFallbackRate(): number {
  return FALLBACK_RATE;
}
