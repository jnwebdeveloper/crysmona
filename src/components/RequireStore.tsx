import { Outlet } from "react-router";
import { useStore } from "../lib/Store";
export default function RequireStore() {
  const { loading, catalogError, refresh } = useStore();
  if (loading)
    return (
      <main
        className="page store-placeholder"
        aria-busy="true"
        aria-label="Loading store"
      >
        <div />
        <div />
        <div />
      </main>
    );
  if (!catalogError) return <Outlet />;
  return (
    <main className="page wishlist-empty">
      <h1>The store is temporarily unavailable</h1>
      <p role="alert">{catalogError}</p>
      <button onClick={refresh}>Try again</button>
    </main>
  );
}
