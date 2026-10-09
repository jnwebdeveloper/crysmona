import React, { useEffect, useRef, useState } from "react";
import Loader from "../components/Loader";
import SupportPage from "../features/content/pages/SupportPage";

import { ArrowRight, ShoppingBag, UserRound } from "lucide-react";

import { LoginModal, WishlistPage } from "../features/account/Account";
import AdminPage from "../features/admin/pages/Admin";
import Checkout, { PayPalReturn } from "../features/checkout/pages/Checkout";
import { CartItem, Order, Product } from "../features/products/model";
import GemstoneDetail from "../features/products/pages/GemstoneDetail";
import { api, go as navTo, useStore } from "./Store";

import Footer from "../components/layout/Footer";
import Header from "../components/layout/Header";
import CartPage from "../features/cart/pages/CartPage";
import Contact from "../features/contact/pages/Contact";
import InfoPage from "../features/content/pages/InfoPage";
import Home from "../features/home/pages/Home";
import OrdersPage from "../features/orders/pages/OrdersPage";
import OrderDetail from "../features/orders/pages/OrderDetail";
import Listing from "../features/products/pages/Listing";
import ProductDetail from "../features/products/pages/ProductDetail";
function OrderDetailLoader({orderNumber}:{orderNumber:string}){
 const [order,setOrder]=useState<Order|null>(null),[error,setError]=useState("");
 useEffect(()=>{api("/orders/"+encodeURIComponent(orderNumber)).then(setOrder).catch(e=>setError(e.message))},[orderNumber]);
 if(error)return <main className="page wishlist-empty"><h1>{error}</h1><button onClick={()=>navTo("/orders")}>BACK TO MY ORDERS</button></main>;
 if(!order)return <main className="page"><Loader label="Loading order…" /></main>;
 return <OrderDetail order={order}/>;
}
export default function App() {
  const { catalog, user, setUser, loading, catalogError, refresh } = useStore();
  const [cart, setCart] = useState<CartItem[]>([]),
    [cartReady,setCartReady]=useState(false),
    [cartError,setCartError]=useState(""),
    [orders, setOrders] = useState<Order[]>([]),
    [loginOpen, setLoginOpen] = useState(false),
    [toast, setToast] = useState(""),
    [path, setPath] = useState(location.pathname),
    [orderError, setOrderError] = useState("");
  const [tracking,setTracking]=useState<any>(null),[consent,setConsent]=useState(()=>localStorage.getItem("crysmona-analytics-consent")||"");
  useEffect(() => {
    if (!loading && !catalogError)
      setCart((current) =>
        current.flatMap((item) => {
          const product = catalog.find((p) => p.slug === item.product?.slug);
          return product && Number.isInteger(item.qty) && item.qty > 0
            ? [{ product, qty: item.qty }]
            : [];
        }),
      );
  }, [catalog, loading, catalogError]);
  const cartQueue=useRef(Promise.resolve());
  useEffect(()=>{let live=true;setCartReady(false);api("/cart").then(data=>{if(live){setCart(data);setCartError("");setCartReady(true)}}).catch(e=>{if(live){setCart([]);setCartError(e.message);setCartReady(true)}setToast(e.message)});return()=>{live=false}},[user?.id]);
  useEffect(()=>{if(!cartReady)return;cartQueue.current=cartQueue.current.then(()=>api("/cart",{method:"PUT",body:JSON.stringify({items:cart.map(i=>({slug:i.product.slug,qty:i.qty}))})})).catch(e=>setToast(e.message));},[cart,cartReady]);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    api("/seo?path=" + encodeURIComponent(path)).then((seo) => {
      if (!seo) return;
      document.title = seo.title || "Crysmona Gems & Jewellery";
      const meta = (selector:string, attr:string, key:string, value:string) => {
        let el=document.head.querySelector(selector) as HTMLMetaElement|null;
        if(!el){el=document.createElement("meta");el.setAttribute(attr,key);document.head.appendChild(el)}
        el.content=value||"";
      };
      meta('meta[name="description"]','name','description',seo.description);
      meta('meta[name="keywords"]','name','keywords',seo.keywords);
      meta('meta[property="og:title"]','property','og:title',seo.og_title||seo.title);
      meta('meta[property="og:description"]','property','og:description',seo.og_description||seo.description);
      meta('meta[property="og:image"]','property','og:image',seo.og_image||"");
      let canonical=document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement|null; if(!canonical){canonical=document.createElement("link");canonical.rel="canonical";document.head.appendChild(canonical)} canonical.href=location.origin+path;
      let ld=document.getElementById("crysmona-jsonld") as HTMLScriptElement|null;if(!ld){ld=document.createElement("script");ld.id="crysmona-jsonld";ld.type="application/ld+json";document.head.appendChild(ld)}ld.text=JSON.stringify(path.startsWith("/product/")?{"@context":"https://schema.org","@type":"Product","name":seo.og_title||seo.title,"description":seo.description,"image":seo.og_image||undefined}: {"@context":"https://schema.org","@type":"WebSite","name":"Crysmona","url":location.origin});
    }).catch(()=>{});
    if ((window as any).fbq) {
      (window as any).fbq("track", "PageView");
      if (path.startsWith("/product/")) (window as any).fbq("track", "ViewContent");
      if (path === "/checkout") (window as any).fbq("track", "InitiateCheckout");
    }
  }, [path]);
  useEffect(() => { api("/settings/public").then(setTracking).catch(()=>{}); }, []);
  useEffect(() => {
    if(!tracking || (String(tracking.analytics_consent_required)==="true" && consent!=="granted")) return;
    const pixel=String(tracking.meta_pixel_id||"").trim();
    if(pixel && !document.getElementById("crysmona-meta-pixel")){const script=document.createElement("script");script.id="crysmona-meta-pixel";script.text=`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`;document.head.appendChild(script)}
    const ga=String(tracking.ga4_measurement_id||"").trim(); if(ga && !document.getElementById("crysmona-ga4")){const ext=document.createElement("script");ext.async=true;ext.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(ga);document.head.appendChild(ext);const inline=document.createElement("script");inline.id="crysmona-ga4";inline.text=`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${ga}',{anonymize_ip:true});`;document.head.appendChild(inline)}
  },[tracking,consent]);
  useEffect(() => {
    if (path === "/orders" && user) {
      api("/orders")
        .then((data) => {
          setOrders(data);
          setOrderError("");
        })
        .catch((e) => setOrderError(e.message));
    }
  }, [path, user]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const add = (product: Product, qty = 1) => {
    if ((product.stockQty ?? 0) <= 0) {
      setToast("This piece is currently out of stock.");
      return;
    }
    const existing = cart.find((i) => i.product.slug === product.slug);
    if (
      product.stockQty !== undefined &&
      (existing?.qty || 0) + qty > product.stockQty
    ) {
      setToast("The requested quantity exceeds available stock.");
      return;
    }
    setCart((c) => {
      const found = c.find((i) => i.product.slug === product.slug);
      return found
        ? c.map((i) =>
            i.product.slug === product.slug ? { ...i, qty: i.qty + qty } : i,
          )
        : [...c, { product, qty }];
    });
    setToast(`${product.name} added to your bag`);
    if ((window as any).fbq) (window as any).fbq("track", "AddToCart", {content_name: product.name, content_ids: [product.slug], content_type: "product", value: product.priceCents ? product.priceCents/100 : undefined, currency: "USD"});
    navTo("/cart");
  };
  const update = (slug: string, qty: number) => {
    const available = catalog.find((p) => p.slug === slug)?.stockQty ?? 0;
    if (qty > available) {
      setToast("The requested quantity exceeds available stock.");
      return;
    }
    setCart((c) =>
      qty < 1
        ? c.filter((i) => i.product.slug !== slug)
        : c.map((i) => (i.product.slug === slug ? { ...i, qty } : i)),
    );
  };
  const remove = (slug: string) =>
    setCart((c) => c.filter((i) => i.product.slug !== slug));
  let content: React.ReactNode;
  if (path === "/admin") content = <AdminPage />;
  else if (path.startsWith("/product/")) {
    const product = catalog.find((p) => p.slug === path.split("/").pop());
    content = product ? (
      product.kind === "gemstone" ? (
        <GemstoneDetail key={product.slug} product={product} add={add} />
      ) : (
        <ProductDetail key={product.slug} product={product} add={add} />
      )
    ) : (
      <main className="page">
        <section className="wishlist-empty">
          <h1>This piece is unavailable.</h1>
          <button onClick={() => navTo("/gemstones")}>EXPLORE GEMSTONES</button>
        </section>
      </main>
    );
  } else if (path === "/gemstones")
    content = <Listing kind="Gemstones" add={add} />;
  else if (path === "/jewellery")
    content = <Listing kind="Jewellery" add={add} />;
  else if (path === "/wishlist") content = <WishlistPage add={add} />;
  else if (path === "/our-craft") content = <InfoPage title="Our Craft" />;
  else if (path === "/about") content = <InfoPage title="About Crysmona" />;
  else if (
    ["/faq", "/shipping", "/returns", "/care", "/privacy", "/terms"].includes(
      path,
    )
  )
    content = <SupportPage page={path.slice(1)} />;
  else if (path === "/contact") content = <Contact />;
  else if (path === "/cart")
    content = <CartPage items={cart} update={update} remove={remove} />;
  else if (path === "/checkout/paypal")
    content = (
      <PayPalReturn
        onLogin={() => setLoginOpen(true)}
        onComplete={() => setCart([])}
      />
    );
  else if (path === "/checkout")
    content = (
      <Checkout
        items={cart}
        onLogin={() => setLoginOpen(true)}
        onComplete={() => setCart([])}
      />
    );
  else if (path.startsWith("/orders/") && user) {
    const orderNumber=decodeURIComponent(path.slice("/orders/".length));
    const cached=orders.find(o=>o.id===orderNumber);
    content=cached?<OrderDetail order={cached}/>:<OrderDetailLoader orderNumber={orderNumber}/>;
  } else if (path === "/orders")
    content = user ? (
      <>
        <div className="account-strip">
          <span>Signed in as +91 {user.phone}</span>
          <button
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              setUser(null);
              setOrders([]);
              localStorage.removeItem("crysmona-user");
            }}
          >
            Sign out
          </button>
        </div>
        {orderError && <p className="form-error">{orderError}</p>}
        <OrdersPage orders={orders} />
      </>
    ) : (
      <main className="page">
        <section className="order-success">
          <UserRound />
          <h1>Your personal collection awaits.</h1>
          <button onClick={() => setLoginOpen(true)}>
            SIGN IN <ArrowRight />
          </button>
        </section>
      </main>
    );
  else if (path === "/") content = <Home add={add} />;
  else
    content = (
      <main className="page wishlist-empty">
        <h1>Page not found</h1>
        <a href="/">Return home</a>
      </main>
    );
  if (path !== "/admin" && (loading || !cartReady || catalogError))
    content = (
      <main className="page wishlist-empty">
        {(loading || !cartReady) ? <Loader label="Gathering your collection…" /> : <h1>The store is temporarily unavailable</h1>}
        {(catalogError || cartError) && (
          <>
            <p role="alert">{catalogError || cartError}</p>
            <button onClick={refresh}>Try again</button>
          </>
        )}
      </main>
    );
  return (
    <>
      {path !== "/admin" && (
        <Header
          cart={cart.reduce((n, i) => n + i.qty, 0)}
          user={user?.phone || null}
          onLogin={() => setLoginOpen(true)}
        />
      )}{" "}
      {content}
      {path !== "/admin" && <Footer />}
      {loginOpen && (
        <LoginModal onClose={() => setLoginOpen(false)} onLogin={setUser} />
      )}{" "}
      {toast && (
        <div className="cart-toast" role="status">
          <ShoppingBag />
          {toast}
          <button onClick={() => navTo("/cart")}>VIEW BAG</button>
        </div>
      )}
    </>
  );
}
