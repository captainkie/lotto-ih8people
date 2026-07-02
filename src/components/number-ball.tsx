import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-8 text-sm",
  md: "size-11 text-lg",
  lg: "size-14 text-2xl",
  xl: "size-20 text-4xl",
} as const;

/**
 * A lottery ball rendering a number, gold gradient when highlighted.
 * `fluid` makes the ball fill its container cell (use inside a grid so a
 * multi-digit number always stays on one line and scales with the width).
 */
export function NumberBall({
  value,
  size = "md",
  highlight = false,
  fluid = false,
  className,
}: {
  value: string | number;
  size?: keyof typeof sizes;
  highlight?: boolean;
  fluid?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tnum inline-flex items-center justify-center rounded-full font-bold tabular-nums",
        fluid ? "aspect-square w-full text-base sm:text-xl md:text-2xl" : sizes[size],
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
