import { Facebook, Instagram } from "lucide-react";

import { go as navTo, useStore } from "../../app/Store";

import SubscribeForm from "../../features/contact/components/SubscribeForm";
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
        <a href="/faq">FAQs</a>
        <a href="/shipping">Shipping & Delivery</a>
        <a href="/returns">Returns & Exchanges</a>
        <a href="/care">Care Instructions</a>
        <a href="/orders">Track Order</a>
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
          <a href="/privacy">Privacy Policy</a> &nbsp; | &nbsp;{" "}
          <a href="/terms">Terms &amp; Conditions</a>
        </span>
      </section>
    </footer>
  );
}
