import assert from "node:assert/strict";
import { test } from "node:test";
import { megaMenuLinks } from "../src/lib/navigation.js";

test("jewellery menu shows admin categories instead of seeded product links", () => {
  const names = ["Pendants", "Rings", "Bracelets", "Dangles", "Studs"];
  const categories = names.map((name, sort_order) => ({
    name,
    slug: name.toLowerCase(),
    type: "jewellery",
    sort_order,
    active: true,
  }));
  const links = megaMenuLinks("Jewellery", categories, [
    { group_name: "Jewellery", label: "Old pendant", url: "/product/old" },
  ]);
  assert.deepEqual(
    links.map((link) => link.label),
    names,
  );
  assert.equal(links[1].url, "/jewellery?category=rings");
});

test("categories are separated by collection, published status, and display order", () => {
  const categories = [
    { name: "Hidden", slug: "hidden", type: "gemstone", active: false },
    { name: "Rings", slug: "rings", type: "jewellery" },
    { name: "Zircon", slug: "zircon", type: "gemstone", sort_order: 2 },
    {
      name: "Natural Gemstones",
      slug: "natural-gemstones",
      type: "gemstone",
      sort_order: 1,
    },
  ];
  assert.deepEqual(megaMenuLinks("Gemstones", categories, []), [
    {
      label: "Natural Gemstones",
      url: "/gemstones?category=natural-gemstones",
    },
    { label: "Zircon", url: "/gemstones?category=zircon" },
  ]);
  assert.equal(categories[0].name, "Hidden");
});

test("Discover retains published custom navigation links", () => {
  const link = {
    label: "Our Craft",
    url: "/our-craft",
    group_name: "Discover",
  };
  assert.deepEqual(
    megaMenuLinks("Discover", [], [link, { ...link, active: false }]),
    [link],
  );
  assert.deepEqual(megaMenuLinks("Jewellery", [], [link]), []);
});
