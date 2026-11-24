import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLearningAuth as requireAuth } from "@/lib/learning/access";
import { prisma } from "@/lib/prisma";
import sanitizeHtml from "sanitize-html";

const managers = new Set(["SUPER_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"]);
const createSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("module"),
    title: z.string().min(1),
    description: z.string().optional(),
  }),
  z.object({
    action: z.literal("lesson"),
    moduleId: z.string().min(1),
    title: z.string().min(1),
    type: z.enum(["TEXT", "VIDEO", "PDF", "LINK", "QUIZ"]),
    content: z.string().optional(),
    resourceUrl: z.string().optional(),
    durationMinutes: z.coerce.number().int().positive().optional(),
    isRequired: z.boolean().default(true),
    passingScore: z.coerce.number().int().min(0).max(100).optional(),
    attemptLimit: z.coerce.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal("updateLesson"),
    lessonId: z.string().min(1),
    title: z.string().min(1),
    type: z.enum(["TEXT", "VIDEO", "PDF", "LINK", "QUIZ"]),
    content: z.string().optional(),
    resourceUrl: z.string().optional(),
    durationMinutes: z.coerce.number().int().positive().optional(),
    isRequired: z.boolean().default(true),
    passingScore: z.coerce.number().int().min(0).max(100).optional(),
    attemptLimit: z.coerce.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal("question"),
    lessonId: z.string().min(1),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correctIndex: z.coerce.number().int().nonnegative(),
    points: z.coerce.number().int().positive().default(1),
    explanation: z.string().optional(),
  }),
  z.object({
    action: z.literal("updateQuestion"),
    questionId: z.string().min(1),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correctIndex: z.coerce.number().int().nonnegative(),
    points: z.coerce.number().int().positive().default(1),
    explanation: z.string().optional(),
  }),
]);
const updateSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  passingScore: z.coerce.number().int().min(0).max(100).optional(),
  sequential: z.boolean().optional(),
});
async function access(id: string, companyId: string) {
  return prisma.learningCourse.findFirst({ where: { id, companyId } });
}

