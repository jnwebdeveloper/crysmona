import React from "react";
import { Outlet } from "react-router";
import { useCart } from "../lib/cart";
import { useStore } from "../lib/Store";
import Loader from "./Loader";

// Gate for routes that need the catalog, store content and bag. Routes that do not
// (contact, orders, 404) sit outside it and stay usable while the store is loading
// or unavailable.
export default function RequireStore() {
  const { loading, catalogError, refresh } = useStore();
  const { ready, error } = useCart();
  if (!loading && ready && !catalogError) return <Outlet />;
  return (
    <main className="page wishlist-empty">
      {loading || !ready ? (
        <Loader label="Gathering your collection…" />
      ) : (
        <h1>The store is temporarily unavailable</h1>
      )}
      {(catalogError || error) && (
        <>
          <p role="alert">{catalogError || error}</p>
          <button onClick={refresh}>Try again</button>
        </>
      )}
    </main>
  );
}
