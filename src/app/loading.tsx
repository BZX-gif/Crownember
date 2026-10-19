export default function Loading() {
  return (
    <div className="page-shell py-10 sm:py-12" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="skeleton h-2.5 w-20 rounded" />
        <div className="skeleton h-8 w-2/3 max-w-md rounded" />
        <div className="skeleton h-3 w-1/2 max-w-sm rounded" />
      </div>
      <div className="mt-9 divide-y divide-line border-y border-line">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="py-5">
            <div className="flex items-center gap-3">
              <div className="skeleton h-8 w-8 rounded-full" />
              <div className="skeleton h-2.5 w-32 rounded" />
              <div className="skeleton ml-auto h-2 w-12 rounded" />
            </div>
            <div className="skeleton mt-3 h-4 w-3/4 rounded" />
            <div className="skeleton mt-2 h-3 w-full max-w-lg rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
