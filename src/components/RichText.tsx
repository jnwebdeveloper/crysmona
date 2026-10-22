import { toSafeHtml } from "../lib/richText";

// Displays text saved by RichTextEditor (or older plain text), cleaned of
// anything the editor can't produce.
export default function RichText({
  value,
  className = "",
  id,
}: {
  value: string | null | undefined;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={("rich-text " + className).trim()}
      dangerouslySetInnerHTML={{ __html: toSafeHtml(value) }}
    />
  );
}
