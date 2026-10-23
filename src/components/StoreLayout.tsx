import { ShoppingBag } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAnalytics } from "../hooks/useAnalytics";
import { useSeo } from "../hooks/useSeo";
import { CartProvider, useCart } from "../lib/cart";
import { StoreProvider, useStore } from "../lib/Store";
import { UiProvider, useUi } from "../lib/ui";
import Footer from "./Footer";
import Header from "./Header";
import { LoginModal } from "./LoginModal";

// Layout for the store webapp. It owns everything the shop needs and the admin
// doesn't: catalog, store content, customer, wishlist and bag (providers), page
// SEO and analytics. See AdminLayout for the admin webapp.
export default function StoreLayout() {
  return (
    <StoreProvider>
      <UiProvider>
        <CartProvider>
          <StoreEffects />
          <StoreShell />
        </CartProvider>
      </UiProvider>
    </StoreProvider>
  );
}

// Per-page SEO tags, analytics and the cookie consent banner.
function StoreEffects() {
  useSeo();
  const { showConsent, chooseConsent } = useAnalytics();
  return showConsent ? (
    <section
      className="consent-banner"
      role="region"
      aria-label="Analytics and advertising preferences"
    >
      <p>
        May we use analytics and advertising cookies to measure visits and
        improve our advertising? You can use the store without accepting.{" "}
        <a href="/privacy">Privacy policy</a>
      </p>
      <div>
        <button type="button" onClick={() => chooseConsent("denied")}>
          Decline
        </button>
        <button type="button" onClick={() => chooseConsent("granted")}>
          Accept
        </button>
      </div>
    </section>
  ) : null;
}

// Header, page, footer, login dialog and bag toast.
function StoreShell() {
  const { user, setUser, refresh } = useStore();
  const { count, flush } = useCart();
  const { toast, loginOpen, openLogin, closeLogin } = useUi();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Refresh catalog and stock on each page change (not on first render, which
  // StoreProvider already loads).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refresh();
  }, [pathname]);

  return (
    <>
      <Header cart={count} user={user?.phone || null} onLogin={openLogin} />
      <Outlet />
      <Footer />
      {loginOpen && (
        <LoginModal
          onClose={closeLogin}
          onLogin={setUser}
          beforeLogin={flush}
        />
      )}
      {toast && (
        <div className="cart-toast" role="status">
          <ShoppingBag />
          {toast}
          <button onClick={() => navigate("/cart")}>VIEW BAG</button>
        </div>
      )}
    </>
  );
}
