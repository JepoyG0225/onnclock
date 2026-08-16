"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, BookOpen, Eye, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
type Question = {
  id: string;
  prompt: string;
  options: string[];
  answer: { correctIndex?: number };
  points: number;
  explanation: string | null;
};
type Lesson = {
  id: string;
  title: string;
  type: string;
  content: string | null;
  resourceUrl: string | null;
  durationMinutes: number | null;
  passingScore: number | null;
  attemptLimit: number | null;
  isRequired: boolean;
  questions: Question[];
};
type Module = { id: string; title: string; lessons: Lesson[] };
type Course = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  passingScore: number;
  sequential: boolean;
  modules: Module[];
};
export function CourseBuilderClient({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null),
    [moduleTitle, setModuleTitle] = useState(""),
    [lessonModule, setLessonModule] = useState(""),
    [lesson, setLesson] = useState({
      title: "",
      type: "TEXT",
      content: "",
      resourceUrl: "",
      durationMinutes: "",
      passingScore: "70",
      attemptLimit: "",
    }),
    [quizLesson, setQuizLesson] = useState(""),
    [formDialog, setFormDialog] = useState<"module" | "lesson" | null>(null),
    [editingLessonId, setEditingLessonId] = useState<string | null>(null),
    [editingQuestionId, setEditingQuestionId] = useState<string | null>(null),
    [question, setQuestion] = useState({
      prompt: "",
      options: ["", "", "", ""],
      correctIndex: "0",
      points: "1",
      explanation: "",
    });
  async function load() {
    const r = await fetch(`/api/learning/courses/${courseId}/builder`),
      d = await r.json();
    if (!r.ok) return toast.error(d.error ?? "Could not load course");
    setCourse(d.course);
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/learning/courses/${courseId}/builder`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setCourse(d.course ?? null);
      });
    return () => {
      active = false;
    };
  }, [courseId]);
  async function send(body: unknown, method = "POST") {
    const r = await fetch(`/api/learning/courses/${courseId}/builder`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = await r.json();
    if (!r.ok) {
      toast.error(d.error ?? "Could not save content");
      return null;
    }
    toast.success("Course updated");
    void load();
    return d;
  }
  function editLesson(moduleId: string, row: Lesson) {
    setLessonModule(moduleId);
    setEditingLessonId(row.id);
    setEditingQuestionId(null);
    setQuizLesson(row.type === "QUIZ" ? row.id : "");
    setLesson({
      title: row.title,
      type: row.type,
      content: row.content ?? "",
      resourceUrl: row.resourceUrl ?? "",
      durationMinutes: row.durationMinutes?.toString() ?? "",
      passingScore: row.passingScore?.toString() ?? "70",
      attemptLimit: row.attemptLimit?.toString() ?? "",
    });
    setFormDialog("lesson");
  }
  function editQuestion(row: Question) {
    setEditingQuestionId(row.id);
    setQuestion({
      prompt: row.prompt,
      options: [...row.options],
      correctIndex: String(row.answer?.correctIndex ?? 0),
      points: String(row.points ?? 1),
      explanation: row.explanation ?? "",
    });
  }
  if (!course)
    return <p className="py-12 text-center">Loading course builder…</p>;
  const quizzes = course.modules
    .flatMap((m) => m.lessons)
    .filter((l) => l.type === "QUIZ");
  const activeQuiz = quizzes.find((quiz) => quiz.id === editingLessonId);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-600">
            Course builder
          </p>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <p className="text-sm text-gray-500">
            {course.status} · {course.modules.length} modules
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/learning/${course.id}/preview`}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Link>
          </Button>
          <Button
            variant={course.status === "PUBLISHED" ? "outline" : "default"}
            onClick={() =>
              send(
                {
                  status: course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
                },
                "PATCH",
              )
            }
          >
            {course.status === "PUBLISHED" ? "Unpublish" : "Publish course"}
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input
            defaultValue={course.title}
            onBlur={(e) =>
              e.target.value !== course.title &&
              send({ title: e.target.value }, "PATCH")
            }
          />
          <Input
            type="number"
            min="0"
            max="100"
            defaultValue={course.passingScore}
            onBlur={(e) => send({ passingScore: +e.target.value }, "PATCH")}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={course.sequential}
              onChange={(e) => send({ sequential: e.target.checked }, "PATCH")}
            />
            Require lessons in order
          </label>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {course.modules.map((m, mi) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  Module {mi + 1}: {m.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {m.lessons.map((l, li) => (
                  <div key={l.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-sm">
                        {li + 1}. {l.title}
                      </b>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                          {l.type}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => editLesson(m.id, l)}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                    </div>
                    {l.content && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                        {l.content}
                      </p>
                    )}
                    {l.resourceUrl && (
                      <a
                        className="mt-2 block text-xs text-blue-600 underline"
                        href={l.resourceUrl}
                        target="_blank"
                      >
                        Open resource
                      </a>
                    )}
                    {l.type === "QUIZ" && (
                      <p className="mt-2 text-xs text-gray-500">
                        {l.questions.length} questions
                      </p>
                    )}
                  </div>
                ))}
                {m.lessons.length === 0 && (
                  <p className="text-sm text-gray-400">No lessons yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Build course content</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button onClick={() => setFormDialog("module")}>
                <Plus className="mr-2 h-4 w-4" />
                Add module
              </Button>
              <Button
                variant="outline"
                disabled={course.modules.length === 0}
                onClick={() => setFormDialog("lesson")}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Add lesson
              </Button>
              {course.modules.length === 0 && (
                <p className="text-xs text-slate-500">
                  Create a module before adding lessons.
                </p>
              )}
            </CardContent>
          </Card>
          {false && quizLesson && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    Add questions to{" "}
                    {quizzes.find((quiz) => quiz.id === quizLesson)?.title ??
                      "quiz"}
                  </CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Close question editor"
                    onClick={() => setQuizLesson("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="Question"
                  value={question.prompt}
                  onChange={(e) =>
                    setQuestion({ ...question, prompt: e.target.value })
                  }
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">
                      Answer options
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setQuestion({
                          ...question,
                          options: [...question.options, ""],
                        })
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add option
                    </Button>
                  </div>
                  {question.options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <Input
                        aria-label={`Option ${String.fromCharCode(65 + index)}`}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        value={option}
                        onChange={(e) =>
                          setQuestion({
                            ...question,
                            options: question.options.map(
                              (value, optionIndex) =>
                                optionIndex === index ? e.target.value : value,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                        disabled={question.options.length <= 2}
                        onClick={() => {
                          const next = question.options.filter(
                            (_, optionIndex) => optionIndex !== index,
                          );
                          const correct = Number(question.correctIndex);
                          setQuestion({
                            ...question,
                            options: next,
                            correctIndex: String(
                              correct === index
                                ? 0
                                : correct > index
                                  ? correct - 1
                                  : correct,
                            ),
                          });
                        }}
                      >
                        <X className="h-4 w-4 text-slate-500" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">
                    Select the correct answer
                  </p>
                  {question.options.map((option, index) => {
                    const selected = Number(question.correctIndex) === index;
                    return (
                      <label
                        key={`${option}-${index}`}
                        className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all focus-within:ring-2 focus-within:ring-blue-500 ${selected ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 hover:border-blue-300"}`}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="correct-answer"
                          checked={selected}
                          onChange={() =>
                            setQuestion({
                              ...question,
                              correctIndex: String(index),
                            })
                          }
                        />
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full bg-white ${selected ? "scale-100" : "scale-0"}`}
                          />
                        </span>
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${selected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="font-medium">{option}</span>
                      </label>
                    );
                  })}
                </div>
                <Button
                  className="w-full"
                  disabled={
                    !quizLesson ||
                    !question.prompt.trim() ||
                    question.options.some((option) => !option.trim())
                  }
                  onClick={() => {
                    void send({
                      action: "question",
                      lessonId: quizLesson,
                      prompt: question.prompt,
                      options: question.options.map((x) => x.trim()),
                      correctIndex: +question.correctIndex,
                      points: +question.points,
                      explanation: question.explanation,
                    });
                    setQuestion({
                      ...question,
                      prompt: "",
                      options: ["", "", "", ""],
                      correctIndex: "0",
                    });
                  }}
                >
                  Add question
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog
        open={formDialog === "module"}
        onOpenChange={(open) => !open && setFormDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add module</DialogTitle>
            <DialogDescription>
              Create a new section for related lessons.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Module title"
            value={moduleTitle}
            onChange={(e) => setModuleTitle(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!moduleTitle.trim()}
              onClick={() => {
                void send({ action: "module", title: moduleTitle.trim() });
                setModuleTitle("");
                setFormDialog(null);
              }}
            >
              Add module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={formDialog === "lesson"}
        onOpenChange={(open) => {
          if (!open) {
            setFormDialog(null);
            setEditingLessonId(null);
            setEditingQuestionId(null);
            setQuizLesson("");
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingLessonId ? "Edit lesson or quiz" : "Add lesson"}
            </DialogTitle>
            <DialogDescription>
              Add learning content to one of this course&apos;s modules.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {!editingLessonId && (
              <select
                className="h-9 w-full rounded-md border px-3 text-sm"
                value={lessonModule}
                onChange={(e) => setLessonModule(e.target.value)}
              >
                <option value="">Select module</option>
                {course.modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            )}
            <Input
              placeholder="Lesson title"
              value={lesson.title}
              onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
            />
            {lesson.type === "QUIZ" && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Passing score %"
                  value={lesson.passingScore}
                  onChange={(e) =>
                    setLesson({ ...lesson, passingScore: e.target.value })
                  }
                />
                <Input
                  type="number"
                  min="1"
                  placeholder="Attempt limit"
                  value={lesson.attemptLimit}
                  onChange={(e) =>
                    setLesson({ ...lesson, attemptLimit: e.target.value })
                  }
                />
              </div>
            )}
            <select
              className="h-9 w-full rounded-md border px-3 text-sm"
              value={lesson.type}
              disabled={Boolean(activeQuiz?.questions.length)}
              onChange={(e) => setLesson({ ...lesson, type: e.target.value })}
            >
              {["TEXT", "VIDEO", "PDF", "LINK", "QUIZ"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            {lesson.type === "TEXT" ? (
              <textarea
                className="min-h-32 w-full rounded-md border p-3 text-sm"
                placeholder="Lesson content"
                value={lesson.content}
                onChange={(e) =>
                  setLesson({ ...lesson, content: e.target.value })
                }
              />
            ) : (
              lesson.type !== "QUIZ" && (
                <Input
                  placeholder="Video, PDF, or link URL"
                  value={lesson.resourceUrl}
                  onChange={(e) =>
                    setLesson({ ...lesson, resourceUrl: e.target.value })
                  }
                />
              )
            )}
            <Input
              type="number"
              min="1"
              placeholder="Duration in minutes (optional)"
              value={lesson.durationMinutes}
              onChange={(e) =>
                setLesson({ ...lesson, durationMinutes: e.target.value })
              }
            />
            {lesson.type === "QUIZ" && editingLessonId && (
              <div className="mt-2 space-y-3 border-t pt-4">
                {activeQuiz && activeQuiz.questions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Saved questions</h3>
                      <span className="text-xs text-slate-500">
                        {activeQuiz.questions.length} attached to this quiz
                      </span>
                    </div>
                    {activeQuiz.questions.map((savedQuestion, index) => (
                      <div
                        key={savedQuestion.id}
                        className="rounded-xl border bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">
                            {index + 1}. {savedQuestion.prompt}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => editQuestion(savedQuestion)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        </div>
                        <div className="mt-2 grid gap-1">
                          {savedQuestion.options.map((option, optionIndex) => (
                            <div
                              key={optionIndex}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${savedQuestion.answer?.correctIndex === optionIndex ? "bg-emerald-50 font-medium text-emerald-700" : "text-slate-600"}`}
                            >
                              <b>{String.fromCharCode(65 + optionIndex)}</b>
                              <span>{option}</span>
                              {savedQuestion.answer?.correctIndex ===
                                optionIndex && (
                                <span className="ml-auto">Correct</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold">
                    {editingQuestionId
                      ? "Edit quiz question"
                      : "Add questions to this quiz"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Create the question, enter A/B/C/D options, then select the
                    correct answer.
                  </p>
                </div>
                <Input
                  placeholder="Question"
                  value={question.prompt}
                  onChange={(e) =>
                    setQuestion({ ...question, prompt: e.target.value })
                  }
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">
                      Answer options
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setQuestion({
                          ...question,
                          options: [...question.options, ""],
                        })
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add option
                    </Button>
                  </div>
                  {question.options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <Input
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        value={option}
                        onChange={(e) =>
                          setQuestion({
                            ...question,
                            options: question.options.map((value, i) =>
                              i === index ? e.target.value : value,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={question.options.length <= 2}
                        onClick={() => {
                          const next = question.options.filter(
                              (_, i) => i !== index,
                            ),
                            correct = Number(question.correctIndex);
                          setQuestion({
                            ...question,
                            options: next,
                            correctIndex: String(
                              correct === index
                                ? 0
                                : correct > index
                                  ? correct - 1
                                  : correct,
                            ),
                          });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-slate-600">
                    Correct answer
                  </p>
                  {question.options.map((option, index) => {
                    const selected = Number(question.correctIndex) === index;
                    return (
                      <label
                        key={index}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${selected ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="popup-correct-answer"
                          checked={selected}
                          onChange={() =>
                            setQuestion({
                              ...question,
                              correctIndex: String(index),
                            })
                          }
                        />
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full bg-white ${selected ? "scale-100" : "scale-0"}`}
                          />
                        </span>
                        <b>{String.fromCharCode(65 + index)}</b>
                        <span>
                          {option ||
                            `Option ${String.fromCharCode(65 + index)}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    !question.prompt.trim() ||
                    question.options.some((option) => !option.trim())
                  }
                  onClick={async () => {
                    const result = await send({
                      action: editingQuestionId ? "updateQuestion" : "question",
                      ...(editingQuestionId
                        ? { questionId: editingQuestionId }
                        : { lessonId: editingLessonId }),
                      prompt: question.prompt,
                      options: question.options.map((option) => option.trim()),
                      correctIndex: +question.correctIndex,
                      points: +question.points,
                      explanation: question.explanation,
                    });
                    if (result) {
                      setEditingQuestionId(null);
                      setQuestion({
                        ...question,
                        prompt: "",
                        options: ["", "", "", ""],
                        correctIndex: "0",
                      });
                    }
                  }}
                >
                  {editingQuestionId ? "Save question" : "Add question"}
                </Button>
                {editingQuestionId && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingQuestionId(null);
                      setQuestion({
                        ...question,
                        prompt: "",
                        options: ["", "", "", ""],
                        correctIndex: "0",
                        points: "1",
                        explanation: "",
                      });
                    }}
                  >
                    Cancel question edit
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFormDialog(null);
                setEditingLessonId(null);
                setQuizLesson("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!lessonModule || !lesson.title.trim()}
              onClick={async () => {
                const result = await send({
                  action: editingLessonId ? "updateLesson" : "lesson",
                  ...(editingLessonId
                    ? { lessonId: editingLessonId }
                    : { moduleId: lessonModule }),
                  ...lesson,
                  durationMinutes: lesson.durationMinutes
                    ? +lesson.durationMinutes
                    : undefined,
                  passingScore:
                    lesson.type === "QUIZ" ? +lesson.passingScore : undefined,
                  attemptLimit: lesson.attemptLimit
                    ? +lesson.attemptLimit
                    : undefined,
                  isRequired: true,
                });
                if (!result) return;
                if (lesson.type === "QUIZ") {
                  const quizId = editingLessonId ?? result.lesson?.id ?? "";
                  setQuizLesson(quizId);
                  setEditingLessonId(quizId);
                  return;
                }
                setQuizLesson("");
                setLesson({
                  ...lesson,
                  title: "",
                  content: "",
                  resourceUrl: "",
                  durationMinutes: "",
                });
                setEditingLessonId(null);
                setFormDialog(null);
              }}
            >
              {editingLessonId ? "Save changes" : "Add lesson"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
