import { useState } from "react";

import { ArrowRight } from "lucide-react";

import { api } from "../lib/Store";

export default function SubscribeForm() {
  const [email, setEmail] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <form
      className="subscribe-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/subscribers", {
            method: "POST",
            body: JSON.stringify({ email }),
          });
          setNotice("You’re subscribed. Welcome to our journey.");
          setEmail("");
        } catch (e: any) {
          setNotice(e.message);
        }
      }}
    >
      <label>
        <input
          type="email"
          required
          aria-label="Newsletter email address"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button aria-label="Subscribe to newsletter">
          <ArrowRight />
        </button>
      </label>
      <small role="status">{notice}</small>
    </form>
  );
}
