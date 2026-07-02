import { cn } from "@/lib/utils";

/** Lottery-ball brand mark: gold gradient sphere with a sparkle. */
export function Logo({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Lotto Stats"
      className={cn("shrink-0", className)}
    >
      <defs>
        <radialGradient id="ball" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="oklch(0.95 0.08 95)" />
          <stop offset="45%" stopColor="oklch(0.84 0.15 84)" />
          <stop offset="100%" stopColor="oklch(0.62 0.16 55)" />
        </radialGradient>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.92 0.12 95)" />
          <stop offset="100%" stopColor="oklch(0.66 0.16 55)" />
        </linearGradient>
      </defs>

      <circle cx="24" cy="24" r="21" fill="url(#ring)" opacity="0.25" />
      <circle
        cx="24"
        cy="24"
        r="18"
        fill="url(#ball)"
        stroke="oklch(0.9 0.1 95 / 0.6)"
        strokeWidth="1"
      />
      {/* top-left highlight */}
      <ellipse cx="18" cy="17" rx="6" ry="4" fill="#fff" opacity="0.35" />
      {/* lucky number */}
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fontSize="16"
        fontWeight="800"
        fill="oklch(0.25 0.03 70)"
        fontFamily="ui-monospace, monospace"
      >
        88
      </text>
      {/* sparkle */}
      <path
        d="M37 9 l1.6 3.4 L42 14 l-3.4 1.6 L37 19 l-1.6-3.4 L32 14 l3.4-1.6 Z"
        fill="oklch(0.92 0.14 95)"
      />
    </svg>
  );
}
