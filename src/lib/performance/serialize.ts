/** Keep Prisma Decimal ratings numeric across the JSON API boundary. */
export function serializeReview<T extends { overallRating: unknown }>(review: T) {
  return {
    ...review,
    overallRating: review.overallRating == null ? null : Number(review.overallRating),
  }
}
