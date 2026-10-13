import { isDiscoverBlock, pageContent } from "../../shared/pageContent";
import { listRecords, moveRecord } from "../../shared/adminLists";
import {
  ArrowLeft,
  LayoutDashboard,
  Package,
  Tags,
  ShoppingBag,
  Users,
  PanelsTopLeft,
  BadgePercent,
  Settings,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Loader from "../components/Loader";
import { Field, resources } from "../../shared/adminSchema";
import { adminValidation } from "../../shared/adminValidation";
import { api, go, useStore } from "../lib/Store";
const label = (r: any) =>
  r.name ||
  r.label ||
  r.order_number ||
  r.product_name ||
  r.email ||
  r.phone ||
  r.title ||
  r.block_key ||
  r.path ||
  r.setting_key ||
  r.key ||
  r.code ||
  r.author ||
  r.id;
// Admin sections: [URL segment, admin resource, menu label, icon]. The section lives in
// the URL (/admin/orders, /admin/customers, …) so a refresh or shared link reopens it.
const NAV_GROUPS: { title: string; items: [string, string, string, any][] }[] =
  [
    {
      title: "STORE",
      items: [
        ["products", "products", "Products", Package],
        ["categories", "categories", "Categories", Tags],
        ["storefront", "content_blocks", "Storefront", PanelsTopLeft],
        ["navigation", "navigation", "Header menu & submenus", PanelsTopLeft],
        ["discover", "discover", "Discover pages", PanelsTopLeft],
      ],
    },
    {
      title: "COMMERCE",
      items: [
        ["orders", "orders", "Orders", ShoppingBag],
        ["customers", "users", "Customers", Users],
        ["discounts", "coupons", "Discounts", BadgePercent],
      ],
    },
    {
      title: "MARKETING",
      items: [
        ["seo", "seo_pages", "SEO", Search],
        ["tracking", "site_settings", "Pixel & tracking", Settings],
      ],
    },
    {
      title: "SETTINGS",
      items: [["settings", "settings", "Store settings", Settings]],
    },
  ];
const SECTION_TO_TAB = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map(([section, tab]) => [section, tab])),
);
const DEFAULT_SECTION = "products";

