import { useEffect, useState, type FormEvent } from "react";
import { NavLink, useParams } from "react-router";
import {
  Boxes,
  Package,
  ArrowLeftRight,
  Link2,
  ClipboardList,
  RefreshCw,
  LogOut,
} from "lucide-react";
import "../styles/inventory.css";
type Row = Record<string, any>;
async function api(path: string, body?: unknown) {
  const r = await fetch("/api/inventory" + path, {
    credentials: "include",
    method: body === undefined ? "GET" : "POST",
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
    [search, setSearch] = useState("");
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
    if (user) void load();
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
  const items: Row[] = data?.items || [];
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
                <section className="inv-card">
                  <div className="inv-card-heading">
                    <h2>Stock on hand</h2>
                    <input
                      aria-label="Search inventory"
                      placeholder="Search SKU or item…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Table
                    headers={[
                      "Item / SKU",
                      "Location",
                      "Physical",
                      "Reserved",
                      "Available",
                      "Stock status",
                    ]}
                    rows={items
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
                        i.location || "—",
                        i.physical,
                        i.reserved,
                        i.available,
                        <span
                          className={
                            "inv-badge " +
                            (i.available <= i.reorder_level ? "inv-low" : "")
                          }
                        >
                          {i.available <= i.reorder_level
                            ? "Low stock"
                            : "In stock"}
                        </span>,
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
                    ]}
                    rows={data.mappings.map((m: Row) => [
                      m.sku,
                      m.channel,
                      m.external_sku,
                      m.listing_id || "—",
                    ])}
                  />
                </section>
              </>
            )}
            {section === "orders" && (
              <section className="inv-card">
                <h2>Imported channel orders</h2>
                <p>
                  Open paid orders reserve stock. Shipment consumes stock;
                  cancellation releases reservations. Use Integrations to pull
                  current orders.
                </p>
                <Table
                  headers={[
                    "Channel",
                    "Order reference",
                    "Stock status",
                    "Imported",
                  ]}
                  rows={data.orders.map((o: Row) => [
                    o.channel,
                    o.external_id,
                    o.status,
                    date(o.created_at),
                  ])}
                />
              </section>
            )}
            {section === "integrations" && (
              <>
                <div className="inv-integrations">
                  <section className="inv-card">
                    <h2>Website</h2>
                    <span className="inv-badge">Read-only source</span>
                    <p>
                      Import paid orders and cancellations using mapped SKUs.
                      Existing customer data, pricing and store stock are not
                      modified.
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
                    Record current physical stock and map all channel SKUs
                    first. Imports include historical paid orders, so use
                    opening quantities that account for those sales. Syncs are
                    manual and never publish quantities back to either
                    storefront.
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
    </div>
  );
}
function date(value: string) {
  return new Date(value).toLocaleString();
}
function Table({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <div className="inv-table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
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
                  <p>No records yet.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
