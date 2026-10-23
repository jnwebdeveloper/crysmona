import RichText from "../components/RichText";
import { ArrowRight, Gem, HandHeart, Heart } from "lucide-react";
import { go, useStore } from "../lib/Store";
export default function InfoPage({ title }: { title: string }) {
  const { store } = useStore();
  const craft = title === "Our Craft",
    prefix = craft ? "craft" : "about";
  const block = (key: string) =>
    store.content.find((b: any) => b.block_key === key && b.active);
  const hero = block(prefix),
    feature = block(prefix + "-feature"),
    values = block("about-values");
  const cards = store.content.filter(
    (b: any) =>
      b.active &&
      b.block_key.startsWith(craft ? "craft-step-" : "about-value-"),
  );
  const icons = [Gem, HandHeart, Heart];
  if (!hero)
    return (
      <main className="page wishlist-empty">
        <h1>{title}</h1>
        <p>This page is being updated. Please check back soon.</p>
      </main>
    );
  return (
    <main className="page info-page">
      <section className="page-hero">
        <span>{hero.subtitle}</span>
        <h1>{hero.title}</h1>
      </section>
      <section className="info-feature">
        {hero.image_url && <img src={hero.image_url} alt={hero.title} />}
        <article>
          <RichText value={hero.body} />
        </article>
      </section>
      {craft ? (
        <section className="craft-steps">
          {cards.map((b: any) => (
            <article key={b.block_key}>
              <b>{b.subtitle}</b>
              <h2>{b.title}</h2>
              <RichText value={b.body} />
            </article>
          ))}
        </section>
      ) : (
        values && (
          <section className="about-values">
            <span>{values.subtitle}</span>
            <h2>{values.title}</h2>
            <div>
              {cards.map((b: any, i: number) => {
                const Icon = icons[i % icons.length];
                return (
                  <article key={b.block_key}>
                    <Icon />
                    <h3>{b.title}</h3>
                    <RichText value={b.body} />
                  </article>
                );
              })}
            </div>
          </section>
        )
      )}
      {feature && (
        <section className={"info-feature" + (craft ? "" : " reverse")}>
          {feature.image_url && (
            <img src={feature.image_url} alt={feature.title} />
          )}
          <article>
            <span>{feature.subtitle}</span>
            <h2>{feature.title}</h2>
            <RichText value={feature.body} />
            {feature.cta_url && (
              <a href={feature.cta_url}>
                {feature.cta_label}
                <ArrowRight />
              </a>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
