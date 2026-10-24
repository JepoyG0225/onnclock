"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
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
  answer: { correctIndex?: number };
  explanation?: string | null;
};
type Lesson = {
  id: string;
  title: string;
  type: string;
  content: string | null;
  resourceUrl: string | null;
  durationMinutes: number | null;
  questions: Question[];
};
type Module = {
  id: string;
  title: string;
  description: string | null;
  lessons: Lesson[];
};
type Course = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sequential: boolean;
  passingScore: number;
  modules: Module[];
};

export function CoursePreviewClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null),
    [active, setActive] = useState<Lesson | null>(null),
    [visited, setVisited] = useState<Set<string>>(new Set()),
    [previewAnswers, setPreviewAnswers] = useState<Record<string, number>>({}),
    [previewResults, setPreviewResults] = useState<
      Record<string, { correct: boolean; correctIndex: number }>
    >({}),
    [quizSummary, setQuizSummary] = useState<{
      score: number;
      passed: boolean;
    } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/learning/courses/${courseId}/builder`)
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (!live) return;
        if (!ok) {
          toast.error(data.error ?? "Could not preview course");
          return;
        }
        setCourse(data.course);
        setActive(
          data.course.modules.flatMap((m: Module) => m.lessons)[0] ?? null,
        );
      });
    return () => {
      live = false;
    };
  }, [courseId]);
  function openLesson(lesson: Lesson) {
    setActive(lesson);
    setPreviewAnswers({});
    setPreviewResults({});
    setQuizSummary(null);
    setVisited((current) => new Set(current).add(lesson.id));
  }
  if (!course)
    return <p className="py-16 text-center">Loading course preview…</p>;
  const lessons = course.modules.flatMap((m) => m.lessons),
    previewProgress = lessons.length
      ? Math.round((visited.size / lessons.length) * 100)
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
  function handleForward() {
    if (!active || !course) return;
    if (active.type === "QUIZ" && !quizSummary) {
      if (Object.keys(previewAnswers).length < active.questions.length) {
        toast.error("Answer every question before continuing.");
        return;
      }
      let earned = 0,
        total = 0;
      const results: Record<
        string,
        { correct: boolean; correctIndex: number }
      > = {};
      for (const question of active.questions) {
        total += question.points;
        const correctIndex = question.answer?.correctIndex ?? -1,
          correct = previewAnswers[question.id] === correctIndex;
        if (correct) earned += question.points;
        results[question.id] = { correct, correctIndex };
      }
      const score = total ? Math.round((earned / total) * 10000) / 100 : 0;
      setPreviewResults(results);
      setQuizSummary({ score, passed: score >= course.passingScore });
      return;
    }
    if (active.type === "QUIZ" && quizSummary && !quizSummary.passed) {
      toast.error("Correct the answers before continuing.");
      return;
    }
    if (isLastLesson) router.push(`/learning/${course.id}/builder`);
    else if (nextLesson) openLesson(nextLesson);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-purple-600">
            <Eye className="h-4 w-4" />
            Learner preview · no progress is saved
          </div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <p className="text-sm text-gray-500">
            {course.status} · Passing score {course.passingScore}% ·{" "}
            {course.sequential ? "Sequential" : "Open navigation"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/learning/${course.id}/builder`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to builder
          </Link>
        </Button>
      </div>
      <div className="h-2 overflow-hidden rounded bg-gray-200">
        <div
          className="h-full bg-[var(--brand-primary)] transition-all"
          style={{ width: `${previewProgress}%` }}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[290px_1fr]">
        <aside className="space-y-4 rounded-xl border bg-white p-3">
          {course.modules.map((module, moduleIndex) => (
            <section key={module.id}>
              <p className="px-2 text-xs font-semibold uppercase text-gray-400">
                Module {moduleIndex + 1}
              </p>
              <h2 className="px-2 text-sm font-bold">{module.title}</h2>
              {module.description && (
                <p className="px-2 py-1 text-xs text-gray-500">
                  {module.description}
                </p>
              )}
              {module.lessons.map((lesson, lessonIndex) => (
                <button
                  key={lesson.id}
                  className={`mt-1 flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm ${active?.id === lesson.id ? "bg-purple-50 text-purple-700" : "hover:bg-gray-50"}`}
                  onClick={() => openLesson(lesson)}
                >
                  {visited.has(lesson.id) ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  <span className="flex-1">
                    {lessonIndex + 1}. {lesson.title}
                  </span>
                  <small>
                    {lesson.durationMinutes
                      ? `${lesson.durationMinutes}m`
                      : lesson.type}
                  </small>
                </button>
              ))}
            </section>
          ))}
        </aside>
        <main className="min-h-[480px] rounded-xl border bg-white p-6">
          {active ? (
            <>
              <div className="mb-5 flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">{active.title}</h2>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                  {active.type}
                </span>
              </div>
              {active.type === "TEXT" && (
                <div className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
                  {active.content || "No lesson content yet."}
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
                  {active.questions.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No questions have been added.
                    </p>
                  ) : (
                    active.questions.map((question, index) => (
                      <fieldset
                        key={question.id}
                        className="rounded-lg border p-4"
                      >
                        <legend className="px-2 text-sm font-semibold">
                          {index + 1}. {question.prompt}
                        </legend>
                        {question.options.map((option, optionIndex) => {
                          const selected =
                            previewAnswers[question.id] === optionIndex;
                          const result = previewResults[question.id];
                          const isCorrectAnswer =
                            result?.correctIndex === optionIndex;
                          const isWrongSelection = Boolean(
                            result && selected && !result.correct,
                          );
                          return (
                            <label
                              key={optionIndex}
                              className={`group mt-2 flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${isCorrectAnswer ? "border-emerald-500 bg-emerald-50 text-emerald-900" : isWrongSelection ? "border-red-500 bg-red-50 text-red-900" : selected ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40"}`}
                            >
                              <input
                                className="sr-only"
                                type="radio"
                                name={`preview-${question.id}`}
                                checked={selected}
                                onChange={() => {
                                  setPreviewAnswers({
                                    ...previewAnswers,
                                    [question.id]: optionIndex,
                                  });
                                  setPreviewResults({});
                                  setQuizSummary(null);
                                }}
                              />
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-slate-50 group-hover:border-blue-400"}`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 rounded-full bg-white ${selected ? "scale-100" : "scale-0"}`}
                                />
                              </span>
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
                              >
                                {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <span className="font-medium">{option}</span>
                            </label>
                          );
                        })}
                        {previewResults[question.id] && (
                          <div
                            className={`mt-3 rounded-lg px-3 py-2 text-sm ${previewResults[question.id].correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                          >
                            <b>
                              {previewResults[question.id].correct
                                ? "Correct"
                                : `Incorrect — correct answer: ${String.fromCharCode(65 + previewResults[question.id].correctIndex)}`}
                            </b>
                            {question.explanation && (
                              <p className="mt-1 text-xs">
                                {question.explanation}
                              </p>
                            )}
                          </div>
                        )}
                      </fieldset>
                    ))
                  )}
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
                </div>
              )}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                <Button
                  disabled={!previousLesson}
                  onClick={() => previousLesson && openLesson(previousLesson)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <div className="flex gap-2">
                  <Button
                    disabled={
                      active.type === "QUIZ" &&
                      !quizSummary &&
                      Object.keys(previewAnswers).length <
                        active.questions.length
                    }
                    onClick={handleForward}
                  >
                    {isLastLesson
                      ? active.type === "QUIZ" && !quizSummary
                        ? "Finish Quiz"
                        : "Finish"
                      : "Next"}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-gray-400">
              Add a lesson to preview the course.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
