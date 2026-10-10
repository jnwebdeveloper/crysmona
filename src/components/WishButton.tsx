import { Heart } from "lucide-react";
import React from "react";
import { useStore } from "../lib/Store";
import { Product } from "../lib/model";
export function WishButton({
  product,
  className = "heart",
}: {
  product: Product;
  className?: string;
}) {
  const { wishlist, toggle } = useStore();
  const saved = wishlist.includes(product.slug);
  return (
    <button
      className={className + (saved ? " is-saved" : "")}
      aria-label={
        (saved ? "Remove from" : "Add to") + " wishlist: " + product.name
      }
      aria-pressed={saved}
      onClick={(e) => {
        e.stopPropagation();
        toggle(product.slug);
      }}
    >
      <Heart fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
