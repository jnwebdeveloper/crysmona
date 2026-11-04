import { useEffect, useState, useRef, type FormEvent } from "react";
import { NavLink, useParams } from "react-router";
import {
  Boxes,
  LayoutDashboard,
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
  ["dashboard", "Dashboard", LayoutDashboard],
  ["stock", "Stock overview", Boxes],
  ["movements", "Stock movements", ArrowLeftRight],
  ["mappings", "SKU mappings", Link2],
  ["orders", "Channel orders", ClipboardList],
  ["integrations", "Integrations", RefreshCw],
] as const;
export default function Inventory() {
  const { section = "dashboard" } = useParams();
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
    [adding, setAdding] = useState(false),
    [shipping, setShipping] = useState<Row | null>(null);
  useEffect(() => {
    const etsyResult = new URLSearchParams(window.location.search).get("etsy");
    if (etsyResult === "connected")
      setNotice(
        "Etsy connected successfully. Map your Etsy SKUs before syncing orders.",
      );
    if (etsyResult === "denied")
      setError(
        "Etsy access was declined. Connect again and approve order-read access.",
      );
    if (etsyResult === "expired")
      setError(
        "The Etsy connection attempt expired. Sign in and try Connect Etsy again.",
      );
    if (etsyResult === "failed")
      setError(
        "Etsy connection could not be completed. See the latest Etsy sync history entry below for details.",
      );
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
      const [records, dashboard] = await Promise.all([
        api("/data"),
        api("/dashboard"),
      ]);
      setData({ ...records, dashboard });
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
            {section !== "dashboard" && (
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
            )}
            {section === "dashboard" && <Dashboard data={data} />}
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
                        (
                          i.name +
                          " " +
                          i.sku +
                          " " +
                          (i.channel_skus || [])
                            .map((m: Row) => m.sku)
                            .join(" ")
                        )
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((i) => [
                        <div className="inv-product">
                          {i.image_url && <img src={i.image_url} alt="" />}
                          <div>
                            <b>{i.name}</b>
                            <div className="inv-sku-list">
                              <small>
                                <b>Internal</b> {i.sku}
                              </small>
                              {(i.channel_skus || []).map((m: Row) => (
                                <small key={m.channel + ":" + m.sku}>
                                  <b>{m.channel}</b> {m.sku}
                                </small>
                              ))}
                            </div>
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
                      .map(
                        (i: Row) =>
                          `${i.sku} · ${i.shipped_quantity || 0}/${i.quantity} shipped · ${i.remaining ?? i.quantity} remaining`,
                      )
                      .join(", "),
                    (o.website_status || o.status).replace(/_/g, " "),
                    o.payment_status || "—",
                    o.status,
                    date(o.created_at),
                    o.channel === "website" ? (
                      <div className="inv-actions">
                        {["placed", "processing", "partially_shipped"].includes(
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
                                setError("");
                                setShipping(o);
                              }}
                            >
                              <Truck size={14} /> Ship products
                            </button>
                          </>
                        )}
                        {(o.shipments || []).length > 0 && (
                          <button
                            className="inv-secondary"
                            onClick={() => {
                              setError("");
                              setShipping(o);
                            }}
                          >
                            Shipments ({o.shipments.length})
                          </button>
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
                  <EtsyIntegration data={data} busy={busy} run={run} />
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
      {shipping && (
        <ShipmentEditor
          key={shipping.id}
          order={shipping}
          busy={busy}
          error={error}
          close={() => setShipping(null)}
          save={(values) =>
            void run(async () => {
              await api(`/orders/${shipping.id}/shipments`, values);
              setShipping(null);
            }, "Shipment recorded. Only shipped quantities were deducted; remaining units stay reserved.")
          }
        />
      )}
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
  const pageSize = size === -1 ? Math.max(sorted.length, 1) : size;
  const total = Math.max(1, Math.ceil(sorted.length / pageSize)),
    current = Math.min(page, total),
    shown = sorted.slice((current - 1) * pageSize, current * pageSize);
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
            ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, filtered.length)}`
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
            <option value="-1">All</option>
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

function ShipmentEditor({
  order,
  busy,
  error,
  close,
  save,
}: {
  order: Row;
  busy: boolean;
  error: string;
  close: () => void;
  save: (v: Row) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const canShip = ["placed", "processing", "partially_shipped"].includes(
    order.website_status,
  );
  return (
    <dialog
      ref={dialog}
      className="inv-editor inv-shipment-editor"
      aria-labelledby="inv-ship-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          const lines = (order.items || [])
            .map((i: Row) => ({
              order_item_id: i.order_item_id,
              quantity: Number(values.get("quantity-" + i.order_item_id) || 0),
            }))
            .filter((i: Row) => i.quantity > 0);
          if (!lines.length) {
            setFormError("Enter a positive quantity for at least one product.");
            return;
          }
          setFormError("");
          save({
            request_key: requestKey,
            lines,
            carrier: values.get("carrier"),
            tracking_number: values.get("tracking_number"),
          });
        }}
      >
        <header>
          <div>
            <p className="inv-eyebrow">{order.external_id}</p>
            <h2 id="inv-ship-title">
              {canShip ? "Ship products" : "Shipment history"}
            </h2>
          </div>
          <button
            type="button"
            className="inv-icon"
            onClick={close}
            disabled={busy}
            aria-label="Close shipment"
          >
            <X size={18} />
          </button>
        </header>
        {(error || formError) && (
          <p role="alert" className="inv-error">
            {formError || error}
          </p>
        )}
        {canShip && (
          <>
            <p className="inv-form-note">
              Choose how many units to ship now. Set 0 to leave a product for a
              later shipment. Unshipped units remain reserved.
            </p>
            <div className="inv-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product / SKU</th>
                    <th>Ordered</th>
                    <th>Shipped</th>
                    <th>Remaining</th>
                    <th>Ship now</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i: Row) => (
                    <tr key={i.order_item_id}>
                      <td>
                        <b>{i.name}</b>
                        <small className="inv-block">{i.sku}</small>
                      </td>
                      <td>{i.quantity}</td>
                      <td>{i.shipped_quantity || 0}</td>
                      <td>{i.remaining}</td>
                      <td>
                        <input
                          aria-label={`Ship quantity for ${i.sku}`}
                          name={"quantity-" + i.order_item_id}
                          type="number"
                          min="0"
                          max={i.remaining}
                          step="1"
                          defaultValue={i.remaining}
                          disabled={!i.remaining}
                          required
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="inv-edit-grid inv-shipping-fields">
              <label>
                Carrier (optional)
                <input
                  name="carrier"
                  maxLength={120}
                  placeholder="DHL, FedEx, local courier…"
                />
              </label>
              <label>
                Tracking number (optional)
                <input name="tracking_number" maxLength={180} />
              </label>
            </div>
          </>
        )}
        {order.shipments?.length > 0 && (
          <section className="inv-shipment-history">
            <h3>Recorded shipments</h3>
            {order.shipments.map((s: Row) => (
              <article key={s.id}>
                <b>Shipment #{s.id}</b>
                <span>{date(s.created_at)}</span>
                <p>
                  {(s.lines || [])
                    .map((l: Row) => `${l.sku} × ${l.quantity}`)
                    .join(" · ")}
                </p>
                <small>
                  {s.carrier || "Carrier not specified"}
                  {s.tracking_number ? " · " + s.tracking_number : ""}
                </small>
              </article>
            ))}
          </section>
        )}
        <footer>
          <button
            type="button"
            className="inv-secondary"
            disabled={busy}
            onClick={close}
          >
            {canShip ? "Cancel" : "Close"}
          </button>
          {canShip && (
            <button disabled={busy}>
              <Truck size={15} />
              {busy ? "Recording…" : "Confirm shipment"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
function Dashboard({ data }: { data: Row }) {
  const d = data.dashboard,
    s = d.stock,
    o = d.orders;
  const items: Row[] = data.items.filter((i: Row) => !i.archived);
  const attention = items
    .filter((i) => i.available <= i.reorder_level)
    .sort((a, b) => a.available - b.available);
  const peak = Math.max(
    1,
    ...d.activity.flatMap((a: Row) => [a.received, a.dispatched]),
  );
  return (
    <div className="inv-dashboard">
      <div className="inv-dashboard-intro">
        <div>
          <p className="inv-eyebrow">OPERATIONS AT A GLANCE</p>
          <h2>Your inventory, in focus.</h2>
          <p>Stock health, outstanding orders and recent warehouse activity.</p>
        </div>
        <NavLink className="inv-button" to="/inventory/orders">
          <Truck size={16} /> Manage shipments
        </NavLink>
      </div>
      <div className="inv-dashboard-metrics">
        {[
          ["Available units", s.available, "Ready to sell"],
          ["Reserved units", s.reserved, "Held for open orders"],
          ["Awaiting shipment", o.awaiting_shipment, "Placed or processing"],
          ["Partially shipped", o.partial, "Products still to dispatch"],
          ["Out of stock", s.out_of_stock, "Active items with zero stock"],
          ["Low stock", s.low_stock, "Positive stock at the threshold"],
        ].map(([label, value, note]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="inv-dashboard-grid">
        <section className="inv-card">
          <div className="inv-card-heading">
            <h2>Stock health</h2>
            <NavLink to="/inventory/stock">View inventory →</NavLink>
          </div>
          <div className="inv-health-bar" aria-label="Inventory stock health">
            {s.skus > 0 && (
              <>
                <span
                  style={{
                    width:
                      (100 * (s.skus - s.out_of_stock - s.low_stock)) / s.skus +
                      "%",
                  }}
                />
                <span style={{ width: (100 * s.low_stock) / s.skus + "%" }} />
                <span
                  style={{ width: (100 * s.out_of_stock) / s.skus + "%" }}
                />
              </>
            )}
          </div>
          <div className="inv-health-legend">
            <span>
              Healthy <b>{s.skus - s.out_of_stock - s.low_stock}</b>
            </span>
            <span>
              Low <b>{s.low_stock}</b>
            </span>
            <span>
              Out <b>{s.out_of_stock}</b>
            </span>
          </div>
          <div className="inv-dashboard-totals">
            <div>
              <small>Physical units</small>
              <b>{s.physical}</b>
            </div>
            <div>
              <small>Active SKUs</small>
              <b>{s.skus}</b>
            </div>
            <div>
              <small>Shipments today (IST)</small>
              <b>{d.shipments.today}</b>
            </div>
          </div>
        </section>
        <section className="inv-card">
          <h2>Order pipeline</h2>
          <div className="inv-pipeline">
            {[
              ["Awaiting payment", o.awaiting_payment],
              ["Awaiting shipment", o.awaiting_shipment],
              ["Partially shipped", o.partial],
              ["In transit", o.in_transit],
              ["Delivered", o.delivered],
            ].map(([label, n]) => (
              <div key={label}>
                <span>{label}</span>
                <b>{n}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="inv-card">
          <div className="inv-card-heading">
            <h2>Stock needing attention</h2>
            <span className="inv-badge inv-low">{attention.length} items</span>
          </div>
          <Table
            headers={["Item / SKU", "Available", "Low stock"]}
            rows={attention.slice(0, 8).map((i) => [
              <div>
                <b>{i.name}</b>
                <small className="inv-block">{i.sku}</small>
              </div>,
              i.available,
              i.reorder_level,
            ])}
          />
        </section>
        <section className="inv-card">
          <h2>Stock movements · last 7 days</h2>
          <p className="inv-chart-legend">
            Gold: received · Brown: stock deducted
          </p>
          {d.activity.length ? (
            <div className="inv-activity-chart">
              {d.activity.map((a: Row) => (
                <div key={a.day}>
                  <span>
                    {new Date(a.day + "T12:00:00").toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric" },
                    )}
                  </span>
                  <div className="inv-chart-bars">
                    <i
                      title={`${a.received} received`}
                      style={{ width: (100 * a.received) / peak + "%" }}
                    />
                    <i
                      title={`${a.dispatched} deducted`}
                      style={{ width: (100 * a.dispatched) / peak + "%" }}
                    />
                  </div>
                  <small>
                    {a.received} / {a.dispatched}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p>No stock movements in the last seven days.</p>
          )}
        </section>
      </div>
      <section className="inv-card">
        <div className="inv-card-heading">
          <h2>Recent activity</h2>
          <NavLink to="/inventory/movements">View movement history →</NavLink>
        </div>
        <Table
          headers={[
            "Time",
            "SKU",
            "Physical change",
            "Reserved change",
            "Reason",
          ]}
          rows={data.movements
            .slice(0, 10)
            .map((m: Row) => [
              date(m.created_at),
              m.sku,
              m.physical_delta,
              m.reserved_delta,
              m.reason,
            ])}
        />
      </section>
    </div>
  );
}

function EtsyIntegration({
  data,
  busy,
  run,
}: {
  data: Row;
  busy: boolean;
  run: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const setup = data.etsySetup || {
    ready: false,
    requirements: [],
    callback: "https://crysmona.vercel.app/api/inventory/etsy/callback",
  };
  const shop = data.integrations[0];
  const last = data.history.find((h: Row) => h.channel === "etsy");
  const [showSetup, setShowSetup] = useState(!setup.ready || !shop);
  return (
    <section className="inv-card inv-etsy-card">
      <div className="inv-card-heading">
        <h2>Etsy</h2>
        <span className={"inv-badge " + (!shop ? "inv-low" : "")}>
          {shop ? "Connected" : "Not connected"}
        </span>
      </div>
      <p>
        Import paid Etsy orders into the same physical inventory. Website
        availability follows the updated stock automatically.
      </p>
      {shop && (
        <div className="inv-etsy-shop">
          <b>{shop.shop_name || "Etsy shop"}</b>
          <small>Shop ID: {shop.shop_id}</small>
          <small>OAuth token refresh is handled automatically.</small>
        </div>
      )}
      <div className="inv-etsy-buttons">
        <button
          disabled={busy || !setup.ready}
          onClick={() => window.location.assign("/api/inventory/etsy/connect")}
        >
          {shop ? "Reconnect Etsy" : "Connect Etsy"}
        </button>
        <button
          className="inv-secondary"
          disabled={busy || !setup.ready || !shop}
          onClick={() =>
            void run(
              () => api("/etsy/test", {}),
              "Etsy connection verified. Order-read access is working.",
            )
          }
        >
          Test connection
        </button>
        <button
          disabled={busy || !setup.ready || !shop}
          onClick={() => {
            if (
              window.confirm(
                "Sync Etsy orders? Historical shipped orders can deduct physical stock. Confirm your opening stock and Etsy SKU mappings are ready.",
              )
            )
              void run(
                () => api("/sync/etsy", {}),
                "Etsy orders checked. See channel orders and sync history for results.",
              );
          }}
        >
          Sync Etsy orders
        </button>
        {shop && (
          <button
            className="inv-secondary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Disconnect Etsy from this inventory workspace? Imported orders and stock history will be kept.",
                )
              )
                void run(
                  () => api("/etsy/disconnect", {}),
                  "Etsy disconnected. Imported history was retained.",
                );
            }}
          >
            Disconnect
          </button>
        )}
      </div>
      {!setup.ready && (
        <p className="inv-etsy-hint">
          Finish the server settings below, then redeploy to enable connection.
          App status “Personal Access” is suitable for connecting your own
          authorized shop.
        </p>
      )}
      <button
        className="inv-secondary inv-setup-toggle"
        aria-expanded={showSetup}
        onClick={() => setShowSetup(!showSetup)}
      >
        {showSetup ? "Hide setup guide" : "Show setup guide"}
      </button>
      {showSetup && (
        <div className="inv-etsy-setup">
          <ol>
            <li>
              <b>Open your Etsy app</b>
              <p>
                In{" "}
                <a
                  href="https://www.etsy.com/developers/your-apps"
                  target="_blank"
                  rel="noreferrer"
                >
                  Etsy Your Apps
                </a>
                , open your approved app and locate its Keystring and Shared
                Secret.
              </p>
            </li>
            <li>
              <b>Register the callback URL</b>
              <p>Add this exact URL in your Etsy app's callback settings:</p>
              <div className="inv-copy-row">
                <code>{setup.callback}</code>
                <button
                  className="inv-secondary"
                  onClick={() =>
                    void run(
                      () => navigator.clipboard.writeText(setup.callback),
                      "Callback URL copied.",
                    )
                  }
                >
                  Copy URL
                </button>
              </div>
            </li>
            <li>
              <b>Add server settings in Vercel</b>
              <p>
                Open Crysmona → Settings → Environment Variables. Add these for
                Production. Keep secret values in Vercel; this screen shows only
                whether each setting is valid.
              </p>
              <ul className="inv-env-checklist">
                {setup.requirements.map((r: Row) => (
                  <li key={r.name}>
                    <span
                      className={"inv-badge " + (r.present ? "" : "inv-low")}
                    >
                      {r.present ? "Ready" : "Missing / invalid"}
                    </span>
                    <div>
                      <code>{r.name}</code>
                      <small>{r.description}</small>
                    </div>
                  </li>
                ))}
              </ul>
              <p>
                Use your Etsy Keystring for ETSY_CLIENT_ID and Shared Secret for
                ETSY_SHARED_SECRET. Set ETSY_REDIRECT_URI to the callback above.
              </p>
              <p>Generate INV_ENCRYPTION_KEY in Terminal with:</p>
              <pre>openssl rand -base64 32</pre>
              <p>
                Save the generated value in Vercel and keep it stable. Shop ID
                is detected automatically after authorization; ETSY_SHOP_ID is
                optional if you want to restrict connection to a specific shop.
              </p>
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Open Vercel dashboard ↗
              </a>
            </li>
            <li>
              <b>Redeploy and connect</b>
              <p>
                Redeploy Crysmona after saving environment variables. Return
                here, click Connect Etsy, sign in as the shop owner and approve
                order-read access. Then use Test connection.
              </p>
            </li>
            <li>
              <b>Map SKUs, then sync</b>
              <p>
                In SKU mappings choose Etsy, enter the exact Etsy SKU for each
                product/variation, and select its inventory item. Record opening
                physical stock before your first sync. Historical shipped orders
                are included, so opening balances must account for those sales.
              </p>
            </li>
          </ol>
        </div>
      )}
      <p className="inv-form-note">
        Orders are imported when you click Sync. This integration does not
        publish listings or send quantities back to Etsy. Manage Etsy shipping
        and cancellations on Etsy, then sync again.
      </p>
      {last && (
        <div className="inv-etsy-last">
          <small>Latest Etsy activity · {date(last.created_at)}</small>
          <span
            className={
              "inv-badge " + (last.status === "failed" ? "inv-out" : "")
            }
          >
            {last.status}
          </span>
          <p>{last.message}</p>
        </div>
      )}
    </section>
  );
}
