"use client";

// 极简图文编辑器：加粗、列表、插入/粘贴/拖拽图片。无音视频。
import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { useRef, useState } from "react";
import { AV_REJECT_MESSAGE, isAudioVideo } from "@/lib/file-rules";

interface Props {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  note?: string;
  onChange?: (html: string) => void;
}

async function uploadImage(file: File): Promise<string> {
  if (isAudioVideo(file.name, file.type)) throw new Error(AV_REJECT_MESSAGE);
  if (!file.type.startsWith("image/")) throw new Error("正文只能插入图片");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", "rich");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !json.ok || !json.url) throw new Error(json.error ?? "上传失败");
  return json.url;
}

export default function RichEditor({ name, defaultValue = "", placeholder, note, onChange }: Props) {
  const [html, setHtml] = useState(defaultValue);
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const insertFiles = async (files: File[]) => {
    const ed = editorRef.current;
    if (!ed || !files.length) return;
    for (const f of files) {
      try {
        setMsg({ text: `正在上传 ${f.name}…`, err: false });
        const url = await uploadImage(f);
        ed.chain().focus().setImage({ src: url, alt: f.name }).run();
        setMsg(null);
      } catch (e) {
        setMsg({ text: e instanceof Error ? e.message : "上传失败", err: true });
      }
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false, link: false }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: defaultValue,
    editorProps: {
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.length) return false;
        void insertFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
        if (!files.length) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
    },
    onUpdate: ({ editor: ed }) => {
      const v = ed.isEmpty ? "" : ed.getHTML();
      setHtml(v);
      onChange?.(v);
    },
  });

  const btn = (label: string, active: boolean, run: () => void) => (
    <button type="button" aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );

  return (
    <div className="editor">
      <div className="editor-bar">
        {btn("加粗", !!editor?.isActive("bold"), () => editor?.chain().focus().toggleBold().run())}
        {btn("列表", !!editor?.isActive("bulletList"), () => editor?.chain().focus().toggleBulletList().run())}
        {btn("编号", !!editor?.isActive("orderedList"), () => editor?.chain().focus().toggleOrderedList().run())}
        {btn("插入图片", false, () => fileRef.current?.click())}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          hidden
          multiple
          onChange={(e) => {
            void insertFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="editor-body">
        <EditorContent editor={editor} />
      </div>
      {msg ? <div className={`editor-note${msg.err ? " err" : ""}`}>{msg.text}</div> : note ? <div className="editor-note">{note}</div> : null}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
