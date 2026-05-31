export function SkeletonCard() {
  return (
    <article className="skeleton-card">
      <div className="skeleton-cover" />
      <div className="skeleton-lines">
        <div className="skeleton-line short" />
        <div className="skeleton-line" />
        <div className="skeleton-line medium" />
      </div>
    </article>
  )
}

export function SkeletonStat() {
  return (
    <article className="skeleton-stat">
      <div className="skeleton-line short" />
      <div className="skeleton-line large" />
    </article>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-line" />
        </div>
      ))}
    </>
  )
}
