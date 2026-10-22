import DOMPurify from "dompurify";

// Rich text is HTML written by the admin's RichTextEditor. Older values are plain
// text with line breaks, so everything here accepts both.

// Tags and attributes the editor can produce; anything else is removed on display.
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "a",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

let hooked = false;
function purifier() {
  if (!hooked) {
    // Links opening a new tab can't reach back into this page.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A" && node.getAttribute("target") === "_blank")
        node.setAttribute("rel", "noopener noreferrer nofollow");
    });
    hooked = true;
  }
  return DOMPurify;
}

// Editor output always starts with a block tag; older plain text doesn't.
export const isRichText = (value: string) =>
  /^\s*<(p|h[1-6]|ul|ol|blockquote|div)[\s>]/i.test(value);

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Plain text → paragraphs: blank lines start a new paragraph, single line breaks stay.
export function plainTextToHtml(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// HTML that is safe to put in the page, from either rich or plain text.
export function toSafeHtml(value: string | null | undefined) {
  if (!value?.trim()) return "";
  const html = isRichText(value) ? value : plainTextToHtml(value);
  return purifier().sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

// Readable text without tags, for previews such as admin lists.
export function richTextToPlain(value: string | null | undefined) {
  if (!value || !isRichText(value)) return value || "";
  // Keep a space between paragraphs, list items and line breaks.
  const spaced = value.replace(/<\/(p|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, "$& ");
  const doc = new DOMParser().parseFromString(spaced, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
