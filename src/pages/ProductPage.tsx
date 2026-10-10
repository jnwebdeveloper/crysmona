import React from "react";
import { useNavigate, useParams } from "react-router";
import { useStore } from "../lib/Store";
import GemstoneDetail from "./GemstoneDetail";
import ProductDetail from "./ProductDetail";

// /product/:slug — gemstones and jewellery share the URL but use different layouts.
export default function ProductPage() {
  const { slug } = useParams();
  const { catalog } = useStore();
  const navigate = useNavigate();
  const product = catalog.find((p) => p.slug === slug);
  if (!product)
    return (
      <main className="page">
        <section className="wishlist-empty">
          <h1>This piece is unavailable.</h1>
          <button onClick={() => navigate("/gemstones")}>EXPLORE GEMSTONES</button>
        </section>
      </main>
    );
  return product.kind === "gemstone" ? (
    <GemstoneDetail key={product.slug} product={product} />
  ) : (
    <ProductDetail key={product.slug} product={product} />
  );
}
