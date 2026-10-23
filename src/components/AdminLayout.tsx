import { Suspense, useEffect } from "react";
import { Outlet } from "react-router";
import Loader from "./Loader";

// Layout for the admin webapp. Unlike StoreLayout it loads none of the shop's
// data (catalog, customer, wishlist, bag), SEO or analytics: admin pages only
// call /api/admin/*. The admin page itself is downloaded on first visit.
export default function AdminLayout() {
  useEffect(() => {
    const title = document.title;
    document.title = "Crysmona Admin";
    // Keep admin pages out of search engines.
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = title;
      robots.remove();
    };
  }, []);
  return (
    <Suspense
      fallback={
        <main className="page">
          <Loader label="Loading admin…" />
        </main>
      }
    >
      <Outlet />
    </Suspense>
  );
}
