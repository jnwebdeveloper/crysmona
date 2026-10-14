import { Share2 } from "lucide-react";
import { useState } from "react";
export default function ProductShare({ name, slug }: { name: string; slug: string }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState("");
  const [busy, setBusy] = useState(false);
  const share = async () => {
    const url = new URL("/product/" + encodeURIComponent(slug), window.location.origin).href;
    setBusy(true); setMessage(""); setFallback("");
    try {
      if (navigator.share) {
        try { await navigator.share({ title: name + " | Crysmona", text: name, url }); return; }
        catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
      }
      try { await navigator.clipboard.writeText(url); setMessage("Product link copied."); }
      catch { setFallback(url); setMessage("Copy the product link below to share it."); }
    } finally { setBusy(false); }
  };
  return <div className="product-share">
    <button type="button" aria-label="Share product" title="Share product" onClick={share} disabled={busy}><Share2 /></button>
    {message && <p role="status">{message}</p>}
    {fallback && <input aria-label="Product link to share" value={fallback} readOnly onFocus={e => e.target.select()} />}
  </div>;
}
