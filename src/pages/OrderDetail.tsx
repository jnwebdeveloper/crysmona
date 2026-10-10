import { ArrowLeft, MapPin, CreditCard, PackageCheck } from "lucide-react";
import { useParams } from "react-router";
import Loader from "../components/Loader";
import { api, go } from "../lib/Store";
import { useEffect, useState } from "react";
import { Order, money } from "../lib/model";
// /orders/:orderNumber — rendered inside RequireLogin.
export default function OrderDetail(){
 const { orderNumber = "" } = useParams();
 const [order,setOrder]=useState<Order|null>(null),[loadError,setLoadError]=useState("");
 const load=()=>api("/orders/"+encodeURIComponent(orderNumber)).then((o)=>{setOrder(o);setLoadError("")}).catch((e)=>setLoadError(e.message));
 useEffect(()=>{setOrder(null);load()},[orderNumber]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 if(loadError)return <main className="page wishlist-empty"><h1>{loadError}</h1><button onClick={()=>go("/orders")}>BACK TO MY ORDERS</button></main>;
 if(!order)return <main className="page"><Loader label="Loading order…" /></main>;
 const address=order.shippingAddress||{};
 const cancellable=["placed","processing"].includes(order.status);
 const cancel=async()=>{if(!confirm("Cancel this order? A completed PayPal payment will be refunded."))return;setBusy(true);setMessage("");try{const r=await api("/orders/"+encodeURIComponent(order.id)+"/cancel",{method:"POST"});setMessage(r.refunded?"Order cancelled and PayPal refund requested.":"Order cancelled.");await load()}catch(e:any){setMessage(e.message)}finally{setBusy(false)}};
 return <main className="page order-detail-page">
  <button className="order-back" onClick={()=>go('/orders')}><ArrowLeft/> My Orders</button>
  <section className="order-detail-head"><div><span>ORDER DETAILS</span><h1>{order.id}</h1><p>Placed {new Date(order.createdAt).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}</p></div><em>{order.status}</em></section>
  <div className="order-detail-layout"><section className="order-detail-items"><h2>Your pieces</h2>{order.items.map((i,idx)=><article className="order-item" key={i.product.slug+idx}><img src={i.product.image} alt={i.product.name}/><div><h3>{i.product.name}</h3><p>{i.product.stone} · Qty {i.qty}</p></div><strong>${(money(i.product.price)*i.qty).toLocaleString('en-US',{minimumFractionDigits:2})}</strong></article>)}</section>
  <aside className="order-detail-summary"><h2>Order summary</h2><p><span>Subtotal</span><b>${(order.subtotal??order.total).toFixed(2)}</b></p><p><span>Shipping</span><b>${(order.shipping??0).toFixed(2)}</b></p>{!!order.discount&&<p><span>Discount</span><b>−${order.discount.toFixed(2)}</b></p>}<hr/><p className="detail-total"><span>Total</span><b>${order.total.toFixed(2)}</b></p><div className="detail-box"><CreditCard/><div><small>PAYMENT</small><b>{order.paymentMethod?.toUpperCase()||'—'}</b><span>{order.paymentStatus||'pending'}</span></div></div><div className="detail-box"><MapPin/><div><small>DELIVERY ADDRESS</small><b>{address.name||'Customer'}</b><span>{[address.line1,address.city,address.state,address.postal_code,address.country].filter(Boolean).join(', ')}</span></div></div><div className="detail-box"><PackageCheck/><div><small>ORDER STATUS</small><b>{order.status}</b></div></div>{order.history?.length?<div className="order-timeline"><small>STATUS HISTORY</small>{order.history.map((h,i)=><p key={i}><b>{h.status.replace(/_/g," ")}</b><span>{new Date(h.created_at).toLocaleString("en-US")}</span>{h.note&&<em>{h.note}</em>}</p>)}</div>:null}{cancellable&&<button className="order-cancel" disabled={busy} onClick={cancel}>{busy?"CANCELLING…":"CANCEL ORDER"}</button>}{message&&<p className="order-action-message">{message}</p>}</aside></div>
 </main>
}
