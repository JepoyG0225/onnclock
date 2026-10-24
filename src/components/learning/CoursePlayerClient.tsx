"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
type Question = {
  id: string;
  prompt: string;
  options: string[];
  points: number;
};
type Lesson = {
  id: string;
  title: string;
  type: string;
  content: string | null;
  resourceUrl: string | null;
  questions: Question[];
  isRequired: boolean;
};
type Module = { id: string; title: string; lessons: Lesson[] };
type Progress = { lessonId: string; status: string };
type QuizResult = {
  questionId: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string | null;
};
type Enrollment = {
  id: string;
  status: string;
  progress: Progress[];
  course: { title: string; sequential: boolean; modules: Module[] };
};
export function CoursePlayerClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Enrollment | null>(null),
    [active, setActive] = useState<Lesson | null>(null),
    [answers, setAnswers] = useState<Record<string, number>>({}),
    [quizResults, setQuizResults] = useState<Record<string, QuizResult>>({}),
    [quizSummary, setQuizSummary] = useState<{
      score: number;
      passed: boolean;
    } | null>(null);
  async function load() {
    const r = await fetch(`/api/learning/courses/${courseId}/player`),
      d = await r.json();
    if (!r.ok) return toast.error(d.error ?? "Could not load course");
    setData(d.enrollment);
    const lessons = d.enrollment.course.modules.flatMap(
      (m: Module) => m.lessons,
    );
    setActive((current: Lesson | null) => current ?? lessons[0] ?? null);
  }
  useEffect(() => {
    let live = true;
    fetch(`/api/learning/courses/${courseId}/player`)
      .then((r) => r.json())
      .then((d) => {
        if (live && d.enrollment) {
          setData(d.enrollment);
          setActive(
            d.enrollment.course.modules.flatMap((m: Module) => m.lessons)[0] ??
              null,
          );
        }
      });
    return () => {
      live = false;
    };
  }, [courseId]);
  if (!data) return <p className="py-12 text-center">Loading course…</p>;
  const lessons = data.course.modules.flatMap((m) => m.lessons),
    done = new Set(
      data.progress
        .filter((p) => p.status === "COMPLETED")
        .map((p) => p.lessonId),
    ),
    progress = lessons.length
      ? Math.round((done.size / lessons.length) * 100)
      : 0,
    activeIndex = active
      ? lessons.findIndex((lesson) => lesson.id === active.id)
      : -1,
    previousLesson = activeIndex > 0 ? lessons[activeIndex - 1] : null,
    nextLesson =
      activeIndex >= 0 && activeIndex < lessons.length - 1
        ? lessons[activeIndex + 1]
        : null,
    isLastLesson = activeIndex >= 0 && activeIndex === lessons.length - 1;
  function navigate(lesson: Lesson | null) {
    if (!lesson) return;
    setActive(lesson);
    setAnswers({});
    setQuizResults({});
    setQuizSummary(null);
  }
  async function submit(action: "complete" | "quiz") {
    if (!active) return;
    const r = await fetch(`/api/learning/courses/${courseId}/player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          lessonId: active.id,
          ...(action === "quiz" ? { answers } : {}),
        }),
      }),
      d = await r.json();
    if (!r.ok) return toast.error(d.error ?? "Could not save progress");
    if (action === "quiz") {
      setQuizResults(
        Object.fromEntries(
          (d.results as QuizResult[]).map((result) => [
            result.questionId,
            result,
          ]),
        ),
      );
      setQuizSummary({ score: d.score, passed: d.passed });
    }
    toast.success(
      action === "quiz"
        ? `${d.passed ? "Passed" : "Not passed"} · ${d.score}%`
        : "Lesson completed",
    );
    void load();
  }
  async function handleForward() {
    if (!active || !data) return;
    if (active.type === "QUIZ" && !done.has(active.id)) {
      if (Object.keys(answers).length < active.questions.length) {
        toast.error("Answer every question before continuing.");
        return;
      }
      await submit("quiz");
      return;
    }
    if (isLastLesson) {
      if (data.status === "COMPLETED") router.push("/portal/learning");
      else toast.error("Complete this lesson before finishing the course.");
      return;
    }
    if (data.course.sequential && !done.has(active.id)) {
      toast.error("Complete this lesson before continuing.");
      return;
    }
    navigate(nextLesson);
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{data.course.title}</h1>
        <div className="mt-2 h-2 overflow-hidden rounded bg-gray-200">
          <div
            className="h-full bg-[var(--brand-primary)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {progress}% complete · {data.status}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 rounded-xl border bg-white p-3">
          {data.course.modules.map((m) => (
            <div key={m.id}>
              <b className="text-sm">{m.title}</b>
              {m.lessons.map((l) => (
                <button
                  key={l.id}
                  className={`mt-1 flex w-full items-center gap-2 rounded p-2 text-left text-sm ${active?.id === l.id ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}
                  onClick={() => {
                    setActive(l);
                    setAnswers({});
                    setQuizResults({});
                    setQuizSummary(null);
                  }}
                >
                  {done.has(l.id) ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  {l.title}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <main className="min-h-[420px] rounded-xl border bg-white p-6">
          {active && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">{active.title}</h2>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                  {active.type}
                </span>
              </div>
              {active.type === "TEXT" && (
                <div className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
                  {active.content}
                </div>
              )}
              {active.type === "VIDEO" && active.resourceUrl && (
                <div className="aspect-video overflow-hidden rounded-lg bg-black">
                  <iframe
                    className="h-full w-full"
                    src={active.resourceUrl}
                    title={active.title}
                    allowFullScreen
                  />
                </div>
              )}
              {active.type === "PDF" && active.resourceUrl && (
                <iframe
                  className="h-[600px] w-full rounded border"
                  src={active.resourceUrl}
                  title={active.title}
                />
              )}{" "}
              {active.type === "LINK" && active.resourceUrl && (
                <a
                  className="text-blue-600 underline"
                  href={active.resourceUrl}
                  target="_blank"
                >
                  Open learning resource
                </a>
              )}
              {active.type === "QUIZ" && (
                <div className="space-y-5">
                  {active.questions.map((q, i) => (
                    <fieldset key={q.id} className="rounded-xl border p-4">
                      <legend className="px-2 text-sm font-semibold">
                        {i + 1}. {q.prompt}
                      </legend>
                      <div className="mt-2 grid gap-2">
                        {q.options.map((option, index) => {
                          const selected = answers[q.id] === index;
                          const result = quizResults[q.id];
                          const isCorrectAnswer =
                            result?.correctIndex === index;
                          const isWrongSelection = Boolean(
                            result && selected && !result.correct,
                          );
                          return (
                            <label
                              key={index}
                              className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${isCorrectAnswer ? "border-emerald-500 bg-emerald-50 text-emerald-900" : isWrongSelection ? "border-red-500 bg-red-50 text-red-900" : selected ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40"}`}
                            >
                              <input
                                className="peer sr-only"
                                type="radio"
                                name={q.id}
                                checked={selected}
                                onChange={() => {
                                  setAnswers({ ...answers, [q.id]: index });
                                  if (quizResults[q.id])
                                    setQuizResults((current) => {
                                      const next = { ...current };
                                      delete next[q.id];
                                      return next;
                                    });
                                  setQuizSummary(null);
                                }}
                              />
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${isCorrectAnswer ? "border-emerald-600 bg-emerald-600" : isWrongSelection ? "border-red-600 bg-red-600" : selected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-slate-50 group-hover:border-blue-400"}`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 rounded-full bg-white transition-transform ${selected || isCorrectAnswer ? "scale-100" : "scale-0"}`}
                                />
                              </span>
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
                              >
                                {String.fromCharCode(65 + index)}
                              </span>
                              <span className="font-medium">{option}</span>
                            </label>
                          );
                        })}
                      </div>
                      {quizResults[q.id] && (
                        <div
                          className={`mt-3 rounded-lg px-3 py-2 text-sm ${quizResults[q.id].correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                        >
                          <b>
                            {quizResults[q.id].correct
                              ? "Correct"
                              : `Incorrect — correct answer: ${String.fromCharCode(65 + quizResults[q.id].correctIndex)}`}
                          </b>
                          {quizResults[q.id].explanation && (
                            <p className="mt-1 text-xs opacity-80">
                              {quizResults[q.id].explanation}
                            </p>
                          )}
                        </div>
                      )}
                    </fieldset>
                  ))}
                </div>
              )}
              {active.type === "QUIZ" && quizSummary && (
                <div
                  className={`mt-5 rounded-xl border px-4 py-3 ${quizSummary.passed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
                >
                  <p className="text-sm font-semibold">
                    {quizSummary.passed ? "Quiz passed" : "Quiz not passed"}
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {quizSummary.score}%
                  </p>
                  <p className="text-xs">
                    {quizSummary.passed
                      ? "You can now finish the course."
                      : "Review the answers above and try again."}
                  </p>
                </div>
              )}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                <Button
                  disabled={!previousLesson}
                  onClick={() => navigate(previousLesson)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <div className="flex gap-2">
                  <Button
                    disabled={
                      done.has(active.id) ||
                      (active.type === "QUIZ" &&
                        Object.keys(answers).length < active.questions.length)
                    }
                    onClick={() =>
                      submit(active.type === "QUIZ" ? "quiz" : "complete")
                    }
                  >
                    {done.has(active.id)
                      ? "Completed"
                      : active.type === "QUIZ"
                        ? "Submit quiz"
                        : "Mark complete"}
                  </Button>
                  <Button
                    disabled={
                      isLastLesson
                        ? active.type === "QUIZ" && !done.has(active.id)
                          ? Object.keys(answers).length <
                            active.questions.length
                          : data.status !== "COMPLETED"
                        : !nextLesson ||
                          (active.type === "QUIZ" && !done.has(active.id)
                            ? Object.keys(answers).length <
                              active.questions.length
                            : data.course.sequential && !done.has(active.id))
                    }
                    onClick={handleForward}
                  >
                    {isLastLesson
                      ? active.type === "QUIZ" && !done.has(active.id)
                        ? "Finish Quiz"
                        : "Finish"
                      : "Next"}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
