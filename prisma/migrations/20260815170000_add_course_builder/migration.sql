ALTER TABLE "learning_courses" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "learning_courses" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "learning_courses" ADD COLUMN "passingScore" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "learning_courses" ADD COLUMN "sequential" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "learning_modules" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT, "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_modules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "learning_lessons" (
  "id" TEXT NOT NULL, "moduleId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'TEXT', "content" TEXT, "resourceUrl" TEXT,
  "durationMinutes" INTEGER, "position" INTEGER NOT NULL, "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "passingScore" INTEGER, "attemptLimit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_lessons_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "quiz_questions" (
  "id" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "prompt" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SINGLE_CHOICE', "options" JSONB NOT NULL DEFAULT '[]', "answer" JSONB NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 1, "explanation" TEXT, "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lesson_progress" (
  "id" TEXT NOT NULL, "enrollmentId" TEXT NOT NULL, "lessonId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED', "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "lastPosition" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "quiz_attempts" (
  "id" TEXT NOT NULL, "enrollmentId" TEXT NOT NULL, "lessonId" TEXT NOT NULL,
  "answers" JSONB NOT NULL, "score" DECIMAL(5,2) NOT NULL, "passed" BOOLEAN NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_modules_courseId_position_key" ON "learning_modules"("courseId", "position");
CREATE INDEX "learning_modules_courseId_idx" ON "learning_modules"("courseId");
CREATE UNIQUE INDEX "learning_lessons_moduleId_position_key" ON "learning_lessons"("moduleId", "position");
CREATE INDEX "learning_lessons_moduleId_idx" ON "learning_lessons"("moduleId");
CREATE UNIQUE INDEX "quiz_questions_lessonId_position_key" ON "quiz_questions"("lessonId", "position");
CREATE UNIQUE INDEX "lesson_progress_enrollmentId_lessonId_key" ON "lesson_progress"("enrollmentId", "lessonId");
CREATE INDEX "lesson_progress_lessonId_status_idx" ON "lesson_progress"("lessonId", "status");
CREATE INDEX "quiz_attempts_enrollmentId_lessonId_attemptedAt_idx" ON "quiz_attempts"("enrollmentId", "lessonId", "attemptedAt");

ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_lessons" ADD CONSTRAINT "learning_lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "learning_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "learning_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "learning_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "learning_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "learning_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
