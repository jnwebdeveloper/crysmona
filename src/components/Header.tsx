import { megaMenuLinks } from "../lib/navigation";
import React, { useEffect, useState } from "react";

import {
  ArrowRight,
  ChevronDown,
  Heart,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";

import { useLocation } from "react-router";
import { go as navTo, useStore } from "../lib/Store";

export default function Header({
  cart,
  user,
  onLogin,
}: {
  cart: number;
  user: string | null;
  onLogin: () => void;
}) {
  const { catalog, wishlist, store } = useStore();
  const products = catalog,
    gems = catalog.filter((p) => p.kind === "gemstone");
  const [active, setActive] = useState<string | null>(null),
    [menu, setMenu] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState("");
  const [scrolled, setScrolled] = useState(() => window.scrollY > 16);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const close = () => {
    setActive(null);
    setMenu(false);
  };
  useEffect(() => {
    const dismiss = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        setSearchOpen(false);
        document
          .querySelector<HTMLButtonElement>('.nav-toggle[aria-expanded="true"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, []);
  // Close menus whenever the route changes (links, search results, back/forward).
  const { pathname } = useLocation();
  useEffect(close, [pathname]);
  const link = (path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    close();
    navTo(path);
  };
  const matches = products.filter((p) =>
    (p.name + " " + p.stone + " " + p.note)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <header
        className={"nav site-nav" + (scrolled ? " is-scrolled" : "")}
        onMouseLeave={() => setActive(null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setActive(null);
        }}
      >
        <button
          className="brand"
          onClick={() => {
            close();
            navTo("/");
          }}
        >
          <img
            src="/assets/crysmona-logo-cropped.png"
            alt="Crysmona Gems & Jewellery"
          />
        </button>
        <nav
          id="main-navigation"
          aria-label="Main navigation"
          className={menu ? "open" : ""}
        >
          <a href="/" onClick={link("/")} onMouseEnter={() => setActive(null)}>
            Home
          </a>
          {["Gemstones", "Jewellery", "Discover"].map((label) => (
            <div className="nav-group" key={label}>
              <button
                className="nav-toggle"
                aria-expanded={active === label}
                aria-controls={"mega-" + label}
                onClick={() => setActive(active === label ? null : label)}
              >
                {label}
                <ChevronDown />
              </button>
              {active === label && (
                <div className="mega-menu" id={"mega-" + label}>
                  <div className="mega-intro">
                    <span>THE CRYSMONA EDIT</span>
                    <h2>
                      {label === "Gemstones"
                        ? "A world of natural colour."
                        : label === "Jewellery"
                          ? "Find your everyday signature."
                          : "Every stone has a story."}
                    </h2>
                    <p>
                      Natural character. Thoughtful details. Something
                      beautifully yours.
                    </p>
                    <a
                      href={
                        label === "Gemstones"
                          ? "/gemstones"
                          : label === "Jewellery"
                            ? "/jewellery"
                            : "/about"
                      }
                      onClick={link(
                        label === "Gemstones"
                          ? "/gemstones"
                          : label === "Jewellery"
                            ? "/jewellery"
                            : "/about",
                      )}
                    >
                      Explore {label.toLowerCase()} <ArrowRight />
                    </a>
                  </div>
                  <div className="mega-links">
                    <span>
                      {label === "Gemstones"
                        ? "EXPLORE THE STONES"
                        : label === "Jewellery"
                          ? "SHOP THE COLLECTION"
                          : "GET TO KNOW US"}
                    </span>
                    {megaMenuLinks(
                      label,
                      store.categories,
                      store.navigation,
                    ).map(({ label: name, url: path }) => (
                      <a key={path} href={path} onClick={link(path)}>
                        {name}
                        <ArrowRight />
                      </a>
                    ))}
                  </div>
                  <a
                    className="mega-feature"
                    href={
                      label === "Gemstones"
                        ? "/gemstones"
                        : label === "Jewellery"
                          ? "/product/purple-copper-turquoise-pendant"
                          : "/our-craft"
                    }
                    onClick={link(
                      label === "Gemstones"
                        ? "/gemstones"
                        : label === "Jewellery"
                          ? "/product/purple-copper-turquoise-pendant"
                          : "/our-craft",
                    )}
                  >
                    <img
                      src={
                        label === "Gemstones"
                          ? "/assets/gem-larimar.jpeg"
                          : "/assets/signature-turquoise.jpeg"
                      }
                      alt={
                        label === "Gemstones"
                          ? "Blue gemstone cabochons"
                          : "Turquoise pendant on natural linen"
                      }
                    />
                    <span>
                      {label === "Gemstones"
                        ? "Colour, in its purest form"
                        : "Made to be treasured"}
                      <ArrowRight />
                    </span>
                  </a>
                </div>
              )}
            </div>
          ))}
          <a
            href="/contact"
            onClick={link("/contact")}
            onMouseEnter={() => setActive(null)}
          >
            Contact
          </a>
        </nav>
        <div className="nav-icons">
          <button
            className="search-trigger"
            onClick={() => {
              close();
              setSearchOpen(true);
            }}
            aria-label="Search"
          >
            <Search />
          </button>
          <button
            className="wishlist-trigger"
            aria-label={"My wishlist, " + wishlist.length + " saved items"}
            onClick={() => {
              close();
              navTo("/wishlist");
            }}
          >
            <Heart />
            {wishlist.length > 0 && <i>{wishlist.length}</i>}
          </button>
          <button
            className="account-btn"
            onClick={() => (user ? navTo("/orders") : onLogin())}
            title={user ? "My Orders" : "Login"}
          >
            <UserRound />
            {user && <span>My Orders</span>}
          </button>
          <button
            aria-label="Shopping bag"
            onClick={() => {
              close();
              navTo("/cart");
            }}
          >
            <ShoppingBag />
            {user && cart > 0 && <i>{cart}</i>}
          </button>
          <button
            className="hamb"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            aria-controls="main-navigation"
            onClick={() => {
              setMenu(!menu);
              setActive(null);
            }}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {searchOpen && (
        <div
          className="search-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <section className="search-panel">
            <button
              className="search-close"
              onClick={() => setSearchOpen(false)}
            >
              <X />
            </button>
            <span>SEARCH CRYSMONA</span>
            <div className="search-box">
              <Search />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pendants, gemstones, amethyst…"
              />
            </div>
            {query && (
              <div className="search-results">
                {matches.length ? (
                  matches.map((p) => (
                    <button
                      key={p.slug}
                      onClick={() => {
                        setSearchOpen(false);
                        navTo("/product/" + p.slug);
                      }}
                    >
                      <img src={p.image} />
                      <span>
                        <b>{p.name}</b>
                        <small>{p.stone}</small>
                      </span>
                      <strong>{p.price}</strong>
                    </button>
                  ))
                ) : (
                  <p>No pieces found. Try another gemstone or product name.</p>
                )}
              </div>
            )}
            <div className="search-suggestions">
              <b>Popular searches</b>
              {["Amethyst", "Turquoise", "Pendant", "Onyx"].map((x) => (
                <button key={x} onClick={() => setQuery(x)}>
                  {x}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
