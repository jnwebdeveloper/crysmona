import RichText from "../components/RichText";
import { useState } from "react";

import { ArrowRight } from "lucide-react";

import { api, useStore } from "../lib/Store";

export default function Contact() {
  const { store } = useStore();
  const block = store.content.find((b: any) => b.block_key === "contact");
  const contacts = [1, 2].map((slot) => store.content.find((item: any) => item.block_key === `contact-info-${slot}`))
    .filter((item: any) => item && item.active !== false && (item.title || item.subtitle || item.body));
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (block?.active === false)
    return (
      <main className="page wishlist-empty">
        <h1>Contact</h1>
        <p>This page is being updated. Please check back soon.</p>
      </main>
    );
  return (
    <main className="page info-page">
      <section className="page-hero">
        <span>{block?.subtitle}</span>
        <h1>{block?.title || "Contact"}</h1>
      </section>
      <section className="contact-intro">
        <RichText className="product-description" value={block?.body} />
        {block?.image_url && (
          <img
            className="contact-hero-image"
            src={block.image_url}
            alt={block.title || "Contact"}
          />
        )}
      </section>
      {contacts.length > 0 && <section className="contact-details" aria-label="Contact information">
        {contacts.map((contact: any) => <article key={contact.block_key}>
          {contact.title && <h2>{contact.title}</h2>}
          {contact.subtitle && <a href={`tel:${contact.subtitle.replace(/[^+0-9]/g, "")}`}>{contact.subtitle}</a>}
          {contact.body && <RichText className="contact-address" value={contact.body} />}
        </article>)}
      </section>}
      <section className="contact-markets" aria-labelledby="contact-markets-title">
        <span className="contact-markets-eyebrow">ACROSS BORDERS</span>
        <h2 id="contact-markets-title">Serving the US & Europe</h2>
        <p>Our products are available to customers in the United States and Europe.</p>
        <svg className="contact-world-map" viewBox="0 0 1000 480" role="img" aria-label="World map with pins marking the United States and Europe as sales regions">
          <defs><pattern id="map-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeOpacity=".06" /></pattern></defs>
          <rect width="1000" height="480" rx="12" fill="url(#map-grid)" />
          <g fill="currentColor" opacity=".18" stroke="currentColor" strokeLinejoin="round" strokeWidth="4">
            <path d="M65 90 110 66 160 72 184 42 230 37 268 65 293 66 311 92 287 118 263 127 244 156 221 168 227 194 248 213 240 239 220 226 203 200 177 190 157 162 127 151 111 119 78 121Z" />
            <path d="M257 254 284 247 323 266 347 291 337 324 315 345 301 382 280 422 266 400 265 365 247 329 237 295Z" />
            <path d="M323 37 359 26 384 42 370 76 343 100 321 78Z" />
            <path d="M449 139 457 113 480 106 486 82 508 63 523 73 512 111 530 119 552 109 572 123 562 148 536 151 517 166 493 152 477 160Z" />
            <path d="M464 179 501 171 536 186 555 221 544 247 521 270 508 311 485 325 469 299 466 272 443 239 441 211Z" />
            <path d="M548 91 591 67 652 56 706 68 745 60 789 79 839 83 881 110 909 138 882 153 855 139 827 169 805 184 802 211 773 221 752 201 735 180 707 191 687 232 663 222 651 191 617 169 584 170 563 149 572 123 552 109Z" />
            <path d="M752 245 778 251 788 278 816 286 827 301 797 303 773 285Z M815 329 857 315 891 328 912 354 902 384 867 393 835 377 807 369Z M938 391 950 373 955 385 946 409Z" />
          </g>
          {[{ x: 188, y: 150, label: "United States" }, { x: 502, y: 128, label: "Europe" }].map((pin) => <g key={pin.label}>
            <circle cx={pin.x} cy={pin.y} r="24" fill="#a77845" opacity=".15" />
            <path d={`M ${pin.x} ${pin.y + 12} C ${pin.x - 32} ${pin.y - 20}, ${pin.x + 32} ${pin.y - 20}, ${pin.x} ${pin.y + 12}`} fill="#865a31" />
            <circle cx={pin.x} cy={pin.y - 7} r="4" fill="white" />
            <rect x={pin.x - 73} y={pin.y + 25} width="146" height="32" rx="16" fill="#fffdf8" />
            <text x={pin.x} y={pin.y + 46} textAnchor="middle" fontSize="16" fill="#342b25">{pin.label}</text>
          </g>)}
        </svg>
        <p className="contact-map-note">Pins indicate sales regions.</p>
      </section>
      <form
        className="contact-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          setError("");
          try {
            await api("/enquiries", {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(new FormData(form))),
            });
            setNotice("Thank you. Your enquiry has been received.");
            form.reset();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input name="name" required aria-label="Name" placeholder="Name" />
        <input
          name="email"
          required
          type="email"
          aria-label="Email"
          placeholder="Email"
        />
        <input name="phone" aria-label="Phone" placeholder="Phone" />
        <textarea
          name="message"
          required
          aria-label="Message"
          placeholder="How can we help?"
          rows={6}
        />
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button disabled={busy}>
          {busy ? "SENDING…" : block?.cta_label || "SEND MESSAGE"}{" "}
          <ArrowRight />
        </button>
      </form>
    </main>
  );
}
