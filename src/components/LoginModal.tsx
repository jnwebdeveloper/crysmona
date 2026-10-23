import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gem,
  Heart,
  ShieldCheck,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/Store";
export function LoginModal({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (user: any) => void;
}) {
  const [phone, setPhone] = useState(""),
    [otp, setOtp] = useState(""),
    [step, setStep] = useState<"phone" | "otp">("phone"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [demo, setDemo] = useState(""),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.body.style.overflow;
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,a[href]",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  const requestCode = async () => {
    const response = await api("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    setDemo(response.demoCode || "");
  };
  const resend = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await requestCode();
      setOtp("");
      setNotice("A new code is on its way.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (step === "phone") {
        await requestCode();
        setStep("otp");
      } else {
        const user = await api("/auth/verify-otp", {
          method: "POST",
          body: JSON.stringify({ phone, otp }),
        });
        onLogin(user);
        onClose();
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="login-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <aside className="account-art">
          <img
            src="/assets/signature-turquoise.jpeg"
            alt="Handcrafted turquoise pendant"
          />
          <div>
            <span>YOUR CRYSMONA</span>
            <h2>
              A world of gems.
              <br />A story of your own.
            </h2>
            <p>
              Save the pieces you love, follow your orders, and find your next
              keepsake.
            </p>
          </div>
        </aside>
        <section className="account-form">
          <button
            className="login-close"
            aria-label="Close login"
            onClick={onClose}
          >
            <X />
          </button>
          <Gem className="account-gem" />
          <span className="eyebrow">
            A LITTLE CLOSER TO SOMETHING BEAUTIFUL
          </span>
          <h2 id="login-title">
            {step === "phone" ? "Welcome to Crysmona" : "Check your phone"}
          </h2>
          <p>
            {step === "phone"
              ? "Sign in or create your account with your mobile number."
              : "Enter the six-digit code for +91 " + phone + "."}
          </p>
          <form onSubmit={submit}>
            {step === "phone" ? (
              <label>
                Mobile number
                <div className="account-phone">
                  <span>+91</span>
                  <input
                    autoFocus
                    required
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="Your mobile number"
                  />
                </div>
              </label>
            ) : (
              <label>
                Verification code
                <input
                  autoFocus
                  required
                  className="account-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="demo-notice" role="status">
                {notice}
              </p>
            )}
            <button className="account-submit" disabled={busy}>
              {busy
                ? "PLEASE WAIT…"
                : step === "phone"
                  ? "CONTINUE WITH PHONE"
                  : "VERIFY & SIGN IN"}
              <ArrowRight />
            </button>
          </form>
          {step === "otp" && (
            <>
              <button
                className="account-back"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                  setNotice("");
                }}
              >
                <ArrowLeft /> Change phone number
              </button>
              <button
                type="button"
                className="account-back"
                disabled={busy}
                onClick={resend}
              >
                Resend code
              </button>
              {demo && (
                <p className="demo-notice">
                  Development preview · Use code <b>{demo}</b>. No SMS is sent.
                </p>
              )}
            </>
          )}
          <div className="account-benefits">
            <span>
              <Heart /> Your saved favourites
            </span>
            <span>
              <Check /> Easy order tracking
            </span>
          </div>
          <small className="account-assurance">
            <ShieldCheck /> Your personal collection, all in one place.
          </small>
        </section>
      </div>
    </div>
  );
}
