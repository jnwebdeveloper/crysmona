import { useEffect } from "react";
import { useLocation } from "react-router";
import { api } from "../lib/Store";

// Applies the per-page SEO record (title, meta, Open Graph, canonical, JSON-LD)
// from /api/seo whenever the route changes.
function setMeta(selector: string, attr: string, key: string, value: string) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value || "";
}

export function useSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    let live = true;
    api("/seo?path=" + encodeURIComponent(pathname))
      .then((seo) => {
        if (!live || !seo) return;
        document.title = seo.title || "Crysmona Gems & Jewellery";
        setMeta('meta[name="description"]', "name", "description", seo.description);
        setMeta('meta[name="keywords"]', "name", "keywords", seo.keywords);
        setMeta('meta[property="og:title"]', "property", "og:title", seo.og_title || seo.title);
        setMeta(
          'meta[property="og:description"]',
          "property",
          "og:description",
          seo.og_description || seo.description,
        );
        setMeta('meta[property="og:image"]', "property", "og:image", seo.og_image || "");
        let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
        if (!canonical) {
          canonical = document.createElement("link");
          canonical.rel = "canonical";
          document.head.appendChild(canonical);
        }
        canonical.href = location.origin + pathname;
        let ld = document.getElementById("crysmona-jsonld") as HTMLScriptElement | null;
        if (!ld) {
          ld = document.createElement("script");
          ld.id = "crysmona-jsonld";
          ld.type = "application/ld+json";
          document.head.appendChild(ld);
        }
        ld.text = JSON.stringify(
          pathname.startsWith("/product/")
            ? {
                "@context": "https://schema.org",
                "@type": "Product",
                name: seo.og_title || seo.title,
                description: seo.description,
                image: seo.og_image || undefined,
              }
            : { "@context": "https://schema.org", "@type": "WebSite", name: "Crysmona", url: location.origin },
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);
}
