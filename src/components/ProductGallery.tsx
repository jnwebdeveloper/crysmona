import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/Store";
import { WishButton } from "./WishButton";
import { Product } from "../lib/model";
type ProductImage = { image_url: string; alt_text: string };
export default function ProductGallery({
  product,
  gemstone = false,
}: {
  product: Product;
  gemstone?: boolean;
}) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setImages([]);
    setSelected(0);
    setError(false);
    api("/products/" + product.slug)
      .then((data) => {
        if (current) setImages(data.images || []);
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [product.slug, product.image, attempt]);
  const gallery = [
    { image_url: product.image, alt_text: product.name },
    ...images,
  ].filter(
    (image, index, list) =>
      image.image_url &&
      list.findIndex((item) => item.image_url === image.image_url) === index,
  );
  const active = selected % gallery.length;
  const image = gallery[active];
  const move = (step: number) =>
    setSelected((active + step + gallery.length) % gallery.length);
  return (
    <div className="product-gallery">
      <div className={gemstone ? "gem-detail-image" : "pdp-main-image"}>
        <img src={image?.image_url} alt={image?.alt_text || product.name} />
        <WishButton
          product={product}
          className={gemstone ? "heart" : "pdp-heart"}
        />
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              className="gallery-arrow gallery-previous"
              aria-label="Previous product image"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="gallery-arrow gallery-next"
              aria-label="Next product image"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      <div
        className="product-gallery-thumbnails"
        role="group"
        aria-label="Product image thumbnails"
      >
        {gallery.map((item, index) => (
          <button
            type="button"
            key={item.image_url}
            aria-label={"View product image " + (index + 1)}
            aria-pressed={active === index}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                move(step);
                const buttons =
                  event.currentTarget.parentElement?.querySelectorAll("button");
                buttons?.[
                  (active + step + gallery.length) % gallery.length
                ]?.focus();
              }
            }}
          >
            <img
              src={item.image_url}
              alt={item.alt_text || product.name}
              loading="lazy"
            />
          </button>
        ))}
      </div>
      {gallery.length > 1 && (
        <p className="gallery-caption" aria-live="polite">
          Image {active + 1} of {gallery.length}
        </p>
      )}
      {error && (
        <p className="gallery-caption">
          Additional images couldn’t load.{" "}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
