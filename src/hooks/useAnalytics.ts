import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { api } from "../lib/Store";
import { analyticsAllowed, CONSENT_KEY, Consent, normalizeConsent, routeEvents } from "../lib/analyticsConsent";
const PIXEL_ID = /^\d{5,20}$/;
const GA4_ID = /^G-[A-Z0-9]{4,20}$/;
function readConsent(): Consent {
  try { return normalizeConsent(localStorage.getItem(CONSENT_KEY)); } catch { return ""; }
}
export function useAnalytics() {
  const { pathname } = useLocation();
  const [tracking, setTracking] = useState<any>(null);
  const [consent, setConsent] = useState<Consent>(readConsent);
  const lastPage = useRef("");
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const pixel = String(tracking?.meta_pixel_id || "").trim();
  const ga = String(tracking?.ga4_measurement_id || "").trim();
  const configured = PIXEL_ID.test(pixel) || GA4_ID.test(ga);
  const allowed = !!tracking && analyticsAllowed(tracking.analytics_consent_required, consent);
  const chooseConsent = (choice: "granted" | "denied") => {
    try { localStorage.setItem(CONSENT_KEY, choice); } catch { /* Still honor the choice for this visit. */ }
    setConsent(choice);
  };
  useEffect(() => { api("/settings/public").then(setTracking).catch(() => {}); }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === CONSENT_KEY || event.key === null) setConsent(readConsent()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!allowed || admin) {
      (window as any).fbq?.("consent", "revoke");
      (window as any).gtag?.("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      lastPage.current = "";
      return;
    }
    if (PIXEL_ID.test(pixel) && !document.getElementById("crysmona-meta-pixel")) {
      const script = document.createElement("script");
      script.id = "crysmona-meta-pixel";
      script.text = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');`;
      document.head.appendChild(script);
    }
    if (GA4_ID.test(ga) && !document.getElementById("crysmona-ga4")) {
      const external = document.createElement("script");
      external.async = true;
      external.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga);
      document.head.appendChild(external);
      const inline = document.createElement("script");
      inline.id = "crysmona-ga4";
      inline.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${ga}',{anonymize_ip:true,send_page_view:false});`;
      document.head.appendChild(inline);
    }
    (window as any).fbq?.("consent", "grant");
    (window as any).gtag?.("consent", "update", { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
    const pageKey = pixel + ":" + ga + ":" + pathname;
    if (lastPage.current === pageKey) return;
    lastPage.current = pageKey;
    if (PIXEL_ID.test(pixel)) for (const event of routeEvents(pathname)) (window as any).fbq?.("track", event);
    if (GA4_ID.test(ga)) (window as any).gtag?.("event", "page_view", { page_path: pathname });
  }, [allowed, admin, pixel, ga, pathname]);
  return { showConsent: !admin && configured && String(tracking?.analytics_consent_required) === "true" && consent === "", chooseConsent };
}
