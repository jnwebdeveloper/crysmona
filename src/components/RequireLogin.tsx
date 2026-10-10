import { ArrowRight, UserRound } from "lucide-react";
import React from "react";
import { useStore } from "../lib/Store";
import { useUi } from "../lib/ui";

// Shows a sign-in prompt instead of the page for signed-out visitors, including
// deep links such as /orders/CRY-123 opened from an email.
export default function RequireLogin({ children }: { children: React.ReactNode }) {
  const { user } = useStore();
  const { openLogin } = useUi();
  if (user) return <>{children}</>;
  return (
    <main className="page">
      <section className="order-success">
        <UserRound />
        <h1>Your personal collection awaits.</h1>
        <button onClick={openLogin}>
          SIGN IN <ArrowRight />
        </button>
      </section>
    </main>
  );
}
