import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { api } from "../lib/Store";

// Loads Meta Pixel and GA4 from public settings (respecting the consent setting)
// and reports page views on route changes.
// IDs come from admin settings and are written into inline scripts, so they are
// validated against the vendors' formats to rule out script injection.
const PIXEL_ID = /^\d{5,20}$/;
const GA4_ID = /^G-[A-Z0-9]{4,20}$/;

function readConsent() {
  try {
    return localStorage.getItem("crysmona-analytics-consent") || "";
  } catch {
    return "";
  }
}

export function useAnalytics() {
  const { pathname } = useLocation();
  const [tracking, setTracking] = useState<any>(null);
  const [consent] = useState(readConsent);

  useEffect(() => {
    api("/settings/public").then(setTracking).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tracking || (String(tracking.analytics_consent_required) === "true" && consent !== "granted")) return;
    const pixel = String(tracking.meta_pixel_id || "").trim();
    if (pixel && !PIXEL_ID.test(pixel)) console.warn("Ignoring invalid Meta Pixel ID in settings.");
    else if (pixel && !document.getElementById("crysmona-meta-pixel")) {
      const script = document.createElement("script");
      script.id = "crysmona-meta-pixel";
      script.text = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`;
      document.head.appendChild(script);
    }
    const ga = String(tracking.ga4_measurement_id || "").trim();
    if (ga && !GA4_ID.test(ga)) console.warn("Ignoring invalid GA4 measurement ID in settings.");
    else if (ga && !document.getElementById("crysmona-ga4")) {
      const external = document.createElement("script");
      external.async = true;
      external.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga);
      document.head.appendChild(external);
      const inline = document.createElement("script");
      inline.id = "crysmona-ga4";
      inline.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${ga}',{anonymize_ip:true});`;
      document.head.appendChild(inline);
    }
  }, [tracking, consent]);

  useEffect(() => {
    const fbq = (window as any).fbq;
    if (!fbq) return;
    fbq("track", "PageView");
    if (pathname.startsWith("/product/")) fbq("track", "ViewContent");
    if (pathname === "/checkout") fbq("track", "InitiateCheckout");
  }, [pathname]);
}
