import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireLearningAuth as requireAuth } from "@/lib/learning/access";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const managers = new Set(["SUPER_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"]);
const allowedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth();
  if (error) return error;
  if (!managers.has(ctx.role))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const { id } = await params;
  const course = await prisma.learningCourse.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  });
  if (!course)
    return NextResponse.json({ error: "Course not found." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !allowedTypes.has(file.type))
    return NextResponse.json(
      { error: "Choose a PNG, JPG, WEBP, or GIF image." },
      { status: 422 },
    );
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json(
      { error: "Lesson images must be 5 MB or smaller." },
      { status: 422 },
    );

  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const objectPath = `learning/${ctx.companyId}/${course.id}/${randomUUID()}.${extension}`;
  const bucket =
    process.env.SUPABASE_ATTACHMENTS_BUCKET ||
    process.env.SUPABASE_LOGO_BUCKET ||
    "company-logos";
  const storage = getSupabaseAdmin().storage.from(bucket);
  const uploaded = await storage.upload(
    objectPath,
    Buffer.from(await file.arrayBuffer()),
    { contentType: file.type, upsert: false },
  );
  if (uploaded.error)
    return NextResponse.json(
      { error: `Image upload failed: ${uploaded.error.message}` },
      { status: 500 },
    );

  const url = storage.getPublicUrl(objectPath).data.publicUrl;
  return NextResponse.json({ url }, { status: 201 });
}
