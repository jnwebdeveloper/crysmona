type Category = {
  name: string;
  slug: string;
  type: string;
  active?: boolean;
  sort_order?: number;
};
type NavigationLink = {
  label: string;
  url: string;
  group_name: string;
  active?: boolean;
  sort_order?: number;
};

// Collection menus follow published categories; editorial menus use custom links.
export function megaMenuLinks(
  group: string,
  categories: Category[],
  navigation: NavigationLink[],
) {
  const type =
    group === "Gemstones"
      ? "gemstone"
      : group === "Jewellery"
        ? "jewellery"
        : null;
  if (type) {
    const path = type === "gemstone" ? "/gemstones" : "/jewellery";
    return categories
      .filter((category) => category.active !== false && category.type === type)
      .sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name),
      )
      .map((category) => ({
        label: category.name,
        url: `${path}?category=${encodeURIComponent(category.slug)}`,
      }));
  }
  return navigation
    .filter(
      (link) =>
        link.active !== false &&
        link.group_name === group &&
        link.url !== "/shipping",
    )
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.label.localeCompare(b.label),
    );
}
