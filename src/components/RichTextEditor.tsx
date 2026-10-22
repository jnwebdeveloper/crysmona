import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Italic,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { isRichText, plainTextToHtml } from "../lib/richText";

// Reusable rich text field (Tiptap, free core). Works like a controlled input:
// `value` is HTML (older plain text is converted on load) and `onChange`
// receives HTML, or "" when the editor is empty. Display saved values with
// <RichText />, which cleans them first.
type Props = {
  value: string | null | undefined;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
};

const toEditorHtml = (value: string | null | undefined) =>
  !value ? "" : isRichText(value) ? value : plainTextToHtml(value);

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write here…",
  label = "Rich text editor",
  disabled = false,
}: Props) {
  // The last HTML this editor reported, so outside changes can be told apart
  // from the editor's own updates.
  const emitted = useRef(toEditorHtml(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["https", "http", "mailto", "tel"],
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: emitted.current,
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { "aria-label": label, "aria-multiline": "true", role: "textbox" } },
    onUpdate: ({ editor }) => {
      // Drop the empty paragraph Tiptap keeps after a final list or quote.
      const html = editor.isEmpty
        ? ""
        : editor.getHTML().replace(/(<p><\/p>)+$/, "");
      emitted.current = html;
      onChangeRef.current(html);
    },
  });
  // Load values set from outside (e.g. a record that finished loading).
  useEffect(() => {
    if (!editor) return;
    const next = toEditorHtml(value);
    if (next !== emitted.current) {
      emitted.current = next;
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  return (
    <div className={"rte" + (disabled ? " rte-disabled" : "")}>
      {editor && <Toolbar editor={editor} disabled={disabled} />}
      <EditorContent editor={editor} className="rte-content rich-text" />
    </div>
  );
}

type Level = 1 | 2 | 3 | 4 | 5 | 6;
const levels: Level[] = [1, 2, 3, 4, 5, 6];

function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const chain = () => editor.chain().focus();
  const editLink = () => {
    const current = editor.getAttributes("link").href || "";
    const url = window.prompt("Link address (https://…)", current);
    if (url === null) return;
    if (!url.trim()) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  const button = (
    title: string,
    icon: ReactNode,
    run: () => void,
    active = false,
    enabled = true,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled || !enabled}
      // Keep the text selection while clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon}
    </button>
  );
  return (
    <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
      {button("Bold", <Bold />, () => chain().toggleBold().run(), editor.isActive("bold"))}
      {button("Italic", <Italic />, () => chain().toggleItalic().run(), editor.isActive("italic"))}
      {button("Underline", <Underline />, () => chain().toggleUnderline().run(), editor.isActive("underline"))}
      {button("Strikethrough", <Strikethrough />, () => chain().toggleStrike().run(), editor.isActive("strike"))}
      <span className="rte-sep" aria-hidden="true" />
      <select
        className="rte-block"
        aria-label="Text style"
        title="Text style"
        disabled={disabled}
        value={String(levels.find((level) => editor.isActive("heading", { level })) ?? 0)}
        onChange={(e) => {
          const level = Number(e.target.value) as Level;
          if (level) chain().setHeading({ level }).run();
          else chain().setParagraph().run();
        }}
      >
        <option value="0">Paragraph</option>
        {levels.map((level) => (
          <option key={level} value={level}>
            Heading {level}
          </option>
        ))}
      </select>
      {button("Bulleted list", <List />, () => chain().toggleBulletList().run(), editor.isActive("bulletList"))}
      {button("Numbered list", <ListOrdered />, () => chain().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {button("Quote", <Quote />, () => chain().toggleBlockquote().run(), editor.isActive("blockquote"))}
      <span className="rte-sep" aria-hidden="true" />
      {button("Add or edit link", <Link />, editLink, editor.isActive("link"))}
      {button("Remove link", <Link2Off />, () => chain().extendMarkRange("link").unsetLink().run(), false, editor.isActive("link"))}
      {button("Clear formatting", <RemoveFormatting />, () => chain().unsetAllMarks().clearNodes().run())}
      <span className="rte-sep" aria-hidden="true" />
      {button("Undo", <Undo2 />, () => chain().undo().run(), false, editor.can().undo())}
      {button("Redo", <Redo2 />, () => chain().redo().run(), false, editor.can().redo())}
    </div>
  );
}
