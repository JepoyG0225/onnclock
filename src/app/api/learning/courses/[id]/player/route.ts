import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), lessonId: z.string().min(1) }),
  z.object({
    action: z.literal("quiz"),
    lessonId: z.string().min(1),
    answers: z.record(z.string(), z.coerce.number().int().nonnegative()),
  }),
]);
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const employee = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.userId },
    select: { id: true },
  });
  if (!employee)
    return NextResponse.json(
      { error: "Employee profile not found." },
      { status: 404 },
    );
  const enrollment = await prisma.learningEnrollment.findFirst({
    where: { courseId: id, employeeId: employee.id },
    include: {
      progress: true,
      attempts: { orderBy: { attemptedAt: "desc" } },
      course: {
        include: {
          modules: {
            orderBy: { position: "asc" },
            include: {
              lessons: {
                orderBy: { position: "asc" },
                include: {
                  questions: {
                    orderBy: { position: "asc" },
                    select: {
                      id: true,
                      prompt: true,
                      type: true,
                      options: true,
                      points: true,
                      position: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!enrollment || enrollment.course.status !== "PUBLISHED")
    return NextResponse.json(
      { error: "Course is not available." },
      { status: 404 },
    );
  return NextResponse.json({ enrollment });
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid learning action." },
      { status: 422 },
    );
  const employee = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.userId },
    select: { id: true },
  });
  const enrollment = employee
    ? await prisma.learningEnrollment.findFirst({
        where: { courseId: id, employeeId: employee.id },
        include: { course: true },
      })
    : null;
  if (!enrollment || enrollment.course.status !== "PUBLISHED")
    return NextResponse.json(
      { error: "Course is not available." },
      { status: 404 },
    );
  const lesson = await prisma.learningLesson.findFirst({
    where: { id: parsed.data.lessonId, module: { courseId: id } },
    include: { questions: true },
  });
  if (!lesson)
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  if (
    enrollment.course.sequential &&
    !(await sequenceAllowed(enrollment.id, id, lesson.id))
  )
    return NextResponse.json(
      { error: "Complete the required lessons before this one." },
      { status: 409 },
    );
  if (parsed.data.action === "quiz") {
    if (lesson.type !== "QUIZ")
      return NextResponse.json(
        { error: "This is not a quiz." },
        { status: 422 },
      );
    const attempts = await prisma.quizAttempt.count({
      where: { enrollmentId: enrollment.id, lessonId: lesson.id },
    });
    if (lesson.attemptLimit && attempts >= lesson.attemptLimit)
      return NextResponse.json(
        { error: "Quiz attempt limit reached." },
        { status: 422 },
      );
    const quizAnswers = parsed.data.answers;
    let earned = 0,
      total = 0;
    const results = lesson.questions.map((q) => {
      total += q.points;
      const answer = q.answer as { correctIndex?: number },
        selectedIndex = quizAnswers[q.id],
        correctIndex = answer.correctIndex ?? -1,
        correct = selectedIndex === correctIndex;
      if (correct) earned += q.points;
      return {
        questionId: q.id,
        selectedIndex,
        correctIndex,
        correct,
        explanation: q.explanation,
      };
    });
    const score = total ? Math.round((earned / total) * 10000) / 100 : 0,
      passed = score >= (lesson.passingScore ?? enrollment.course.passingScore);
    await prisma.$transaction([
      prisma.quizAttempt.create({
        data: {
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
          answers: quizAnswers,
          score,
          passed,
        },
      }),
      prisma.lessonProgress.upsert({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: enrollment.id,
            lessonId: lesson.id,
          },
        },
        create: {
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
          status: passed ? "COMPLETED" : "IN_PROGRESS",
          startedAt: new Date(),
          completedAt: passed ? new Date() : null,
        },
        update: {
          status: passed ? "COMPLETED" : "IN_PROGRESS",
          startedAt: new Date(),
          completedAt: passed ? new Date() : null,
        },
      }),
    ]);
    await finish(enrollment.id, id);
    return NextResponse.json({ score, passed, results });
  }
  await prisma.lessonProgress.upsert({
    where: {
      enrollmentId_lessonId: {
        enrollmentId: enrollment.id,
        lessonId: lesson.id,
      },
    },
    create: {
      enrollmentId: enrollment.id,
      lessonId: lesson.id,
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
    },
    update: { status: "COMPLETED", completedAt: new Date() },
  });
  await finish(enrollment.id, id);
  return NextResponse.json({ completed: true });
}
async function sequenceAllowed(
  enrollmentId: string,
  courseId: string,
  lessonId: string,
) {
  const modules = await prisma.learningModule.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    include: {
      lessons: {
        orderBy: { position: "asc" },
        select: { id: true, isRequired: true },
      },
    },
  });
  const ordered = modules.flatMap((m) => m.lessons),
    index = ordered.findIndex((l) => l.id === lessonId);
  if (index <= 0) return true;
  const requiredBefore = ordered
    .slice(0, index)
    .filter((l) => l.isRequired)
    .map((l) => l.id);
  if (!requiredBefore.length) return true;
  const completed = await prisma.lessonProgress.count({
    where: {
      enrollmentId,
      lessonId: { in: requiredBefore },
      status: "COMPLETED",
    },
  });
  return completed === requiredBefore.length;
}
async function finish(enrollmentId: string, courseId: string) {
  const required = await prisma.learningLesson.count({
      where: { module: { courseId }, isRequired: true },
    }),
    done = await prisma.lessonProgress.count({
      where: {
        enrollmentId,
        status: "COMPLETED",
        lesson: { isRequired: true },
      },
    });
  if (!required || done < required) return;
  const enrollment = await prisma.learningEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { course: true },
    }),
    issuedDate = new Date(),
    validityMonths = enrollment.course.validityMonths,
    expiryDate = validityMonths ? new Date(issuedDate) : null;
  if (expiryDate && validityMonths)
    expiryDate.setMonth(expiryDate.getMonth() + validityMonths);
  await prisma.$transaction([
    prisma.learningEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED", completedAt: issuedDate },
    }),
    prisma.employeeCertification.upsert({
      where: {
        employeeId_sourceCourseId: {
          employeeId: enrollment.employeeId,
          sourceCourseId: courseId,
        },
      },
      create: {
        employeeId: enrollment.employeeId,
        sourceCourseId: courseId,
        name: enrollment.course.title,
        issuingBody: enrollment.course.provider || "Internal Learning",
        credentialId: `LMS-${courseId.slice(-6).toUpperCase()}-${enrollment.employeeId.slice(-6).toUpperCase()}`,
        issuedDate,
        expiryDate,
        notes: "Automatically issued after course completion.",
      },
      update: {
        name: enrollment.course.title,
        issuingBody: enrollment.course.provider || "Internal Learning",
        issuedDate,
        expiryDate,
      },
    }),
  ]);
}
