import React, { lazy, Suspense, useEffect } from "react";
import {
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";
import Loader from "./components/Loader";
import RequireLogin from "./components/RequireLogin";
import RequireStore from "./components/RequireStore";
import StoreLayout from "./components/StoreLayout";
import { useAnalytics } from "./hooks/useAnalytics";
import { useSeo } from "./hooks/useSeo";
import { setNavigator } from "./lib/Store";
import CartPage from "./pages/CartPage";
import Checkout from "./pages/Checkout";
import Contact from "./pages/Contact";
import Home from "./pages/Home";
import InfoPage from "./pages/InfoPage";
import Listing from "./pages/Listing";
import NotFound from "./pages/NotFound";
import OrderDetail from "./pages/OrderDetail";
import OrdersPage from "./pages/OrdersPage";
import PayPalReturn from "./pages/PayPalReturn";
import ProductPage from "./pages/ProductPage";
import SupportPage from "./pages/SupportPage";
import { WishlistPage } from "./pages/WishlistPage";

// Admin is only for staff, so it is split into its own bundle and loaded on demand.
const AdminPage = lazy(() => import("./pages/Admin"));
const SUPPORT_PAGES = ["faq", "returns", "care", "privacy", "terms"];

// Lets go() navigate through React Router, and scrolls to the top on new pages
// (back/forward keeps the browser's scroll position).
function NavigationEffects() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { pathname } = useLocation();
  useEffect(() => {
    setNavigator((path) => navigate(path));
    return () => setNavigator(null);
  }, [navigate]);
  useEffect(() => {
    if (navigationType !== "POP")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pathname]);
  useSeo();
  useAnalytics();
  return null;
}

export default function App() {
  return (
    <>
      <NavigationEffects />
      <Routes>
        <Route
          path="admin/:section?"
          element={
            <Suspense
              fallback={
                <main className="page">
                  <Loader label="Loading admin…" />
                </main>
              }
            >
              <AdminPage />
            </Suspense>
          }
        />
        <Route element={<StoreLayout />}>
          {/* Pages that need the catalog, store content or bag. */}
          <Route element={<RequireStore />}>
            <Route index element={<Home />} />
            <Route path="gemstones" element={<Listing kind="Gemstones" />} />
            <Route path="jewellery" element={<Listing kind="Jewellery" />} />
            <Route path="product/:slug" element={<ProductPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route
              path="cart"
              element={
                <RequireLogin>
                  <CartPage />
                </RequireLogin>
              }
            />
            <Route
              path="checkout"
              element={
                <RequireLogin>
                  <Checkout />
                </RequireLogin>
              }
            />
            <Route path="checkout/paypal" element={<PayPalReturn />} />
            <Route path="our-craft" element={<InfoPage title="Our Craft" />} />
            <Route path="about" element={<InfoPage title="About Crysmona" />} />
            {SUPPORT_PAGES.map((page) => (
              <Route
                key={page}
                path={page}
                element={<SupportPage page={page} />}
              />
            ))}
          </Route>
          {/* Pages that work even when the catalog is unavailable. */}
          <Route path="contact" element={<Contact />} />
          <Route
            path="orders"
            element={
              <RequireLogin>
                <OrdersPage />
              </RequireLogin>
            }
          />
          <Route
            path="orders/:orderNumber"
            element={
              <RequireLogin>
                <OrderDetail />
              </RequireLogin>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
