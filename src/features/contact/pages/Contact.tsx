import { useState } from "react";

import { ArrowRight } from "lucide-react";

import { api } from "../../../app/Store";

export default function Contact() {
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="page info-page">
      <section className="page-hero">
        <span>WE'RE HERE TO HELP</span>
        <h1>Contact</h1>
        <p>
          Questions about a stone, an order or a piece of jewellery? Send us a
          note.
        </p>
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
          {busy ? "SENDING…" : "SEND MESSAGE"} <ArrowRight />
        </button>
      </form>
    </main>
  );
}
