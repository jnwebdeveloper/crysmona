import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { StoreProvider, useStore } from "../src/lib/Store";
import RequireStore from "../src/components/RequireStore";
import Footer from "../src/components/Footer";

const site = {
  content: [],
  categories: [],
  settings: {},
  reviews: [],
  navigation: [
    { group_name: "Footer", url: "/orders?status=all", label: "My orders" },
    {
      group_name: "Footer",
      url: "https://crysmona.vercel.app/orders",
      label: "Tracking",
    },
    { group_name: "Footer", url: "/tracking", label: "Track Order" },
    { group_name: "Footer", url: "/contact", label: "Contact" },
  ],
};
function Status() {
  const { loading, catalog } = useStore();
  return (
    <p>
      {loading ? "waiting" : "ready"}:{catalog.length}
    </p>
  );
}
function render(value: string | null, child: React.ReactNode = <Status />) {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: () => value },
  });
  try {
    return renderToStaticMarkup(<StoreProvider>{child}</StoreProvider>);
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
}
const snapshot = (savedAt = Date.now()) =>
  JSON.stringify({ savedAt, products: [{ slug: "moonstone" }], site });

test("refresh renders a recent catalog before any network response", () => {
  assert.match(render(snapshot()), /ready:1/);
});
test("first visit, expired and corrupt snapshots use network loading", () => {
  for (const value of [
    null,
    snapshot(Date.now() - 16 * 60 * 1000),
    "invalid",
    JSON.stringify({ savedAt: Date.now(), products: [] }),
  ]) {
    assert.match(render(value), /waiting:0/);
  }
});
test("cached content bypasses the store loading placeholder", () => {
  assert.doesNotMatch(render(snapshot(), <RequireStore />), /Loading store/);
  assert.match(render(null, <RequireStore />), /Loading store/);
});
test("footer hides tracking links including admin-supplied absolute URLs", () => {
  const html = render(
    snapshot(),
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
  assert.doesNotMatch(html, /Track Order|My orders|Tracking|href="[^"]*orders/);
  assert.match(html, /href="\/contact"/);
});
