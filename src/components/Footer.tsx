import { Facebook, Instagram } from "lucide-react";

import { Link } from "react-router";
import { go as navTo, useStore } from "../lib/Store";

import SubscribeForm from "./SubscribeForm";
export default function Footer() {
  const { store } = useStore();
  return (
    <footer id="footer">
      <div className="foot-brand">
        <img src="/assets/crysmona-logo-cropped.png" alt="Crysmona" />
        <p>
          Natural gemstones. Thoughtfully crafted jewellery. Stories for a more
          meaningful you.
        </p>
        <div>
          {store.settings.instagram_url && (
            <a href={store.settings.instagram_url} aria-label="Instagram">
              <Instagram />
            </a>
          )}
          {store.settings.facebook_url && (
            <a href={store.settings.facebook_url} aria-label="Facebook">
              <Facebook />
            </a>
          )}
        </div>
      </div>
      <div>
        <b>Quick Links</b>
        {store.navigation
          .filter((n: any) => n.group_name === "Footer")
          .map((n: any) => (
            <a
              key={n.id}
              href={n.url}
              onClick={(e) => {
                e.preventDefault();
                navTo(n.url);
              }}
            >
              {n.label}
            </a>
          ))}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navTo("/");
          }}
        >
          Home
        </a>
        <a
          href="/gemstones"
          onClick={(e) => {
            e.preventDefault();
            navTo("/gemstones");
          }}
        >
          Gemstones
        </a>
        <a
          href="/jewellery"
          onClick={(e) => {
            e.preventDefault();
            navTo("/jewellery");
          }}
        >
          Jewellery
        </a>
        <a
          href="/our-craft"
          onClick={(e) => {
            e.preventDefault();
            navTo("/our-craft");
          }}
        >
          Our Craft
        </a>
        <a
          href="/about"
          onClick={(e) => {
            e.preventDefault();
            navTo("/about");
          }}
        >
          About Us
        </a>
        <a
          href="/contact"
          onClick={(e) => {
            e.preventDefault();
            navTo("/contact");
          }}
        >
          Contact
        </a>
      </div>
      <div>
        <b>Customer Care</b>
        <Link to="/faq">FAQs</Link>
        <Link to="/shipping">Shipping & Delivery</Link>
        <Link to="/returns">Returns & Exchanges</Link>
        <Link to="/care">Care Instructions</Link>
        <Link to="/orders">Track Order</Link>
      </div>
      <div>
        <b>Join Our Journey</b>
        <p>
          Subscribe for exclusive offers, new arrivals and gemstone stories.
        </p>
        <SubscribeForm />
      </div>
      <section>
        © 2026 Crysmona. All rights reserved.
        <span>
          <Link to="/privacy">Privacy Policy</Link> &nbsp; | &nbsp;{" "}
          <Link to="/terms">Terms &amp; Conditions</Link>
        </span>
      </section>
    </footer>
  );
}
