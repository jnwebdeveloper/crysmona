import { type Product, formatPrice } from "../src/lib/model.js";
export const seedProducts: Product[] = [
  {
    slug: "amethyst-pendant",
    name: "Amethyst Pendant",
    image: "/assets/pendant-amethyst.jpg",
    note: "Calm · Clarity · Balance",
    price: "$3,490",
    stone: "Natural Amethyst",
    description:
      "A serene natural amethyst set in polished sterling silver, designed as an everyday keepsake.",
    kind: "jewellery",
  },
  {
    slug: "green-turquoise-pendant",
    name: "Green Turquoise Pendant",
    image: "/assets/pendant-green.jpg",
    note: "Protection · Strength · Growth",
    price: "$3,790",
    stone: "Natural Turquoise",
    description:
      "A vivid green turquoise pendant with organic matrix patterns, framed in handcrafted sterling silver.",
    kind: "jewellery",
  },
  {
    slug: "black-onyx-pendant",
    name: "Black Onyx Pendant",
    image: "/assets/pendant-black.jpg",
    note: "Confidence · Focus · Stability",
    price: "$3,650",
    stone: "Natural Onyx",
    description: "Deep black natural stone in a refined silver setting.",
    kind: "jewellery",
  },
  {
    slug: "purple-copper-turquoise-pendant",
    name: "Purple Copper Turquoise Pendant",
    image: "/assets/signature-turquoise.jpeg",
    note: "Individuality · Colour · Artistry",
    price: "$3,990",
    stone: "Purple Copper Turquoise",
    description: "A blend of vibrant colour and natural artistry.",
    kind: "jewellery",
  },
  ...[
    ["rainbow-moonstone", "Rainbow Moonstone", "gem-moonstone", 1200],
    ["turquoise", "Turquoise", "gem-turquoise", 1500],
    [
      "golden-sheen-obsidian",
      "Golden Sheen Obsidian",
      "gem-golden-sheen",
      1800,
    ],
    ["charoite", "Charoite", "gem-charoite", 2100],
    ["larimar", "Larimar", "gem-larimar", 2400],
  ].map(([slug, name, image, price]): Product => ({
    slug: String(slug),
    name: String(name),
    image: `/assets/${image}.jpeg`,
    price: formatPrice(Number(price) * 100),
    note: "Selected gemstone cabochons",
    stone: String(name),
    description:
      slug === "rainbow-moonstone"
        ? "A collection of 20 natural Rainbow Moonstone cabochons, selected for their multi-colour fire play and elegant marquise shape."
        : "A distinctive collection of gemstone cabochons. Each stone has its own colour and character.",
    kind: "gemstone",
    specifications:
      slug === "rainbow-moonstone"
        ? {
            "Stone Name": "Rainbow Moonstone",
            "Gemstone Name": "Rainbow Moonstone",
            "Gemstone Color": "Multi Color",
            "Gemstone Shape": "Marquise",
            "Gemstone Type": "Cabochon",
            "Gemstone Weight": "Approx 245 Ct.",
            "Gemstone Size": "20X9 29X11 mm",
            "Gemstone Length": "20 mm",
            "Gemstone Width": "9 29 mm",
            "Gemstone Depth": "11 mm",
            "Gemstone Transparency": "Fire Play",
            "Gemstone Creation": "Natural",
            "Materials Sourced From": "Africa",
            "Number Of Pieces": "20",
          }
        : { "Gemstone Name": String(name), "Gemstone Type": "Cabochon" },
  })),
];
