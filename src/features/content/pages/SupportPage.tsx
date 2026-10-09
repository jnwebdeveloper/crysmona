import { useStore } from "../../../app/Store";
export default function SupportPage({ page }: { page: string }) {
  const { store } = useStore();
  const block = store.content.find(
    (b: any) => b.block_key === page && b.active,
  );
  return (
    <main className="page info-page">
      <section className="page-hero">
        <span>CUSTOMER CARE</span>
        <h1>{block?.title || "We’re here to help"}</h1>
      </section>
      <article className="support-copy">
        <p style={{ whiteSpace: "pre-line" }}>
          {block?.body ||
            "Please contact our team for the latest information before placing your order."}
        </p>
        <a href="/contact">Contact Crysmona →</a>
      </article>
    </main>
  );
}