function cleanLessonContent(content?: string) {
  if (!content) return null;
  return sanitizeHtml(content, {
    allowedTags: [
      "p",
      "div",
      "span",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "a",
      "img",
      "font",
    ],
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "style", "width", "height"],
      font: ["face", "size", "color"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedStyles: {
      "*": {
        "text-align": [/^(left|center|right|justify)$/],
        "font-family": [/^[a-zA-Z0-9 ,'-]+$/],
        "font-size": [/^\d+(px|pt|em|rem|%)$/],
        color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb/],
      },
      img: {
        display: [/^(block|inline|inline-block)$/],
        width: [/^\d+(px|%)$/],
        height: [/^(auto|\d+px)$/],
        "margin-left": [/^(auto|0|\d+px)$/],
        "margin-right": [/^(auto|0|\d+px)$/],
        margin: [/^[a-zA-Z0-9 %.-]+$/],
      },
    },
  });
}
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth();
  if (error) return error;
  if (!managers.has(ctx.role))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;
  if (!(await access(id, ctx.companyId)))
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const course = await prisma.learningCourse.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { position: "asc" },
        include: {
          lessons: {
            orderBy: { position: "asc" },
            include: { questions: { orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });
  return NextResponse.json({ course });
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth();
  if (error) return error;
  if (!managers.has(ctx.role))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;
  if (!(await access(id, ctx.companyId)))
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid course content.", details: parsed.error.flatten() },
      { status: 422 },
    );
  const d = parsed.data;
  if (d.action === "module") {
    const position = await prisma.learningModule.count({
      where: { courseId: id },
    });
    return NextResponse.json(
      {
        module: await prisma.learningModule.create({
          data: {
            courseId: id,
            title: d.title,
            description: d.description || null,
            position,
          },
        }),
      },
      { status: 201 },
    );
  }
  if (d.action === "updateLesson") {
    const existing = await prisma.learningLesson.findFirst({
      where: { id: d.lessonId, module: { courseId: id } },
    });
    if (!existing)
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    if (existing.type === "QUIZ" && d.type !== "QUIZ") {
      const attachedQuestions = await prisma.quizQuestion.count({
        where: { lessonId: existing.id },
      });
      if (attachedQuestions > 0)
        return NextResponse.json(
          {
            error:
              "Remove the attached quiz questions before changing this lesson type.",
          },
          { status: 409 },
        );
    }
    return NextResponse.json({
      lesson: await prisma.learningLesson.update({
        where: { id: existing.id },
        data: {
          title: d.title,
          type: d.type,
          content: d.type === "TEXT" ? cleanLessonContent(d.content) : null,
          resourceUrl: d.resourceUrl || null,
          durationMinutes: d.durationMinutes ?? null,
          isRequired: d.isRequired,
          passingScore: d.type === "QUIZ" ? (d.passingScore ?? null) : null,
          attemptLimit: d.type === "QUIZ" ? (d.attemptLimit ?? null) : null,
        },
      }),
    });
  }
  if (d.action === "lesson") {
    const moduleRow = await prisma.learningModule.findFirst({
      where: { id: d.moduleId, courseId: id },
    });
    if (!moduleRow)
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    const position = await prisma.learningLesson.count({
      where: { moduleId: moduleRow.id },
    });
    return NextResponse.json(
      {
        lesson: await prisma.learningLesson.create({
          data: {
            moduleId: moduleRow.id,
            title: d.title,
            type: d.type,
            content: d.type === "TEXT" ? cleanLessonContent(d.content) : null,
            resourceUrl: d.resourceUrl || null,
            durationMinutes: d.durationMinutes,
            isRequired: d.isRequired,
            passingScore: d.passingScore,
            attemptLimit: d.attemptLimit,
            position,
          },
        }),
      },
      { status: 201 },
    );
  }
  if (d.action === "updateQuestion") {
    const existingQuestion = await prisma.quizQuestion.findFirst({
      where: { id: d.questionId, lesson: { module: { courseId: id } } },
    });
    if (!existingQuestion)
      return NextResponse.json(
        { error: "Quiz question not found." },
        { status: 404 },
      );
    if (d.correctIndex >= d.options.length)
      return NextResponse.json(
        { error: "Correct answer is outside the option list." },
        { status: 422 },
      );
    return NextResponse.json({
      question: await prisma.quizQuestion.update({
        where: { id: existingQuestion.id },
        data: {
          prompt: d.prompt,
          options: d.options,
          answer: { correctIndex: d.correctIndex },
          points: d.points,
          explanation: d.explanation || null,
        },
      }),
    });
  }
  const lesson = await prisma.learningLesson.findFirst({
    where: { id: d.lessonId, module: { courseId: id }, type: "QUIZ" },
  });
  if (!lesson)
    return NextResponse.json(
      { error: "Quiz lesson not found." },
      { status: 404 },
    );
  if (d.correctIndex >= d.options.length)
    return NextResponse.json(
      { error: "Correct answer is outside the option list." },
      { status: 422 },
    );
  const position = await prisma.quizQuestion.count({
    where: { lessonId: lesson.id },
  });
  return NextResponse.json(
    {
      question: await prisma.quizQuestion.create({
        data: {
          lessonId: lesson.id,
          prompt: d.prompt,
          options: d.options,
          answer: { correctIndex: d.correctIndex },
          points: d.points,
          explanation: d.explanation || null,
          position,
        },
      }),
    },
    { status: 201 },
  );
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth();
  if (error) return error;
  if (!managers.has(ctx.role))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;
  if (!(await access(id, ctx.companyId)))
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid course settings." },
      { status: 422 },
    );
  if (parsed.data.status === "PUBLISHED") {
    const modules = await prisma.learningModule.count({
        where: { courseId: id },
      }),
      lessons = await prisma.learningLesson.count({
        where: { module: { courseId: id } },
      });
    if (!modules || !lessons)
      return NextResponse.json(
        { error: "Add at least one module and lesson before publishing." },
        { status: 422 },
      );
  }
  return NextResponse.json({
    course: await prisma.learningCourse.update({
      where: { id },
      data: parsed.data,
    }),
  });
}
