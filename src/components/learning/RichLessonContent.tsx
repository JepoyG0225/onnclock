export function RichLessonContent({ content }: { content: string | null }) {
  if (!content) {
    return <p className="text-sm text-slate-400">No lesson content yet.</p>;
  }

  const isHtml = /<\/?[a-z][\s\S]*>/i.test(content);
  if (!isHtml) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
        {content}
      </div>
    );
  }

  return (
    <div
      className="lesson-rich-content text-sm leading-7 text-gray-700 [&_a]:text-blue-600 [&_a]:underline [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:ml-6 [&_ul]:list-disc"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
