import { ShoppingBag } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useCart } from "../lib/cart";
import { useStore } from "../lib/Store";
import { useUi } from "../lib/ui";
import Footer from "./Footer";
import Header from "./Header";
import { LoginModal } from "./LoginModal";

// Shell for every storefront route: header, page, footer, login dialog and bag toast.
export default function StoreLayout() {
  const { user, setUser, refresh } = useStore();
  const { count } = useCart();
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
      {loginOpen && <LoginModal onClose={closeLogin} onLogin={setUser} />}
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
