export const pageContent = [
  {
    block_key: "about",
    title: "Made to Mean More",
    subtitle: "OUR STORY",
    body: "Crysmona celebrates jewellery that feels personal: natural gemstones, thoughtful proportions and pieces designed to become part of your story.",
    image_url: "/assets/hero-model-clean.jpg",
  },
  {
    block_key: "about-values",
    title: "Natural character. Considered design.",
    subtitle: "WHAT WE BELIEVE",
  },
  {
    block_key: "about-value-1",
    title: "Authentic Stones",
    body: "We celebrate the colour, texture and individuality found in natural gemstones.",
  },
  {
    block_key: "about-value-2",
    title: "Thoughtful Craft",
    body: "Settings are designed to complement each stone and feel effortless to wear.",
  },
  {
    block_key: "about-value-3",
    title: "Personal Meaning",
    body: "Jewellery should hold a story, a memory or simply a feeling that belongs to you.",
  },
  {
    block_key: "about-feature",
    title: "Jewellery that starts with the gem.",
    subtitle: "THE CRYSMONA POINT OF VIEW",
    body: "Instead of treating gemstones as decoration, we make them the centre of the design — allowing their natural personality to lead.",
    image_url: "/assets/pendant-amethyst.jpg",
    cta_label: "DISCOVER GEMSTONES",
    cta_url: "/gemstones",
  },
  {
    block_key: "craft",
    title: "From Stone to Story",
    subtitle: "THE ART OF MAKING",
    body: "Every Crysmona piece begins with the gemstone — its colour, inclusions, shape and natural character guide every design decision.",
    image_url: "/assets/labradorite.jpg",
  },
  {
    block_key: "craft-step-1",
    title: "Select",
    subtitle: "01",
    body: "We handpick natural stones for colour, pattern and individual character.",
  },
  {
    block_key: "craft-step-2",
    title: "Shape",
    subtitle: "02",
    body: "Each setting is developed around the stone rather than forcing uniformity.",
  },
  {
    block_key: "craft-step-3",
    title: "Craft",
    subtitle: "03",
    body: "Skilled finishing brings together sterling silver, proportion and lasting comfort.",
  },
  {
    block_key: "craft-feature",
    title: "Designed around what nature made.",
    subtitle: "DETAIL MATTERS",
    body: "Natural variation is not a flaw to hide. It is the reason no two Crysmona pieces feel exactly alike.",
    image_url: "/assets/pendant-purple.jpg",
    cta_label: "EXPLORE JEWELLERY",
    cta_url: "/jewellery",
  },
  {
    block_key: "contact",
    title: "Contact",
    subtitle: "WE'RE HERE TO HELP",
    body: "Questions about a stone, an order or a piece of jewellery? Send us a note.",
    cta_label: "SEND MESSAGE",
  },
];
export const isDiscoverBlock = (key: string) =>
  pageContent.some((block) => block.block_key === key);
