import { resources } from "./adminSchema.js";
export function adminValidation(resource:string,data:any){const errors:Record<string,string>={};const fields=resources[resource]?.fields||[];for(const f of fields){const v=data?.[f.key];const text=typeof v==="string"?v.trim():v;if(f.required&&(text===null||text===undefined||text===""))errors[f.key]=`${f.label} is required.`;if(typeof text==="string"&&text.length>5000)errors[f.key]=`${f.label} is too long.`;if(f.type==="number"&&text!==null&&text!==undefined&&text!==""&&(!Number.isSafeInteger(Number(text))||Number(text)<0))errors[f.key]=`${f.label} must be a non-negative whole number.`;if(f.options&&text&&!f.options.includes(text))errors[f.key]=`Choose a valid ${f.label}.`;}
for(const k of ["email"]){const v=String(data?.[k]||"").trim();if(v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))errors[k]="Enter a valid email address.";}
for(const k of ["phone"]){const v=String(data?.[k]||"").trim();if(v&&!/^\+?[0-9][0-9 ()-]{6,19}$/.test(v))errors[k]="Enter a valid phone number.";}
if(data?.slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug))errors.slug="Use lowercase words separated by hyphens.";
if(resource==="seo_pages"&&data?.path&&!/^\/(?:[^\s?#]*)?$/.test(data.path))errors.path="Path must start with / and contain no spaces, query or fragment.";
for(const k of ["image_url","og_image","url","cta_url"]){const v=String(data?.[k]||"").trim();if(v&&!((v.startsWith("/")&&!v.startsWith("//"))||/^https:\/\//i.test(v)))errors[k]="Use a relative path or HTTPS URL.";}
for(const k of ["starts_at","ends_at"]){const v=data?.[k];if(v&&Number.isNaN(Date.parse(v)))errors[k]="Enter a valid date/time.";}
if(data?.starts_at&&data?.ends_at&&!errors.starts_at&&!errors.ends_at&&Date.parse(data.ends_at)<=Date.parse(data.starts_at))errors.ends_at="End date must be after start date.";
if(resource==="coupons"&&data?.discount_type==="percent"&&Number(data?.discount_value)>100)errors.discount_value="Percentage cannot exceed 100.";
if(resource==="reviews"&&data?.rating!=null&&(Number(data.rating)<1||Number(data.rating)>5))errors.rating="Rating must be between 1 and 5.";
if(resource==="orders"&&["subtotal_cents","shipping_cents","discount_cents","total_cents"].some(k=>Number(data?.[k]||0)<0))errors.total_cents="Order amounts cannot be negative.";
return errors;}
