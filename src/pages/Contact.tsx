import RichText from "../components/RichText";
import { useState } from "react";

import { ArrowRight } from "lucide-react";

import { api, useStore } from "../lib/Store";

export default function Contact() {
  const { store } = useStore();
  const block = store.content.find((b: any) => b.block_key === "contact");
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
        <RichText className="product-description" value={block?.body} />
        {block?.image_url && (
          <img
            className="contact-hero-image"
            src={block.image_url}
            alt={block.title || "Contact"}
          />
        )}
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
