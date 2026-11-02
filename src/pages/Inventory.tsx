import { useEffect, useState, useRef, type FormEvent } from "react";
import { NavLink, useParams } from "react-router";
import {
  Boxes,
  Package,
  ArrowLeftRight,
  Truck,
  Check,
  Link2,
  ClipboardList,
  RefreshCw,
  LogOut,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  X,
  Plus,
  Search,
  Download,
  ArrowUpDown,
} from "lucide-react";
import "../styles/inventory.css";
type Row = Record<string, any>;
async function api(path: string, body?: unknown, method?: string) {
  const r = await fetch("/api/inventory" + path, {
    credentials: "include",
    method: method || (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: r.status,
    });
  return data;
}
const sections = [
  ["stock", "Stock overview", Boxes],
  ["movements", "Stock movements", ArrowLeftRight],
  ["mappings", "SKU mappings", Link2],
  ["orders", "Channel orders", ClipboardList],
  ["integrations", "Integrations", RefreshCw],
] as const;
export default function Inventory() {
  const { section = "stock" } = useParams();
  const [user, setUser] = useState<string | null>(null),
    [checking, setChecking] = useState(true),
    [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [stockFilter, setStockFilter] = useState("active"),
    [editing, setEditing] = useState<{
      type: "item" | "mapping" | "stock";
      row: Row;
    } | null>(null),
    [adding, setAdding] = useState(false);
  useEffect(() => {
    const previous = document.title;
    document.title = "Crysmona Inventory";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    api("/auth/me")
      .then((x) => setUser(x.email))
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setChecking(false));
    return () => {
      document.title = previous;
      meta.remove();
    };
  }, []);
  async function load() {
    try {
      setData(await api("/data"));
    } catch (e: any) {
      setError(e.message);
      if (e.status === 401) setUser(null);
    }
  }
  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [user]);
  async function run(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      if (user) await load();
    } catch (e: any) {
      setError(e.message);
      if (e.status === 401) setUser(null);
    } finally {
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    path: string,
    message: string,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void run(async () => {
      await api(path, values);
      form.reset();
    }, message);
  }
  if (checking) return <main className="inv-login">Loading inventory…</main>;
  if (!user)
    return (
      <main className="inv-login">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fields = Object.fromEntries(new FormData(e.currentTarget));
            void run(async () => {
              const result = await api("/auth/login", fields);
              setUser(result.email);
            }, "Signed in.");
          }}
        >
          <Package size={34} />
          <p className="inv-eyebrow">CRYSMONA / OPERATIONS</p>
          <h1>Inventory sign in</h1>
          <p>Use your staff credentials to manage stock.</p>
          {error && (
            <p role="alert" className="inv-error">
              {error}
            </p>
          )}
          <label>
            Email
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={busy}>Sign in to inventory</button>
        </form>
      </main>
    );
  const allItems: Row[] = data?.items || [];
  const items = allItems.filter((i) => !i.archived);
  const selected = sections.find((s) => s[0] === section);
  const itemOptions = (
    <>
      <option value="">Select inventory item</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.sku} · {i.name}
        </option>
      ))}
    </>
  );
  return (
    <div className="inv-shell">
      <aside className="inv-sidebar">
        <div className="inv-brand">
          CRYSMONA<span>INVENTORY WORKSPACE</span>
        </div>
        <p className="inv-eyebrow">OPERATIONS</p>
        <nav>
          {sections.map(([key, label, Icon]) => (
            <NavLink key={key} to={"/inventory/" + key}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="inv-account">
          <span>{user}</span>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("/auth/logout", {});
                setUser(null);
                setData(null);
              }, "Signed out.")
            }
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="inv-main">
        <header>
          <div>
            <p className="inv-eyebrow">CRYSMONA / INVENTORY</p>
            <h1>{selected?.[1] || "Page not found"}</h1>
            <p>
              One place for physical stock, reservations and channel records.
            </p>
          </div>
          <button
            className="inv-secondary"
            disabled={busy}
            onClick={() => void run(load, "Inventory refreshed.")}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </header>
        {error && (
          <div role="alert" className="inv-error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="inv-notice">
            {notice}
          </div>
        )}
        {!data ? (
          <p>Loading inventory data…</p>
        ) : (
          <>
            <div className="inv-stats">
              {[
                ["Inventory SKUs", items.length],
                ["Physical units", items.reduce((n, i) => n + i.physical, 0)],
                ["Reserved units", items.reduce((n, i) => n + i.reserved, 0)],
                [
                  "Low stock",
                  items.filter((i) => i.available <= i.reorder_level).length,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {section === "stock" && (
              <>
                <div className="inv-section-heading">
                  <div>
                    <h2>Inventory catalog</h2>
                    <p>
                      Website products are added automatically. Manage stock and
                      reorder thresholds here.
                    </p>
                  </div>
                  <button onClick={() => setAdding(!adding)}>
                    <Plus size={16} />
                    {adding ? "Close form" : "Add item"}
                  </button>
                </div>
                {adding && (
                  <section className="inv-card">
                    <h2>Add inventory item</h2>
                    <form
                      className="inv-form"
                      onSubmit={(e) =>
                        submit(
                          e,
                          "/items",
                          "Inventory item created. Receive opening stock in Stock movements.",
                        )
                      }
                    >
                      <label>
                        SKU
                        <input name="sku" maxLength={100} required />
                      </label>
                      <label>
                        Item name
                        <input name="name" maxLength={180} required />
                      </label>
                      <label>
                        Website reference
                        <select name="product_id">
                          <option value="">No reference</option>
                          {data.products.map((p: Row) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Location
                        <input
                          name="location"
                          maxLength={120}
                          placeholder="Shelf / bin"
                        />
                      </label>
                      <label>
                        Low stock threshold
                        <input
                          name="reorder_level"
                          type="number"
                          min="0"
                          max="1000000"
                          defaultValue="5"
                          required
                        />
                      </label>
                      <button disabled={busy}>Add item</button>
                    </form>
                  </section>
                )}
                <section className="inv-card inv-stock-card">
                  <div className="inv-card-heading">
                    <h2>Stock on hand</h2>
                    <div className="inv-controls">
                      <select
                        aria-label="Filter stock"
                        value={stockFilter}
                        onChange={(e) => setStockFilter(e.target.value)}
                      >
                        <option value="active">Active items</option>
                        <option value="low">Low stock</option>
                        <option value="out">Out of stock</option>
                        <option value="archived">Archived items</option>
                        <option value="all">All items</option>
                      </select>
                      <input
                        aria-label="Search inventory"
                        placeholder="Search SKU or item…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <Table
                    searchable={false}
                    headers={[
                      "Product / SKU",
                      "Physical",
                      "Reserved",
                      "Available",
                      "Low stock",
                      "Stock status",
                      "Actions",
                    ]}
                    rows={allItems
                      .filter(
                        (i) =>
                          stockFilter === "all" ||
                          (stockFilter === "archived"
                            ? i.archived
                            : !i.archived &&
                              (stockFilter === "low"
                                ? i.available <= i.reorder_level
                                : stockFilter === "out"
                                  ? i.available === 0
                                  : true)),
                      )
                      .filter((i) =>
                        (i.name + " " + i.sku)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((i) => [
                        <div className="inv-product">
                          {i.image_url && <img src={i.image_url} alt="" />}
                          <div>
                            <b>{i.name}</b>
                            <small>{i.sku}</small>
                          </div>
                        </div>,
                        i.physical,
                        i.reserved,
                        i.available,
                        <span title="Low stock alert threshold">
                          {i.reorder_level}
                        </span>,
                        <span
                          className={
                            "inv-badge " +
                            (i.archived
                              ? "inv-archived"
                              : i.available === 0
                                ? "inv-out"
                                : i.available <= i.reorder_level
                                  ? "inv-low"
                                  : "")
                          }
                        >
                          {i.archived
                            ? "Archived"
                            : i.available === 0
                              ? "Out of stock"
                              : i.available <= i.reorder_level
                                ? "Low stock"
                                : "In stock"}
                        </span>,
                        <div className="inv-actions">
                          <button
                            className="inv-add-stock"
                            title={
                              i.archived
                                ? "Restore this item before receiving stock"
                                : "Add physical stock"
                            }
                            aria-label={`Add physical stock for ${i.sku}`}
                            disabled={busy || i.archived}
                            onClick={() => {
                              setError("");
                              setEditing({ type: "stock", row: i });
                            }}
                          >
                            <Plus size={15} />
                            <span>Add stock</span>
                          </button>
                          <button
                            className="inv-icon"
                            title="Edit item"
                            aria-label={`Edit ${i.sku}`}
                            disabled={busy}
                            onClick={() => setEditing({ type: "item", row: i })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="inv-icon"
                            title={i.archived ? "Restore item" : "Archive item"}
                            aria-label={`${i.archived ? "Restore" : "Archive"} ${i.sku}`}
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  i.archived
                                    ? "Restore this item and make its stock available for sale?"
                                    : "Archive this item? Its stock will be unavailable on the website.",
                                )
                              )
                                void run(
                                  () =>
                                    api(
                                      `/items/${i.id}/archive`,
                                      { archived: !i.archived },
                                      "PATCH",
                                    ),
                                  i.archived
                                    ? "Item restored."
                                    : "Item archived.",
                                );
                            }}
                          >
                            {i.archived ? (
                              <RotateCcw size={15} />
                            ) : (
                              <Archive size={15} />
                            )}
                          </button>
                          <button
                            className="inv-icon inv-danger"
                            title={
                              i.product_id || i.physical || i.reserved
                                ? "Archive linked or stocked items instead"
                                : "Delete unused item"
                            }
                            aria-label={`Delete ${i.sku}`}
                            disabled={
                              busy ||
                              Boolean(i.product_id || i.physical || i.reserved)
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Permanently delete this unused item? Items with stock, links or history must be archived instead.",
                                )
                              )
                                void run(
                                  () => api(`/items/${i.id}`, {}, "DELETE"),
                                  "Item deleted.",
                                );
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>,
                      ])}
                  />
                </section>
              </>
            )}
            {section === "movements" && (
              <>
                <section className="inv-card">
                  <h2>Record a stock movement</h2>
                  <p>
                    Receive opening stock or deliveries, reserve units, release
                    reservations, or ship reserved units.
                  </p>
                  <form
                    className="inv-form"
                    onSubmit={(e) =>
                      submit(e, "/movements", "Stock movement recorded.")
                    }
                  >
                    <label>
                      Item
                      <select name="item_id" required>
                        {itemOptions}
                      </select>
                    </label>
                    <label>
                      Action
                      <select name="action">
                        {[
                          ["receive", "Receive stock"],
                          ["remove", "Remove available stock"],
                          ["reserve", "Reserve stock"],
                          ["release", "Release reservation"],
                          ["ship", "Ship reserved stock"],
                        ].map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        name="quantity"
                        type="number"
                        min="1"
                        max="1000000"
                        required
                      />
                    </label>
                    <label>
                      Reason
                      <input
                        name="reason"
                        maxLength={500}
                        required
                        placeholder="Delivery, damage, manual allocation…"
                      />
                    </label>
                    <button disabled={busy}>Record movement</button>
                  </form>
                </section>
                <section className="inv-card">
                  <h2>Movement history</h2>
                  <Table
                    headers={[
                      "Time",
                      "SKU",
                      "Physical change",
                      "Reserved change",
                      "Reason",
                      "Staff",
                    ]}
                    rows={data.movements.map((m: Row) => [
                      date(m.created_at),
                      m.sku,
                      m.physical_delta,
                      m.reserved_delta,
                      m.reason,
                      m.actor,
                    ])}
                  />
                </section>
              </>
            )}
            {section === "mappings" && (
              <>
                <section className="inv-card">
                  <h2>Map a channel SKU</h2>
                  <p>
                    Each channel SKU points to one inventory item. Saving an
                    existing mapping updates it.
                  </p>
                  <form
                    className="inv-form"
                    onSubmit={(e) =>
                      submit(e, "/mappings", "SKU mapping saved.")
                    }
                  >
                    <label>
                      Inventory item
                      <select name="item_id" required>
                        {itemOptions}
                      </select>
                    </label>
                    <label>
                      Channel
                      <select name="channel">
                        <option value="website">Website</option>
                        <option value="etsy">Etsy</option>
                      </select>
                    </label>
                    <label>
                      Channel SKU
                      <input name="external_sku" maxLength={100} required />
                    </label>
                    <label>
                      Etsy listing ID (optional)
                      <input name="listing_id" maxLength={100} />
                    </label>
                    <button disabled={busy}>Save mapping</button>
                  </form>
                </section>
                <section className="inv-card">
                  <h2>Channel mappings</h2>
                  <Table
                    headers={[
                      "Inventory SKU",
                      "Channel",
                      "Channel SKU",
                      "Listing ID",
                      "Actions",
                    ]}
                    rows={data.mappings.map((m: Row) => [
                      m.sku,
                      m.channel,
                      m.external_sku,
                      m.listing_id || "—",
                      <div className="inv-actions">
                        <button
                          className="inv-icon"
                          aria-label={`Edit mapping ${m.external_sku}`}
                          onClick={() =>
                            setEditing({ type: "mapping", row: m })
                          }
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="inv-icon inv-danger"
                          aria-label={`Delete mapping ${m.external_sku}`}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this channel SKU mapping? Future imports for this SKU will need a mapping.",
                              )
                            )
                              void run(
                                () => api(`/mappings/${m.id}`, {}, "DELETE"),
                                "Mapping deleted.",
                              );
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>,
                    ])}
                  />
                </section>
              </>
            )}
            {section === "orders" && (
              <section className="inv-card">
                <h2>Orders &amp; fulfillment</h2>
                <p>
                  New website orders reserve stock immediately. Shipment
                  consumes stock; cancellation releases reservations. Process
                  and ship website orders here; admin updates automatically.
                  Update Etsy shipments on Etsy, then sync.
                </p>
                <Table
                  headers={[
                    "Channel",
                    "Order reference",
                    "Items / quantity",
                    "Order status",
                    "Payment",
                    "Stock status",
                    "Created",
                    "Fulfillment",
                  ]}
                  rows={data.orders.map((o: Row) => [
                    o.channel,
                    o.external_id,
                    (o.items || [])
                      .map((i: Row) => `${i.sku} × ${i.quantity}`)
                      .join(", "),
                    o.website_status || o.status,
                    o.payment_status || "—",
                    o.status,
                    date(o.created_at),
                    o.channel === "website" ? (
                      <div className="inv-actions">
                        {["placed", "processing"].includes(
                          o.website_status,
                        ) && (
                          <>
                            {o.website_status === "placed" && (
                              <button
                                disabled={busy}
                                className="inv-secondary"
                                onClick={() =>
                                  void run(
                                    () =>
                                      api(`/orders/${o.id}/fulfillment`, {
                                        status: "processing",
                                      }),
                                    "Order marked processing in admin and inventory.",
                                  )
                                }
                              >
                                Process
                              </button>
                            )}
                            <button
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Mark order ${o.external_id} shipped? This deducts its reserved physical stock and updates admin.`,
                                  )
                                )
                                  void run(
                                    () =>
                                      api(`/orders/${o.id}/fulfillment`, {
                                        status: "shipped",
                                      }),
                                    "Order shipped. Physical stock and reservations updated.",
                                  );
                              }}
                            >
                              <Truck size={14} /> Mark shipped
                            </button>
                          </>
                        )}
                        {o.website_status === "shipped" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  api(`/orders/${o.id}/fulfillment`, {
                                    status: "delivered",
                                  }),
                                "Order marked delivered.",
                              )
                            }
                          >
                            <Check size={14} /> Mark delivered
                          </button>
                        )}
                        {o.website_status === "awaiting_payment" && (
                          <span className="inv-badge inv-low">
                            Awaiting payment
                          </span>
                        )}
                        {["delivered", "cancelled"].includes(
                          o.website_status,
                        ) && (
                          <span className="inv-badge">{o.website_status}</span>
                        )}
                      </div>
                    ) : (
                      <span className="inv-form-note">
                        Ship on Etsy, then sync
                      </span>
                    ),
                  ])}
                />
              </section>
            )}
            {section === "integrations" && (
              <>
                <div className="inv-integrations">
                  <section className="inv-card">
                    <h2>Website</h2>
                    <span className="inv-badge">Inventory-driven</span>
                    <p>
                      Website availability comes from inventory. New orders
                      reserve stock automatically and appear here and in admin.
                      Use sync to reconcile older orders.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api("/sync/website", {}),
                          "Website orders checked.",
                        )
                      }
                    >
                      Sync website orders
                    </button>
                  </section>
                  <section className="inv-card">
                    <h2>Etsy</h2>
                    <span className="inv-badge">
                      {data.integrations.length ? "Connected" : "Not connected"}
                    </span>
                    <p>
                      Connect your configured Etsy shop to import orders. OAuth
                      tokens are encrypted in inventory storage.
                    </p>
                    <a
                      className="inv-button"
                      href="/api/inventory/etsy/connect"
                    >
                      Connect Etsy
                    </a>{" "}
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api("/sync/etsy", {}),
                          "Etsy orders checked.",
                        )
                      }
                    >
                      Sync Etsy orders
                    </button>
                    {data.integrations.length > 0 && (
                      <button
                        className="inv-secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => api("/etsy/disconnect", {}),
                            "Etsy disconnected.",
                          )
                        }
                      >
                        Disconnect
                      </button>
                    )}
                  </section>
                </div>
                <section className="inv-card">
                  <h2>Before your first sync</h2>
                  <p>
                    Admin products are listed and mapped automatically. Receive
                    physical stock before selling. Available stock is physical
                    minus reserved; unmapped products are unavailable. Website
                    orders update inventory automatically. Manual reconciliation
                    includes historical orders, so account for past shipments in
                    opening stock. Etsy imports remain manual.
                  </p>
                </section>
                <section className="inv-card">
                  <h2>Sync history</h2>
                  <Table
                    headers={["Time", "Channel", "Result", "Details"]}
                    rows={data.history.map((h: Row) => [
                      date(h.created_at),
                      h.channel,
                      h.status,
                      h.message,
                    ])}
                  />
                </section>
              </>
            )}
          </>
        )}
      </main>
      {editing && (
        <Editor
          key={`${editing.type}-${editing.row.id}`}
          editing={editing}
          items={allItems}
          busy={busy}
          error={error}
          close={() => setEditing(null)}
          save={(values) =>
            void run(
              async () => {
                if (editing.type === "stock") {
                  await api("/movements", {
                    item_id: editing.row.id,
                    action: "receive",
                    quantity: values.quantity,
                    reason: values.reason,
                  });
                } else {
                  await api(
                    `/${editing.type === "item" ? "items" : "mappings"}/${editing.row.id}`,
                    values,
                    "PUT",
                  );
                }
                setEditing(null);
              },
              editing.type === "stock"
                ? "Physical stock added. Movement history updated."
                : "Changes saved.",
            )
          }
        />
      )}
    </div>
  );
}
function date(value: string) {
  return new Date(value).toLocaleString();
}
function Table({
  headers,
  rows,
  searchable = true,
}: {
  headers: string[];
  rows: any[][];
  searchable?: boolean;
}) {
  const [page, setPage] = useState(1),
    [size, setSize] = useState(20),
    [sort, setSort] = useState<{ index: number; dir: number } | null>(null),
    [query, setQuery] = useState("");
  function plain(cell: any): string {
    if (cell == null || typeof cell === "boolean") return "";
    if (typeof cell !== "object") return String(cell);
    if (Array.isArray(cell)) return cell.map(plain).join(" ");
    return cell.props ? plain(cell.props.children) : "";
  }
  const filtered = rows.filter((row) =>
    row.some(
      (cell, i) =>
        headers[i] !== "Actions" &&
        plain(cell).toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const sorted = sort
    ? [...filtered].sort(
        (a, b) =>
          plain(a[sort.index]).localeCompare(plain(b[sort.index]), undefined, {
            numeric: true,
          }) * sort.dir,
      )
    : filtered;
  const total = Math.max(1, Math.ceil(sorted.length / size)),
    current = Math.min(page, total),
    shown = sorted.slice((current - 1) * size, current * size);
  function download() {
    const csv = [
      headers.filter((h) => h !== "Actions"),
      ...sorted.map((row) =>
        row.filter((_, i) => headers[i] !== "Actions").map(plain),
      ),
    ]
      .map((row) =>
        row
          .map((value) => {
            const safe = /^[=+@\-\t\r]/.test(String(value))
              ? "'" + value
              : String(value);
            return '"' + safe.replace(/"/g, '""') + '"';
          })
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "crysmona-inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="inv-table-toolbar">
        {searchable && (
          <label className="inv-table-search">
            <Search size={15} />
            <input
              aria-label="Search table"
              placeholder="Search this table…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
        )}
        <button
          className="inv-secondary"
          onClick={download}
          disabled={!rows.length}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>
      <div className="inv-table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((h, index) => (
                <th
                  key={h}
                  aria-sort={
                    sort?.index === index
                      ? sort.dir === 1
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {h === "Actions" ? (
                    h
                  ) : (
                    <button
                      className="inv-sort"
                      onClick={() =>
                        setSort({
                          index,
                          dir: sort?.index === index ? -sort.dir : 1,
                        })
                      }
                    >
                      {h}
                      <ArrowUpDown size={11} />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length ? (
              shown.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length}>
                  <div className="inv-empty">
                    <Package size={26} />
                    <p>{query ? "No matching records." : "No records yet."}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="inv-pagination">
        <span>
          {filtered.length
            ? `${(current - 1) * size + 1}–${Math.min(current * size, filtered.length)}`
            : "0"}{" "}
          of {filtered.length} records
        </span>
        <label>
          Rows
          <select
            aria-label="Rows per page"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          className="inv-secondary"
          disabled={current === 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </button>
        <span>
          {current} / {total}
        </span>
        <button
          className="inv-secondary"
          disabled={current === total}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
function Editor({
  editing,
  items,
  busy,
  error,
  close,
  save,
}: {
  editing: { type: "item" | "mapping" | "stock"; row: Row };
  items: Row[];
  busy: boolean;
  error: string;
  close: () => void;
  save: (v: Row) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const row = editing.row;
  return (
    <dialog
      ref={dialog}
      className="inv-editor"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="inv-edit-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <header>
          <div>
            <p className="inv-eyebrow">INVENTORY / EDIT RECORD</p>
            <h2 id="inv-edit-title">
              {editing.type === "stock"
                ? "Add physical stock"
                : editing.type === "item"
                  ? "Edit inventory item"
                  : "Edit SKU mapping"}
            </h2>
          </div>
          <button
            type="button"
            className="inv-icon"
            disabled={busy}
            onClick={close}
            aria-label="Close editor"
          >
            <X size={18} />
          </button>
        </header>
        {error && (
          <p className="inv-error" role="alert">
            {error}
          </p>
        )}
        <div className="inv-edit-grid">
          {editing.type === "stock" ? (
            <>
              <div className="inv-stock-receipt">
                <strong>{row.name}</strong>
                <small>{row.sku}</small>
                <div>
                  <span>
                    Physical: <b>{row.physical}</b>
                  </span>
                  <span>
                    Reserved: <b>{row.reserved}</b>
                  </span>
                  <span>
                    Available: <b>{row.available}</b>
                  </span>
                </div>
              </div>
              <label>
                Quantity to add
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  defaultValue="1"
                  required
                  autoFocus
                />
              </label>
              <label>
                Reason
                <input
                  name="reason"
                  maxLength={500}
                  placeholder="Opening stock or delivery reference"
                  required
                />
              </label>
              <p className="inv-form-note">
                This adds units to the current physical stock; it does not
                replace the total. Reserved stock stays unchanged. The addition
                is recorded in movement history.
              </p>
            </>
          ) : editing.type === "item" ? (
            <>
              <label>
                Internal SKU
                <input
                  name="sku"
                  defaultValue={row.sku}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Item name
                <input
                  name="name"
                  defaultValue={row.name}
                  maxLength={180}
                  required
                />
              </label>
              <label>
                Location
                <input
                  name="location"
                  defaultValue={row.location}
                  maxLength={120}
                  placeholder="Shelf / bin"
                />
              </label>
              <label>
                Low stock threshold
                <input
                  type="number"
                  name="reorder_level"
                  min="0"
                  max="1000000"
                  defaultValue={row.reorder_level}
                  required
                />
              </label>
              <p className="inv-form-note">
                Physical and reserved quantities are managed through stock
                movements. Changing the internal SKU keeps website mappings
                intact.
              </p>
            </>
          ) : (
            <>
              <label>
                Inventory item
                <select name="item_id" defaultValue={row.item_id} required>
                  {items.map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.sku} · {i.name}
                      {i.archived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Channel
                <select name="channel" defaultValue={row.channel}>
                  <option value="website">Website</option>
                  <option value="etsy">Etsy</option>
                </select>
              </label>
              <label>
                Channel SKU
                <input
                  name="external_sku"
                  defaultValue={row.external_sku}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Etsy listing ID
                <input
                  name="listing_id"
                  defaultValue={row.listing_id || ""}
                  maxLength={100}
                />
              </label>
              <p className="inv-form-note">
                Website product SKU changes belong in admin. Reassigning a
                mapping affects future orders; existing orders retain their
                original stock items.
              </p>
            </>
          )}
        </div>
        <footer>
          <button
            type="button"
            className="inv-secondary"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button disabled={busy}>
            {busy
              ? "Saving…"
              : editing.type === "stock"
                ? "Add physical stock"
                : "Save changes"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
