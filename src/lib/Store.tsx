import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Product } from "./model";
export async function api(path: string, options: RequestInit = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(
      new Error(data.error || "The service is unavailable. Please try again."),
      { status: r.status },
    );
  return data;
}
// Imperative navigation for code outside React Router hooks. App registers React
// Router's navigate() here; inside components, prefer <Link> or useNavigate().
let navigator: ((path: string) => void) | null = null;
export const setNavigator = (navigate: ((path: string) => void) | null) => {
  navigator = navigate;
};
export const go = (path: string) => {
  if (navigator) navigator(path);
  else window.location.assign(path);
};
const Context = createContext<any>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<Product[]>([]),
    [wishlist, setWishlist] = useState<string[]>([]),
    [user, setUser] = useState<any>(null),
    [store, setStore] = useState<any>({
      content: [],
      navigation: [],
      categories: [],
      settings: {},
      reviews: [],
    }),
    [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true),
    [catalogError, setCatalogError] = useState("");
  const [ready, setReady] = useState(false);
  const queue = useRef(Promise.resolve());
  const refresh = async () => {
    try {
      const [products, site] = await Promise.all([
        api("/products"),
        api("/storefront"),
      ]);
      setCatalog(products);
      setStore(site);
      setCatalogError("");
    } catch (e) {
      setCatalog([]);
      setCatalogError(
        e instanceof Error ? e.message : "Unable to load the store.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    api("/auth/me")
      .then(setUser)
      .catch(() => {});
    // Page changes also refresh the catalog (see StoreLayout) so stock stays current.
    const listener = () => refresh();
    window.addEventListener("focus", listener);
    return () => window.removeEventListener("focus", listener);
  }, []);
  // What the server already has, so loading the wishlist does not save it straight back.
  const synced = useRef("");
  useEffect(() => {
    setReady(false);
    let valid = true;
    api("/wishlist").then((remote) => { if(valid){ synced.current = JSON.stringify(remote); setWishlist(remote); setReady(true); } }).catch((e:Error)=>setMessage(e.message));
    return () => { valid=false; };
  }, [user?.id]);
  useEffect(() => {
    if (!ready) return;
    const body = JSON.stringify(wishlist);
    if (body === synced.current) return;
    synced.current = body;
    queue.current = queue.current.then(() => api("/wishlist", { method:"PUT", body:JSON.stringify({slugs:wishlist}) })).catch((e:Error)=>setMessage(e.message));
  }, [wishlist, ready]);
  const toggle = (slug: string) =>
    setWishlist((current) =>
      current.includes(slug)
        ? current.filter((x) => x !== slug)
        : [...current, slug],
    );
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  return (
    <Context.Provider
      value={{
        catalog,
        wishlist,
        toggle,
        user,
        setUser,
        store,
        refresh,
        loading,
        catalogError,
      }}
    >
      {children}
      {message && (
        <div className="store-message" role="status">
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
export const useStore = () =>
  useContext(Context) as {
    loading: boolean;
    catalogError: string;
    catalog: Product[];
    wishlist: string[];
    toggle: (slug: string) => void;
    user: any;
    setUser: (user: any) => void;
    store: any;
    refresh: () => Promise<void>;
  };
