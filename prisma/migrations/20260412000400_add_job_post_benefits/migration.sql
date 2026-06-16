ALTER TABLE "job_posts"
ADD COLUMN "benefits" JSONB NOT NULL DEFAULT '[]'::jsonb;
