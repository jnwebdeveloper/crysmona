import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { useEffect, useState } from "react";
import { go } from "../lib/Store";
type Slide = {
  id: number;
  title: string;
  subtitle: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  block_key: string;
};
export default function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hover, setHover] = useState(false),
    [focused, setFocused] = useState(false),
    [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || hover || focused || reduced || slides.length < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % slides.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [paused, hover, focused, reduced, slides.length]);
  if (!slides.length) return null;
  const active = index % slides.length,
    slide = slides[active];
  const change = (step: number) =>
    setIndex((active + step + slides.length) % slides.length);
  return (
    <section
      className="hero hero-carousel"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") change(-1);
        if (e.key === "ArrowRight") change(1);
      }}
    >
      <div
        key={slide.id}
        className="hero-slide"
        role="group"
        aria-roledescription="slide"
        aria-label={`${active + 1} of ${slides.length}`}
      >
        <div className="hero-copy">
          <span>{slide.subtitle}</span>
          <h1 style={{ whiteSpace: "pre-line" }}>{slide.title}</h1>
          <p>{slide.body}</p>
          {slide.cta_url && (
            <button onClick={() => go(slide.cta_url)}>
              {slide.cta_label || "EXPLORE"} <ArrowRight />
            </button>
          )}
        </div>
        <div className="hero-image">
          <img
            src={slide.image_url}
            alt={slide.title.replace(/\n/g, " ")}
            loading="eager"
          />
        </div>
        <em>
          More
          <br />
          Than
          <br />
          Jewellery
        </em>
      </div>
      {slides.length > 1 && (
        <div className="carousel-controls">
          <button aria-label="Previous slide" onClick={() => change(-1)}>
            <ChevronLeft />
          </button>
          <div className="carousel-dots">
            {slides.map((s, i) => (
              <button
                key={s.id}
                aria-label={`Show slide ${i + 1}`}
                aria-current={active === i ? "true" : undefined}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button aria-label="Next slide" onClick={() => change(1)}>
            <ChevronRight />
          </button>
          <button
            aria-label={paused ? "Resume slideshow" : "Pause slideshow"}
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play /> : <Pause />}
          </button>
        </div>
      )}
    </section>
  );
}
