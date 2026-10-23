import ProductShare from "./ProductShare";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import React, { useEffect, useState } from "react";
import { api } from "../lib/Store";
import { WishButton } from "./WishButton";
import { Product } from "../lib/model";
import type { GalleryItem } from "../../shared/product";
export default function ProductGallery({ product }: { product: Product }) {
  const [images, setImages] = useState<GalleryItem[]>(product.images || []);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Hover zoom: the cursor position becomes the transform origin.
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setImages(product.images || []);
    setSelected(0);
    setError(false);
    if (product.images?.length) return;
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
  }, [product.slug, product.image, product.images, attempt]);
  const gallery: GalleryItem[] = [
    { media_url: product.image, alt_text: product.name },
    ...images,
  ].filter(
    (image, index, list) =>
      image.media_url &&
      list.findIndex((item) => item.media_url === image.media_url) === index,
  );
  const active = selected % Math.max(1, gallery.length);
  const image = gallery[active];
  const isVideo = image?.media_type === "video";
  const move = (step: number) =>
    setSelected((active + step + gallery.length) % gallery.length);
  const trackZoom = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    setZoom(`${x}% ${y}%`);
  };
  useEffect(() => setZoom(null), [active]);
  return (
    <div className="product-gallery">
      <div className="pdp-main-image">
        {isVideo ? (
          // Keyed by URL so switching slides unmounts it, which stops playback.
          <video
            key={image.media_url}
            className="gallery-video"
            src={image.media_url}
            controls
            // Muted videos may autoplay in every browser, including iPhone Safari.
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={image.alt_text || product.name + " video"}
          />
        ) : (
          <div
            className={zoom ? "gallery-zoom zoomed" : "gallery-zoom"}
            onMouseMove={trackZoom}
            onMouseLeave={() => setZoom(null)}
          >
            <img
              src={image?.media_url}
              alt={image?.alt_text || product.name}
              style={zoom ? { transformOrigin: zoom } : undefined}
            />
          </div>
        )}
        <WishButton
          product={product}
          className="pdp-heart"
        />
        <ProductShare name={product.name} slug={product.slug} />
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
            key={item.media_url}
            className={item.media_type === "video" ? "thumb-video" : undefined}
            aria-label={
              (item.media_type === "video"
                ? "Play product video "
                : "View product image ") +
              (index + 1)
            }
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
            {item.media_type === "video" ? (
              <>
                <video
                  src={item.media_url + "#t=0.1"}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
                <Play aria-hidden="true" />
              </>
            ) : (
              <img
                src={item.media_url}
                alt={item.alt_text || product.name}
                loading="lazy"
              />
            )}
          </button>
        ))}
      </div>
      {gallery.length > 1 && (
        <p className="gallery-caption" aria-live="polite">
          {isVideo ? "Video" : "Image"} {active + 1} of {gallery.length}
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
