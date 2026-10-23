import { ArrowUpRight, Facebook, Instagram } from "lucide-react";
import { Link } from "react-router";
import { useStore } from "../lib/Store";

const collectionLinks = [
  { url: "/", label: "Home" },
  { url: "/gemstones", label: "Gemstones" },
  { url: "/jewellery", label: "Jewellery" },
  { url: "/our-craft", label: "Our Craft" },
  { url: "/about", label: "About Us" },
  { url: "/contact", label: "Contact" },
];

function footerPath(url: string) {
  try {
    return new URL(url, "https://crysmona.vercel.app").pathname;
  } catch {
    return url;
  }
}

export default function Footer() {
  const { store } = useStore();
  const links = [...collectionLinks];
  for (const item of store.navigation) {
    if (
      item.group_name === "Footer" &&
      item.url !== "/shipping" &&
      !/^\/orders(?:[/?#]|$)/i.test(footerPath(item.url)) &&
      item.label.trim().toLowerCase() !== "track order" &&
      !links.some((link) => link.url === item.url)
    ) {
      links.push({ url: item.url, label: item.label });
    }
  }

  return (
    <footer id="footer" aria-label="Crysmona footer">
      <div className="footer-intro">
        <div>
          <span className="footer-eyebrow">NATURE’S ART. YOUR STORY.</span>
          <h2>
            Some things are
            <br />
            meant to be treasured.
          </h2>
        </div>
        <Link className="footer-discover" to="/jewellery">
          Discover the collection <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>

      <div className="footer-main">
        <div className="foot-brand">
          <Link className="footer-logo" to="/" aria-label="Crysmona home">
            <img src="/assets/crysmona-logo-cropped.png" alt="Crysmona" />
          </Link>
          <p>
            Natural gemstones. Thoughtfully crafted jewellery. Stories for a
            more meaningful you.
          </p>
          {(store.settings.instagram_url || store.settings.facebook_url) && (
            <div className="footer-socials">
              {store.settings.instagram_url && (
                <a
                  href={store.settings.instagram_url}
                  aria-label="Crysmona on Instagram"
                >
                  <Instagram aria-hidden="true" />
                </a>
              )}
              {store.settings.facebook_url && (
                <a
                  href={store.settings.facebook_url}
                  aria-label="Crysmona on Facebook"
                >
                  <Facebook aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
        <nav className="footer-links" aria-label="Explore Crysmona">
          <h3>Explore Crysmona</h3>
          {links.map((link) =>
            /^(https?:|mailto:|tel:)/i.test(link.url) ? (
              <a key={link.url} href={link.url}>
                {link.label}
              </a>
            ) : (
              <Link key={link.url} to={link.url}>
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <nav className="footer-links" aria-label="Customer care">
          <h3>Here for you</h3>
          <Link to="/faq">FAQs</Link>
          <Link to="/returns">Returns &amp; Exchanges</Link>
          <Link to="/care">Care Instructions</Link>
          <Link to="/contact" className="footer-contact">
            Let’s talk <ArrowUpRight aria-hidden="true" />
          </Link>
        </nav>
      </div>

      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Crysmona. All rights reserved.</p>
        <span className="footer-signoff">
          A little wonder. A lasting connection.
        </span>
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
        </nav>
      </div>
    </footer>
  );
}
