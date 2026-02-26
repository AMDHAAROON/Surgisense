import { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  kicker,
  title,
  subtitle,
  right,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
      <div>
        {kicker && (
          <p className={cn("mono text-xs uppercase tracking-[0.24em] text-muted-foreground")}>
            {kicker}
          </p>
        )}
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold headline-glow">{title}</h2>
        {subtitle && <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl">{subtitle}</p>}
      </div>
      {right ? <div className="flex items-center justify-start md:justify-end">{right}</div> : null}
    </div>
  );
}

export function SectionFrame({ children }: PropsWithChildren) {
  return (
    <section className="float-in-delayed mt-6 rounded-2xl border bg-card/55 backdrop-blur shadow-[var(--shadow-md)] grain">
      <div className="relative p-5 sm:p-6 lg:p-7">{children}</div>
    </section>
  );
}
