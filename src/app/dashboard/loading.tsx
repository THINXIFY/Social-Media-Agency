function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-muted motion-reduce:animate-none ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[90rem] px-4 py-5 sm:px-6 sm:py-7 lg:px-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(21rem,24rem)]">
        <div className="flex flex-col gap-4 sm:gap-5">
          <Block className="h-52" />
          <Block className="h-40" />
          <Block className="h-80" />
        </div>
        <div className="flex flex-col gap-4 sm:gap-5">
          <Block className="h-72 bg-graphite/15" />
          <Block className="h-96" />
        </div>
      </div>
    </div>
  );
}
