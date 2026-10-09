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
import React, { useEffect, useState } from "react";
import Loader from "../../../components/Loader";
import { Field, resources } from "../../../../shared/adminSchema";
import { adminValidation } from "../../../../shared/adminValidation";
import { api, go, useStore } from "../../../app/Store";
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
export default function AdminPage() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [connected, setConnected] = useState(false),
    [tab, setTab] = useState("products"),
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
    [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const { refresh } = useStore();
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
      const [data, summary] = await Promise.all([
        request(tab),
        request("dashboard"),
      ]);
      setRows(data);
      setStats(summary);
      setConnected(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (connected) {
      setRows([]);
      setQuery("");
      setNotice("");
      load();
    }
  }, [tab]);
  const open = async (record?: any) => {
    setError("");
    const defaults: any = {};
    for (const f of resources[tab].fields)
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
    setEditing(record ? { ...record } : defaults);
    try {
      const refs: Record<string, string> = {
        product_id: "products",
        category_id: "categories",
        user_id: "users",
        order_id: "orders",
      };
      const data: Record<string, any[]> = {};
      for (const f of resources[tab].fields)
        if (refs[f.key]) data[f.key] = await request(refs[f.key]);
      setLookups(data);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const validation=adminValidation(tab,editing); setFieldErrors(validation);
    if(Object.keys(validation).length){setError("Please correct the highlighted fields.");return;}
    setBusy(true);
    try {
      const body: any = {};
      for (const f of resources[tab].fields)
        body[f.key] = editing[f.key] ?? (f.type === "specs" ? {} : null);
      await request(tab + (editing.id ? "/" + editing.id : ""), {
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
      await request(tab + "/" + removing.id, { method: "DELETE" });
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
    const change = (v: any) => setEditing({ ...editing, [f.key]: v });
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
            aria-label="Upload image to Cloudflare R2"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 8 * 1024 * 1024) {
                setError("Choose an image smaller than 8 MB.");
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
          <small>JPEG, PNG or WebP · up to 8 MB · saved to Cloudflare R2</small>
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
              f.type === "number" ? Number(e.target.value) : e.target.value,
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
          {[
            { title: "STORE", items: [
              ["products", "Products", Package],
              ["categories", "Categories", Tags],
              ["content_blocks", "Storefront", PanelsTopLeft],
            ]},
            { title: "COMMERCE", items: [
              ["orders", "Orders", ShoppingBag],
              ["users", "Customers", Users],
              ["coupons", "Discounts", BadgePercent],
            ]},
            { title: "MARKETING", items: [
              ["seo_pages", "SEO", Search],
              ["site_settings", "Pixel & tracking", Settings],
            ]},
            { title: "SETTINGS", items: [
              ["settings", "Store settings", Settings],
            ]},
          ].map((group) => (
            <section className="admin-nav-group" key={group.title}>
              <span>{group.title}</span>
              {group.items.map(([id, name, Icon]: any) => (
                <button
                  key={id}
                  className={tab === id ? "active" : ""}
                  onClick={() => { setTab(id); setEditing(null); }}
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
            <h1>{resources[tab].label}</h1>
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
              <Plus /> {tab === "products" ? "Add product" : tab === "categories" ? "Add category" : tab === "coupons" ? "Add discount" : tab === "content_blocks" ? "Add content" : tab === "seo_pages" ? "Add SEO page" : tab === "site_settings" ? "Add tracking setting" : "Add setting"}
            </button>
          )}
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Details</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) =>
                  JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
                )
                .map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="admin-record">
                        {r.image_url && <img src={r.image_url} alt="" />}
                        <div>
                          <b>{label(r)}</b>
                          {r.slug && <small>{r.slug}</small>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.price_cents !== undefined
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
                        {tab === "orders" && <button onClick={async()=>{setError("");try{setOrderDetail(await request("orders/"+r.id+"/detail"))}catch(e:any){setError(e.message)}}}>View details</button>}
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
          {!rows.length && (
            <div className="admin-empty">
              <LayoutDashboard />
              <h2>{busy ? "Loading records…" : "No records yet"}</h2>
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
              onClick={() => {setEditing(null);setFieldErrors({});}}
            >
              <X />
            </button>
            <span>{editing.id ? "EDIT RECORD" : "NEW RECORD"}</span>
            <h2>{resources[tab].label}</h2>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="admin-form-grid">
              {resources[tab].fields.map((f) => (
                <label
                  key={f.key}
                  className={f.type === "specs" ? "full-width" : ""}
                >
                  {f.label}
                  {f.required ? " *" : ""}
                  {field(f)}
                  {fieldErrors[f.key] && <small className="field-error" role="alert">{fieldErrors[f.key]}</small>}
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
          <section className="admin-order-detail" role="dialog" aria-modal="true">
            <button className="login-close" onClick={()=>setOrderDetail(null)}><X /></button>
            <span>ORDER DETAIL</span><h2>{orderDetail.order_number}</h2>
            <div className="admin-order-meta"><p>Customer <b>{orderDetail.customer_name || orderDetail.phone || "—"}</b></p><p>Status <b>{orderDetail.status}</b></p><p>Payment <b>{orderDetail.payment_method} · {orderDetail.payment_status}</b></p><p>Total <b>${(orderDetail.total_cents/100).toFixed(2)}</b></p></div>
            {(orderDetail.items||[]).map((i:any)=><div className="order-item" key={i.id}><img src={i.image_url} alt=""/><div><h3>{i.product_name}</h3><p>{i.sku||""} · Qty {i.quantity}</p></div><strong>${(i.unit_price_cents*i.quantity/100).toFixed(2)}</strong></div>)}
            <div className="admin-order-address"><b>Delivery address</b><p>{Object.values(orderDetail.shipping_address||{}).filter(Boolean).join(", ")}</p></div>
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
