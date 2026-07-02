import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-8 text-sm",
  md: "size-11 text-lg",
  lg: "size-14 text-2xl",
  xl: "size-20 text-4xl",
} as const;

/** A lottery ball rendering a number, gold gradient when highlighted. */
export function NumberBall({
  value,
  size = "md",
  highlight = false,
  className,
}: {
  value: string | number;
  size?: keyof typeof sizes;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tnum inline-flex items-center justify-center rounded-full font-bold tabular-nums",
        sizes[size],
        highlight
          ? "bg-gradient-to-br from-amber-200 via-primary to-amber-600 text-primary-foreground shadow-[0_4px_20px_-4px] shadow-primary/50"
          : "border border-border bg-card text-foreground",
        className,
      )}
    >
      {value}
    </span>
  );
}
