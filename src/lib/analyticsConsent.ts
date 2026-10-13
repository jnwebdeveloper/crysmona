export const CONSENT_KEY = "crysmona-analytics-consent";
export type Consent = "granted" | "denied" | "";
export function normalizeConsent(value: string | null): Consent {
  return value === "granted" || value === "denied" ? value : "";
}
export function analyticsAllowed(required: unknown, consent: Consent) {
  return consent !== "denied" && (String(required) !== "true" || consent === "granted");
}
export function routeEvents(path: string) {
  if (path === "/admin" || path.startsWith("/admin/")) return [];
  return ["PageView", ...(path.startsWith("/product/") ? ["ViewContent"] : []), ...(path === "/checkout" ? ["InitiateCheckout"] : [])];
}
