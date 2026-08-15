// All amounts are stored in Firestore in a single fixed base currency
// (numerically the same values the app has always used). This module only
// affects *display*: it fetches live exchange rates and converts base
// amounts to whatever currency the user has picked, everywhere in the UI.

export const SUPPORTED_CURRENCIES = ["SGD", "USD", "EUR", "GBP", "JPY", "AUD", "MYR", "IDR", "CNY", "HKD"];
const BASE_CURRENCY = "SGD";

const CURRENCY_KEY = "assetTracker.currency";
const RATES_KEY = "assetTracker.rates";
const RATES_TS_KEY = "assetTracker.ratesFetchedAt";
const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000; // refetch at most once a day

export function getCurrency() {
  return localStorage.getItem(CURRENCY_KEY) || BASE_CURRENCY;
}

export function setCurrency(code) {
  localStorage.setItem(CURRENCY_KEY, code);
}

/**
 * Returns a map like { SGD: 1, USD: 0.74, IDR: 11500, ... } meaning
 * "1 unit of the base currency equals this many units of the target."
 * Uses a same-day cache so switching currencies mid-session is instant,
 * and falls back to the last known rates (or 1:1) if the network is
 * unavailable. `ok` is false when live rates couldn't be fetched.
 */
export async function loadRates() {
  const cachedRaw = localStorage.getItem(RATES_KEY);
  const cachedTs = Number(localStorage.getItem(RATES_TS_KEY) || 0);
  const isFresh = cachedRaw && Date.now() - cachedTs < RATES_MAX_AGE_MS;

  if (isFresh) {
    try {
      return { rates: JSON.parse(cachedRaw), ok: true };
    } catch {
      /* corrupt cache — fall through and refetch */
    }
  }

  try {
    const symbols = SUPPORTED_CURRENCIES.filter((c) => c !== BASE_CURRENCY).join(",");
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${BASE_CURRENCY}&symbols=${symbols}`);
    if (!res.ok) throw new Error("rate fetch failed");
    const json = await res.json();
    const rates = { [BASE_CURRENCY]: 1, ...json.rates };
    localStorage.setItem(RATES_KEY, JSON.stringify(rates));
    localStorage.setItem(RATES_TS_KEY, String(Date.now()));
    return { rates, ok: true };
  } catch {
    if (cachedRaw) {
      try {
        return { rates: JSON.parse(cachedRaw), ok: true };
      } catch {
        /* ignore and fall through to the 1:1 fallback below */
      }
    }
    const fallback = Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, 1]));
    return { rates: fallback, ok: false };
  }
}

export function convertFromBase(baseValue, code, rates) {
  return (Number(baseValue) || 0) * (rates?.[code] ?? 1);
}

export function convertToBase(displayValue, code, rates) {
  return (Number(displayValue) || 0) / (rates?.[code] ?? 1);
}
