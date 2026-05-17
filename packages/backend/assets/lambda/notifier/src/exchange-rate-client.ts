export const FALLBACK_RATE = 150;

export async function getUsdJpyRate(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD",
      { signal: controller.signal },
    );
    const data = await response.json() as { rates?: { JPY?: number } };
    const rate = data.rates?.JPY;
    if (typeof rate !== "number") {
      console.warn("Invalid exchange rate response: JPY rate not found, using fallback rate");
      return FALLBACK_RATE;
    }
    return rate;
  }
  catch (error) {
    console.warn("Failed to fetch exchange rate, using fallback rate:", error);
    return FALLBACK_RATE;
  }
  finally {
    clearTimeout(timeout);
  }
}
