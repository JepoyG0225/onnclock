"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  courseId: string;
  value: string;
  onChange: (value: string) => void;
};

export function RichLessonEditor({ courseId, value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(
    null,
  );

  // Keep the editable DOM intact when the parent echoes an edit back to us.
  // Replacing innerHTML on each render detaches the selected image and caret.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) editor.innerHTML = value;
  }, [value]);

  function command(name: string, commandValue?: string) {
    const imageAlignment = { justifyLeft: "left", justifyCenter: "center", justifyRight: "right" } as const;
    if (selectedImage && editorRef.current?.contains(selectedImage) && name in imageAlignment) {
      changeImage(imageAlignment[name as keyof typeof imageAlignment]);
      return;
    }
    editorRef.current?.focus();
    document.execCommand(name, false, commandValue);
    onChange(editorRef.current?.innerHTML ?? "");
  }

  function changeImage(
    alignment?: "left" | "center" | "right",
    width?: string,
  ) {
    if (!selectedImage || !editorRef.current?.contains(selectedImage))
      return toast.error("Select an image in the editor first.");
    if (width) {
      selectedImage.style.width = width;
      selectedImage.style.height = "auto";
      selectedImage.removeAttribute("width");
      selectedImage.removeAttribute("height");
    }
    if (alignment === "left") {
      selectedImage.style.display = "block";
      selectedImage.style.marginLeft = "0";
      selectedImage.style.marginRight = "auto";
    } else if (alignment === "center") {
      selectedImage.style.display = "block";
      selectedImage.style.marginLeft = "auto";
      selectedImage.style.marginRight = "auto";
    } else if (alignment === "right") {
      selectedImage.style.display = "block";
      selectedImage.style.marginLeft = "auto";
      selectedImage.style.marginRight = "0";
    }
    onChange(editorRef.current?.innerHTML ?? "");
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(
        `/api/learning/courses/${courseId}/builder/image`,
        {
          method: "POST",
          body,
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not upload image");
      command(
        "insertHTML",
        `<img src="${data.url}" alt="${file.name.replace(/[<>\"]/g, "")}" style="display:block;width:50%;height:auto;margin:16px auto" />`,
      );
      toast.success("Image added to lesson");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload image",
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const toolClass = "h-8 w-8";
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 p-2">
        <select
          aria-label="Font family"
          className="h-8 rounded border bg-white px-2 text-xs"
          defaultValue="Arial"
          onChange={(event) => command("fontName", event.target.value)}
        >
          <option>Arial</option>
          <option>Georgia</option>
          <option>Montserrat</option>
          <option>Tahoma</option>
          <option>Times New Roman</option>
          <option>Verdana</option>
        </select>
        <select
          aria-label="Font size"
          className="h-8 rounded border bg-white px-2 text-xs"
          defaultValue="3"
          onChange={(event) => command("fontSize", event.target.value)}
        >
          <option value="1">10</option>
          <option value="2">13</option>
          <option value="3">16</option>
          <option value="4">18</option>
          <option value="5">24</option>
          <option value="6">32</option>
          <option value="7">48</option>
        </select>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {[
          ["bold", Bold, "Bold"],
          ["italic", Italic, "Italic"],
          ["underline", Underline, "Underline"],
          ["justifyLeft", AlignLeft, "Align left"],
          ["justifyCenter", AlignCenter, "Align center"],
          ["justifyRight", AlignRight, "Align right"],
          ["insertUnorderedList", List, "Bulleted list"],
          ["insertOrderedList", ListOrdered, "Numbered list"],
        ].map(([name, Icon, label]) => (
          <Button
            key={String(name)}
            type="button"
            variant="ghost"
            size="icon"
            className={toolClass}
            title={String(label)}
            aria-label={String(label)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(String(name))}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="mr-1 h-4 w-4" />
          {uploading ? "Uploading…" : "Add image"}
        </Button>
      </div>
      {selectedImage && (
        <div onMouseDown={(event) => event.preventDefault()} className="flex flex-wrap items-center gap-2 border-b bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <b>Image:</b>
          <span>Size</span>
          {["25%", "50%", "75%", "100%"].map((width) => (
            <Button
              key={width}
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => changeImage(undefined, width)}
            >
              {width}
            </Button>
          ))}
          <span className="ml-2">Align</span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-7 w-7"
            aria-label="Align image left"
            onClick={() => changeImage("left")}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-7 w-7"
            aria-label="Align image center"
            onClick={() => changeImage("center")}
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-7 w-7"
            aria-label="Align image right"
            onClick={() => changeImage("right")}
          >
            <AlignRight className="h-3.5 w-3.5" />
          </Button>
          <button
            type="button"
            className="ml-auto underline"
            onClick={() => setSelectedImage(null)}
          >
            Done
          </button>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="lesson-rich-content min-h-56 p-4 text-sm leading-7 outline-none [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-pointer [&_img]:rounded [&_img]:ring-blue-500 focus:[&_img]:ring-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_ul]:ml-6 [&_ul]:list-disc"
        data-placeholder="Write your lesson content and add images…"
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onClick={(event) => {
          const target = event.target;
          setSelectedImage(target instanceof HTMLImageElement ? target : null);
        }}
      />
      <p className="border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Select an image in the content to resize or align it.
      </p>
    </div>
  );
}
