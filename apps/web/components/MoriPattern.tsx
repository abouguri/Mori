import type { CSSProperties, ReactNode } from "react";

export type MoriPatternVariant =
  | "resurface"
  | "growth"
  | "lattice"
  | "deck"
  | "progress"
  | "focus"
  | "grid"
  | "decay";

type PatternStyle = CSSProperties & {
  "--mori-pattern-color"?: string;
  "--mori-pattern-accent"?: string;
  "--mori-pattern-opacity"?: number | string;
  "--mori-pattern-scale"?: number | string;
  "--mori-pattern-density"?: number | string;
  "--mori-pattern-x"?: string;
  "--mori-pattern-y"?: string;
  "--mori-pattern-rotation"?: string;
};

export function MoriPattern({
  variant,
  className = "",
  style,
}: {
  variant: MoriPatternVariant;
  className?: string;
  style?: PatternStyle;
}) {
  return (
    <div
      className={`mori-pattern-layer mori-pattern-${variant} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function MoriPatternPage({
  variant,
  children,
  className = "",
  patternStyle,
}: {
  variant: MoriPatternVariant;
  children: ReactNode;
  className?: string;
  patternStyle?: PatternStyle;
}) {
  return (
    <div className={`mori-pattern-page ${className}`}>
      <MoriPattern variant={variant} style={patternStyle} />
      <div className="mori-pattern-content">{children}</div>
    </div>
  );
}