export default function AdminPage() {
  const { section = DEFAULT_SECTION } = useParams();
  const navigate = useNavigate();
  const tab = SECTION_TO_TAB[section] || SECTION_TO_TAB[DEFAULT_SECTION];
  const [statusFilter, setStatusFilter] = useState(""),
    [categoryFilter, setCategoryFilter] = useState(""),
    [categories, setCategories] = useState<any[]>([]),
    [reordering, setReordering] = useState(false);
  const reorderLock = useRef(false);
  const currentTab = useRef(tab);
  currentTab.current = tab;
  const collectionList = tab === "products" || tab === "categories";
  const [filterField, setFilterField] = useState(""),
    [filterValue, setFilterValue] = useState(""),
    [sortField, setSortField] = useState("list_priority"),
    [sortDirection, setSortDirection] = useState("asc"),
    [dragId, setDragId] = useState<number | null>(null);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [connected, setConnected] = useState(false),
    [rows, setRows] = useState<any[]>([]),
    [stats, setStats] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [removing, setRemoving] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [lookups, setLookups] = useState<Record<string, any[]>>({}),
    [orderDetail, setOrderDetail] = useState<any>(null),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [maxImageBytes, setMaxImageBytes] = useState(8 * 1024 * 1024);
  const { refresh } = useStore();
  const resource = tab === "discover" ? "content_blocks" : tab;
  const definition =
    tab === "discover"
      ? { ...resources.content_blocks, label: "Discover pages" }
      : resources[resource];
  const request = async (path: string, options: RequestInit = {}) => {
    try {
      return await api("/admin/" + path, options);
    } catch (error: any) {
      if (error.status === 401) setConnected(false);
      throw error;
    }
  };
  useEffect(() => {
    api("/admin/auth/me")
      .then(() => load())
      .catch(() => {});
  }, []);
  // Unknown section in the URL (e.g. /admin/xyz): replace it with the default.
  useEffect(() => {
    if (!SECTION_TO_TAB[section])
      navigate("/admin/" + DEFAULT_SECTION, { replace: true });
  }, [section]);
  const login = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      await load();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [data, summary, categoryRows] = await Promise.all([
        request(resource),
        request("dashboard"),
        tab === "products" ? request("categories") : Promise.resolve([]),
      ]);
      setRows(
        tab === "discover"
          ? data.filter((r: any) => isDiscoverBlock(r.block_key))
          : data,
      );
      setCategories(categoryRows);
      setStats(summary);
      setConnected(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    // The deployed API accepts smaller uploads (Vercel caps request bodies).
    if (connected)
      request("media/config")
        .then((config) => setMaxImageBytes(config.maxBytes))
        .catch(() => {});
  }, [connected]);
  useEffect(() => {
    if (connected) {
      setRows([]);
      setQuery("");
      setStatusFilter("");
      setCategoryFilter("");
      setFilterField("");
      setFilterValue("");
      setSortField("list_priority");
      setSortDirection("asc");
      setNotice("");
      load();
    }
  }, [tab]);
  const open = async (record?: any) => {
    setError("");
    setFieldErrors({});
    const defaults: any = {};
    for (const f of definition.fields)
      defaults[f.key] =
        f.type === "boolean"
          ? true
          : f.type === "number"
            ? 0
            : f.type === "specs"
              ? {}
              : f.options?.[0] || "";
    if (tab === "orders") {
      defaults.status = "draft";
      defaults.payment_status = "pending";
      defaults.order_number = "MANUAL-" + Date.now();
    }
    if (tab === "products") {
      defaults.stock_qty = 0;
      defaults.featured = false;
    }
    if (tab === "discover") defaults.block_key = "about";
    setEditing(
      record ? { ...record, images: undefined } : { ...defaults, images: [] },
    );
    try {
      if (tab === "products" && record) {
        const gallery = await request("products/" + record.id + "/images");
        setEditing((current: any) =>
          current?.id === record.id ? { ...current, images: gallery } : current,
        );
      }
      const refs: Record<string, string> = {
        product_id: "products",
        category_id: "categories",
        user_id: "users",
        order_id: "orders",
      };
      const data: Record<string, any[]> = {};
      for (const f of definition.fields)
        if (refs[f.key]) data[f.key] = await request(refs[f.key]);
      setLookups(data);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const validation = adminValidation(resource, editing);
    setFieldErrors(validation);
    if (Object.keys(validation).length) {
      setError("Please correct the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const body: any = {};
      for (const f of definition.fields)
        body[f.key] = editing[f.key] ?? (f.type === "specs" ? {} : null);
      if (tab === "products") body.images = editing.images;
      await request(resource + (editing.id ? "/" + editing.id : ""), {
        method: editing.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setEditing(null);
      await load();
      await refresh();
      setNotice("Changes saved. Your storefront is up to date.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await request(resource + "/" + removing.id, { method: "DELETE" });
      setRemoving(null);
      await load();
      await refresh();
      setNotice("Record deleted.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const field = (f: Field) => {
    const value = editing[f.key];
    const change = (v: any) =>
      setEditing((current: any) => ({ ...current, [f.key]: v }));
    if (tab === "discover" && f.key === "block_key")
      return (
        <select value={value} onChange={(e) => change(e.target.value)}>
          {pageContent.map((block) => (
            <option key={block.block_key} value={block.block_key}>
              {block.block_key}: {block.title}
            </option>
          ))}
        </select>
      );
    if (tab === "products" && f.key === "image_url")
      return (
        <ProductImages
          editing={editing}
          setEditing={setEditing}
          request={request}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          maxBytes={maxImageBytes}
        />
      );
    if (f.key === "image_url")
      return (
        <div className="image-upload">
          <input
            required={f.required}
            value={value || ""}
            placeholder="https://images.example.com/…"
            onChange={(e) => change(e.target.value)}
          />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            aria-label="Upload image"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > maxImageBytes) {
                setError(
                  `Choose an image smaller than ${+(maxImageBytes / 1048576).toFixed(1)} MB.`,
                );
                return;
              }
              setBusy(true);
              setError("");
              try {
                const result = await request("media/upload", {
                  method: "POST",
                  headers: { "Content-Type": file.type },
                  body: file,
                });
                change(result.url);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <small>
            JPEG, PNG or WebP · up to {+(maxImageBytes / 1048576).toFixed(1)} MB
            · saved to cloud storage
          </small>
          {value && (
            <img
              className="admin-image-preview"
              src={value}
              alt="Image preview"
            />
          )}
        </div>
      );
    if (f.type === "boolean")
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => change(e.target.checked)}
        />
      );
    if (f.type === "specs")
      return <SpecEditor value={value || {}} onChange={change} />;
    if (lookups[f.key])
      return (
        <select
          required={f.required}
          value={value || ""}
          onChange={(e) => change(e.target.value || null)}
        >
          <option value="">Select a record</option>
          {lookups[f.key].map((r) => (
            <option key={r.id} value={r.id}>
              {label(r)}
            </option>
          ))}
        </select>
      );
    if (f.options)
      return (
        <select
          required={f.required}
          value={value || ""}
          onChange={(e) => change(e.target.value)}
        >
          {f.options.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      );
    if (f.type === "textarea")
      return (
        <textarea
          rows={4}
          required={f.required}
          value={value || ""}
          onChange={(e) => change(e.target.value)}
        />
      );
    return (
      <>
        <input
          required={f.required}
          type={f.type === "number" ? "number" : "text"}
          min={f.type === "number" ? 0 : undefined}
          step={f.type === "number" ? 1 : undefined}
          value={value ?? ""}
          onChange={(e) =>
            change(
              f.type === "number" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        />
        {f.key === "image_url" && value && (
          <img
            className="admin-image-preview"
            src={value}
            alt="Image preview"
          />
        )}
      </>
    );
  };
  const preparedRows = rows.map((row) => ({
    ...row,
    category_name:
      categories.find(
        (category) => Number(category.id) === Number(row.category_id),
      )?.name || "Uncategorized",
  }));
  const filteredRows = collectionList
    ? preparedRows.filter(
        (row) =>
          (!statusFilter || String(row.active !== false) === statusFilter) &&
          (!categoryFilter ||
            (tab === "products"
              ? String(row.category_id ?? "none")
              : row.type) === categoryFilter),
      )
    : rows;
  const toggleSort = (key: string) => {
    setSortDirection(
      sortField === key && sortDirection === "asc" ? "desc" : "asc",
    );
    setSortField(key);
  };
  const sortHeading = (key: string, title: string) => (
    <button
      type="button"
      className="admin-column-sort"
      onClick={() => toggleSort(key)}
    >
      {title} {sortField === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
    </button>
  );
  const ariaSort = (key: string): "ascending" | "descending" | "none" =>
    sortField === key
      ? sortDirection === "asc"
        ? "ascending"
        : "descending"
      : "none";
  const visibleRows = listRecords(
    filteredRows,
    query,
    filterField,
    filterValue,
    sortField,
    sortDirection,
  );
  const filterFields = definition.fields.filter(
    (f) => f.type !== "specs" && f.type !== "textarea",
  );
  const canReorder =
    !busy &&
    !reordering &&
    !statusFilter &&
    !categoryFilter &&
    !query &&
    !filterValue &&
    sortField === "list_priority" &&
    sortDirection === "asc" &&
    tab !== "discover";
  const reorder = async (from: number, to: number) => {
    if (!canReorder || reorderLock.current || from === to) return;
    const previous = rows,
      sourceTab = tab;
    const next = moveRecord(visibleRows, from, to);
    reorderLock.current = true;
    setReordering(true);
    setRows(next.map((row, list_priority) => ({ ...row, list_priority })));
    setError("");
    try {
      await request(resource + "/reorder", {
        method: "PUT",
        body: JSON.stringify({ ids: next.map((row) => row.id) }),
      });
      if (currentTab.current === sourceTab)
        setNotice("Listing priority saved.");
    } catch (error: any) {
      if (currentTab.current === sourceTab) {
        setRows(previous);
        setError(error.message);
      }
    } finally {
      reorderLock.current = false;
      setReordering(false);
      setDragId(null);
    }
  };
  if (!connected)
    return (
      <main className="admin-gate">
        {busy && <Loader overlay label="Signing in…" />}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <ShieldCheck />
          <span>CRYSMONA STUDIO</span>
          <h1>
            A little care.
            <br />
            Behind every detail.
          </h1>
          <p>Manage your collections, customers and storefront.</p>
          <label>
            Admin email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "CONNECTING…" : "OPEN ADMIN PANEL"}
          </button>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              go("/");
            }}
          >
            Return to storefront
          </a>
        </form>
      </main>
    );
  return (
    <main className="admin-page studio">
      {busy && <Loader overlay label="Working…" />}
      <aside className="admin-side">
        <img src="/assets/crysmona-logo-cropped.png" alt="Crysmona" />
        <b>STOREFRONT STUDIO</b>
        <nav className="admin-nav" aria-label="Admin navigation">
          {NAV_GROUPS.map((group) => (
            <section className="admin-nav-group" key={group.title}>
              <span>{group.title}</span>
              {group.items.map(([id, itemTab, name, Icon]) => (
                <button
                  key={id}
                  className={tab === itemTab ? "active" : ""}
                  aria-current={tab === itemTab ? "page" : undefined}
                  onClick={() => {
                    setEditing(null);
                    navigate("/admin/" + id);
                  }}
                >
                  <Icon /> <em>{name}</em>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="admin-side-footer">
          <button onClick={() => go("/")}>
            <ArrowLeft /> <em>View storefront</em>
          </button>
          <button
            onClick={async () => {
              try {
                await request("auth/logout", { method: "POST" });
                setConnected(false);
                setPassword("");
                setEditing(null);
                setRemoving(null);
              } catch (error: any) {
                setError(error.message);
              }
            }}
          >
            <ShieldCheck /> <em>Sign out</em>
          </button>
        </div>
      </aside>
      <section className="admin-main">
        <header>
          <div>
            <span>CRYSMONA / STORE MANAGEMENT</span>
            <h1>{definition.label}</h1>
          </div>
          <button className="studio-refresh" disabled={busy} onClick={load}>
            <RefreshCw /> Refresh
          </button>
        </header>
        {stats && (
          <div className="admin-stats">
            {[
              ["Products", stats.products],
              ["Orders", stats.orders],
              ["Customers", stats.users],
              ["New enquiries", stats.enquiries],
            ].map(([name, value]) => (
              <article key={name}>
                <span>{name}</span>
                <b>{value}</b>
              </article>
            ))}
          </div>
        )}
        {["navigation", "categories"].includes(tab) && (
          <p className="admin-note">
            Gemstones and Jewellery mega menus automatically show published
            categories in display order. Manage these links in Categories.
            Discover and Footer links are managed in Header menu &amp; submenus.
          </p>
        )}
        {tab === "settings" && (
          <p className="admin-note">
            PayPal: {stats?.paypalConfigured ? "configured" : "not configured"}.
            Merchant credentials are configured securely on the server.
          </p>
        )}
        {notice && (
          <p className="admin-success" role="status">
            {notice}
          </p>
        )}
        {error && !editing && !removing && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {collectionList ? (
          <div className="admin-list-controls">
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="true">Active</option>
                <option value="false">Hidden</option>
              </select>
            </label>
            <label>
              {tab === "products" ? "Category" : "Collection"}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">
                  {tab === "products" ? "All categories" : "All collections"}
                </option>
                {tab === "products" ? (
                  <>
                    <option value="none">Uncategorized</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </>
                ) : (
                  <>
                    <option value="gemstone">Gemstones</option>
                    <option value="jewellery">Jewellery</option>
                  </>
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setSortField("list_priority");
                setSortDirection("asc");
                setStatusFilter("");
                setCategoryFilter("");
                setQuery("");
              }}
            >
              Listing priority / reorder
            </button>
            {reordering && <span role="status">Saving order…</span>}
          </div>
        ) : (
          <>
            <div className="admin-list-controls">
              <label>
                Filter by
                <select
                  value={filterField}
                  onChange={(e) => {
                    setFilterField(e.target.value);
                    setFilterValue("");
                  }}
                >
                  <option value="">All records</option>
                  {filterFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {filterField && (
                <label>
                  Value
                  <select
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  >
                    <option value="">All values</option>
                    {Array.from(
                      new Set(
                        rows.map((row) => String(row[filterField] ?? "")),
                      ),
                    )
                      .filter(Boolean)
                      .sort()
                      .map((value) => (
                        <option key={value} value={value}>
                          {value === "true"
                            ? "Yes"
                            : value === "false"
                              ? "No"
                              : value}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Sort by
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                >
                  <option value="list_priority">Listing priority</option>
                  <option value="id">Date added</option>
                  {filterFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Direction
                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value)}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>
            </div>
          </>
        )}
        <p className="admin-note">
          Drag a row or use the arrow buttons to save listing priority. Clear
          filters and search, and sort by listing priority ascending first.
          Discover section order can be changed in Storefront.
        </p>
        <div className="studio-toolbar">
          <label>
            <Search />
            <input
              placeholder="Search records…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {!["orders", "users"].includes(tab) && (
            <button className="admin-new" onClick={() => open()}>
              <Plus />{" "}
              {tab === "products"
                ? "Add product"
                : tab === "categories"
                  ? "Add category"
                  : tab === "coupons"
                    ? "Add discount"
                    : tab === "content_blocks"
                      ? "Add content"
                      : tab === "seo_pages"
                        ? "Add SEO page"
                        : tab === "site_settings"
                          ? "Add tracking setting"
                          : tab === "navigation"
                            ? "Add menu link"
                            : tab === "discover"
                              ? "Add Discover page"
                              : "Add setting"}
            </button>
          )}
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th aria-sort={ariaSort("name")}>
                  {collectionList
                    ? sortHeading(
                        "name",
                        tab === "products" ? "Product" : "Category",
                      )
                    : "Record"}
                </th>
                {tab === "products" && (
                  <th aria-sort={ariaSort("category_name")}>
                    {sortHeading("category_name", "Category")}
                  </th>
                )}
                {tab === "categories" && (
                  <th aria-sort={ariaSort("type")}>
                    {sortHeading("type", "Collection")}
                  </th>
                )}
                <th>Details</th>
                <th aria-sort={ariaSort("active")}>
                  {collectionList ? sortHeading("active", "Status") : "Status"}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, index) => (
                <tr
                  key={r.id}
                  draggable={canReorder}
                  onDragStart={(e) => {
                    setDragId(r.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(r.id));
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (canReorder) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId !== null) void reorder(dragId, r.id);
                  }}
                >
                  <td>
                    <div className="admin-record">
                      {r.image_url && <img src={r.image_url} alt="" />}
                      <div>
                        <b>{label(r)}</b>
                        {r.slug && <small>{r.slug}</small>}
                      </div>
                    </div>
                  </td>
                  {tab === "products" && <td>{r.category_name}</td>}
                  {tab === "categories" && (
                    <td>{r.type === "gemstone" ? "Gemstones" : "Jewellery"}</td>
                  )}
                  <td>
                    {tab === "site_settings" && r.setting_key === "meta_pixel_id" ? (r.setting_value || "Pixel ID not configured") : r.price_cents !== undefined
                      ? "$" +
                        (r.price_cents / 100).toLocaleString("en-US") +
                        " · " +
                        r.stock_qty +
                        " in stock"
                      : r.message ||
                        r.description ||
                        r.url ||
                        r.value ||
                        r.setting_value ||
                        r.path ||
                        r.phone ||
                        r.product_id ||
                        "—"}
                    {tab === "site_settings" && r.setting_key === "meta_pixel_id" && <PixelEvents />}
                  </td>
                  <td>
                    <span className="admin-pill">
                      {r.status ||
                        r.payment_status ||
                        (r.active === false ? "Hidden" : "Active")}
                    </span>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <button
                        aria-label={"Move " + label(r) + " up"}
                        disabled={!canReorder || index === 0}
                        onClick={() => reorder(r.id, visibleRows[index - 1].id)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={"Move " + label(r) + " down"}
                        disabled={
                          !canReorder || index === visibleRows.length - 1
                        }
                        onClick={() => reorder(r.id, visibleRows[index + 1].id)}
                      >
                        ↓
                      </button>
                      {tab === "orders" && (
                        <button
                          onClick={async () => {
                            setError("");
                            try {
                              setOrderDetail(
                                await request("orders/" + r.id + "/detail"),
                              );
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          View details
                        </button>
                      )}
                      <button
                        aria-label={"Edit " + label(r)}
                        onClick={() => open(r)}
                      >
                        <Pencil /> Edit
                      </button>
                      {!["orders", "users"].includes(tab) && (
                        <button
                          className="danger"
                          aria-label={"Delete " + label(r)}
                          onClick={() => {
                            setError("");
                            setRemoving(r);
                          }}
                        >
                          <Trash2 /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleRows.length && (
            <div className="admin-empty">
              <LayoutDashboard />
              <h2>{busy ? "Loading records…" : "No matching records"}</h2>
              <p>Add the first record to this section.</p>
            </div>
          )}
        </div>
      </section>
      {editing && (
        <div className="admin-modal">
          <form
            onSubmit={save}
            role="dialog"
            aria-modal="true"
            aria-label="Edit record"
          >
            <button
              type="button"
              className="login-close"
              aria-label="Close editor"
              onClick={() => {
                setEditing(null);
                setFieldErrors({});
              }}
            >
              <X />
            </button>
            <span>{editing.id ? "EDIT RECORD" : "NEW RECORD"}</span>
            <h2>{definition.label}</h2>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="admin-form-grid">
              {definition.fields
                .filter((f) => !(tab === "products" && f.key === "slug"))
                .map((f) => (
                  <label
                    key={f.key}
                    className={
                      f.type === "specs" ||
                      (tab === "products" && f.key === "image_url")
                        ? "full-width"
                        : ""
                    }
                  >
                    {f.label}
                    {f.required ? " *" : ""}
                    {field(f)}
                    {tab === "site_settings" && editing.setting_key === "meta_pixel_id" && f.key === "setting_value" && <PixelEvents />}
                    {fieldErrors[f.key] && (
                      <small className="field-error" role="alert">
                        {fieldErrors[f.key]}
                      </small>
                    )}
                  </label>
                ))}
            </div>
            <button className="login-submit" disabled={busy}>
              {busy ? "SAVING…" : "SAVE CHANGES"}
            </button>
          </form>
        </div>
      )}
      {orderDetail && (
        <div className="admin-modal">
          <section
            className="admin-order-detail"
            role="dialog"
            aria-modal="true"
          >
            <button
              className="login-close"
              onClick={() => setOrderDetail(null)}
            >
              <X />
            </button>
            <span>ORDER DETAIL</span>
            <h2>{orderDetail.order_number}</h2>
            <div className="admin-order-meta">
              <p>
                Customer{" "}
                <b>{orderDetail.customer_name || orderDetail.phone || "—"}</b>
              </p>
              <p>
                Status <b>{orderDetail.status}</b>
              </p>
              <p>
                Payment{" "}
                <b>
                  {orderDetail.payment_method} · {orderDetail.payment_status}
                </b>
              </p>
              <p>
                Total <b>${(orderDetail.total_cents / 100).toFixed(2)}</b>
              </p>
            </div>
            {(orderDetail.items || []).map((i: any) => (
              <div className="order-item" key={i.id}>
                <img src={i.image_url} alt="" />
                <div>
                  <h3>{i.product_name}</h3>
                  <p>
                    {i.sku || ""} · Qty {i.quantity}
                  </p>
                </div>
                <strong>
                  ${((i.unit_price_cents * i.quantity) / 100).toFixed(2)}
                </strong>
              </div>
            ))}
            <div className="admin-order-address">
              <b>Delivery address</b>
              <p>
                {Object.values(orderDetail.shipping_address || {})
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          </section>
        </div>
      )}
      {removing && (
        <div className="admin-modal">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm deletion"
          >
            <Trash2 />
            <h2>Delete this record?</h2>
            <p>{label(removing)}</p>
            <p>
              This removes the record from the store. Order history restrictions
              still apply.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div>
              <button onClick={() => setRemoving(null)}>Keep record</button>
              <button disabled={busy} onClick={remove}>
                Delete record
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function SpecEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  return (
    <div className="spec-editor">
      {Object.entries(value).map(([key, val], i) => (
        <div key={i}>
          <input
            aria-label={"Specification label " + (i + 1)}
            value={key}
            onChange={(e) => {
              const entries = Object.entries(value);
              entries[i] = [e.target.value, val];
              onChange(Object.fromEntries(entries));
            }}
          />
          <input
            aria-label={"Specification value " + (i + 1)}
            value={val}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
          <button
            type="button"
            aria-label={"Remove " + key}
            onClick={() => {
              const next = { ...value };
              delete next[key];
              onChange(next);
            }}
          >
            <X />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            ["Specification " + (Object.keys(value).length + 1)]: "",
          })
        }
      >
        + Add specification
      </button>
    </div>
  );
}

function ProductImages({
  editing,
  setEditing,
  request,
  busy,
  setBusy,
  setError,
  maxBytes,
}: any) {
  const [url, setUrl] = useState("");
  const images: { image_url: string; alt_text: string }[] = [
    ...(editing.image_url
      ? [{ image_url: editing.image_url, alt_text: editing.name || "" }]
      : []),
    ...(editing.images || []),
  ].filter(
    (image, i, all) =>
      all.findIndex((x) => x.image_url === image.image_url) === i,
  );
  const append = (image_url: string) =>
    setEditing((current: any) => ({
      ...current,
      image_url: current.image_url || image_url,
      images: [
        ...(current.images || []),
        { image_url, alt_text: current.name || "" },
      ],
    }));
  return (
    <div className="image-upload">
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        disabled={busy || editing.images === undefined}
        aria-label="Upload product images"
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (
            files.some(
              (file) =>
                file.size > maxBytes ||
                !["image/jpeg", "image/png", "image/webp"].includes(file.type),
            )
          ) {
            setError(
              `Choose JPEG, PNG or WebP images smaller than ${(maxBytes / 1048576).toFixed(1)} MB each.`,
            );
            return;
          }
          setBusy(true);
          setError("");
          try {
            for (const file of files) {
              const result = await request("media/upload", {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: file,
              });
              append(result.url);
            }
          } catch (error: any) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <small>
        Select multiple images. Choose a default image for the product listing.
      </small>
      <div>
        <input
          aria-label="Product image URL"
          placeholder="Image URL or /assets/image.jpg"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !url.trim() || editing.images === undefined}
          onClick={() => {
            append(url.trim());
            setUrl("");
          }}
        >
          Add image URL
        </button>
      </div>
      <div className="admin-gallery">
        {images.map((image) => (
          <div key={image.image_url}>
            <img
              src={image.image_url}
              alt={image.alt_text || "Product image"}
            />
            <button
              type="button"
              disabled={busy || editing.images === undefined}
              aria-pressed={editing.image_url === image.image_url}
              onClick={() =>
                setEditing((current: any) => ({
                  ...current,
                  images,
                  image_url: image.image_url,
                }))
              }
            >
              {editing.image_url === image.image_url
                ? "Default image"
                : "Set as default"}
            </button>
            <button
              type="button"
              disabled={busy || editing.images === undefined}
              onClick={() => {
                const remaining = images.filter(
                  (x) => x.image_url !== image.image_url,
                );
                setEditing((current: any) => ({
                  ...current,
                  images: remaining,
                  image_url:
                    current.image_url === image.image_url
                      ? remaining[0]?.image_url || ""
                      : current.image_url,
                }));
              }}
            >
              Remove image
            </button>
          </div>
        ))}
      </div>
      {!images.length && <small>Add at least one product image.</small>}
    </div>
  );
}

function PixelEvents() {
  return <div className="admin-pixel-events" style={{ marginTop: 16, whiteSpace: "normal", textTransform: "none", letterSpacing: "normal" }}>
    <strong>Implemented Meta Pixel events</strong>
    <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
      <li><b>PageView</b> — Storefront page loads and navigation.</li>
      <li><b>ViewContent</b> — Product detail page opens.</li>
      <li><b>AddToCart</b> — A signed-in customer adds a product to the bag.</li>
      <li><b>InitiateCheckout</b> — Checkout opens.</li>
      <li><b>Purchase</b> — An order is placed or PayPal capture completes.</li>
    </ul>
    <small>Events run after consent when required. This lists implemented events; it does not confirm delivery to Meta. Verify receipt in Meta Events Manager.</small>
    <br /><small>PayPal Purchase currently includes currency but not order value.</small>
  </div>;
}
