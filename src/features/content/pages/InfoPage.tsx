import { ArrowRight, Gem, HandHeart, Heart } from "lucide-react";

import { go as navTo, useStore } from "../../../app/Store";

export default function InfoPage({ title }: { title: string }) {
  const { store } = useStore();
  const craft = title === "Our Craft";
  const block = store.content.find(
    (b: any) => b.block_key === (craft ? "craft" : "about"),
  );
  if (!block || !block.active)
    return (
      <main className="page wishlist-empty">
        <h1>{title}</h1>
        <p>This page is being updated. Please check back soon.</p>
      </main>
    );
  return (
    <main className="page info-page">
      <section
        className={"editorial-hero " + (craft ? "craft-hero" : "about-hero")}
      >
        <div>
          <span>{craft ? "THE ART OF MAKING" : "OUR STORY"}</span>
          <h1>
            {block?.title ||
              (craft ? "From Stone to Story" : "Made to Mean More")}
          </h1>
          <p>
            {block?.body ||
              (craft
                ? "Every Crysmona piece begins with the gemstone — its colour, inclusions, shape and natural character guide every design decision."
                : "Crysmona celebrates jewellery that feels personal: natural gemstones, thoughtful proportions and pieces designed to become part of your story.")}
          </p>
        </div>
        <img
          src={
            block?.image_url ||
            (craft ? "/assets/labradorite.jpg" : "/assets/hero-model-clean.jpg")
          }
          alt={title}
        />
      </section>
      {craft ? (
        <>
          <section className="craft-steps">
            <article>
              <b>01</b>
              <h2>Select</h2>
              <p>
                We handpick natural stones for colour, pattern and individual
                character.
              </p>
            </article>
            <article>
              <b>02</b>
              <h2>Shape</h2>
              <p>
                Each setting is developed around the stone rather than forcing
                uniformity.
              </p>
            </article>
            <article>
              <b>03</b>
              <h2>Craft</h2>
              <p>
                Skilled finishing brings together sterling silver, proportion
                and lasting comfort.
              </p>
            </article>
          </section>
          <section className="info-feature">
            <img src="/assets/pendant-purple.jpg" />
            <article>
              <span>DETAIL MATTERS</span>
              <h2>Designed around what nature made.</h2>
              <p>
                Natural variation is not a flaw to hide. It is the reason no two
                Crysmona pieces feel exactly alike.
              </p>
              <button onClick={() => navTo("/jewellery")}>
                EXPLORE JEWELLERY <ArrowRight />
              </button>
            </article>
          </section>
        </>
      ) : (
        <>
          <section className="about-values">
            <span>WHAT WE BELIEVE</span>
            <h2>Natural character. Considered design.</h2>
            <div>
              <article>
                <Gem />
                <h3>Authentic Stones</h3>
                <p>
                  We celebrate the colour, texture and individuality found in
                  natural gemstones.
                </p>
              </article>
              <article>
                <HandHeart />
                <h3>Thoughtful Craft</h3>
                <p>
                  Settings are designed to complement each stone and feel
                  effortless to wear.
                </p>
              </article>
              <article>
                <Heart />
                <h3>Personal Meaning</h3>
                <p>
                  Jewellery should hold a story, a memory or simply a feeling
                  that belongs to you.
                </p>
              </article>
            </div>
          </section>
          <section className="info-feature reverse">
            <img src="/assets/pendant-amethyst.jpg" />
            <article>
              <span>THE CRYSMONA POINT OF VIEW</span>
              <h2>Jewellery that starts with the gem.</h2>
              <p>
                Instead of treating gemstones as decoration, we make them the
                centre of the design — allowing their natural personality to
                lead.
              </p>
              <button onClick={() => navTo("/gemstones")}>
                DISCOVER GEMSTONES <ArrowRight />
              </button>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
