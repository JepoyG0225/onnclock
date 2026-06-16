ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "careerBannerUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "careerTagline" TEXT,
  ADD COLUMN IF NOT EXISTS "careerDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "careerSocialFacebook" TEXT,
  ADD COLUMN IF NOT EXISTS "careerSocialLinkedin" TEXT,
  ADD COLUMN IF NOT EXISTS "careerSocialTwitter" TEXT,
  ADD COLUMN IF NOT EXISTS "careerSocialInstagram" TEXT;
