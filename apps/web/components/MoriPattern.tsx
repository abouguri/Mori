import type { CSSProperties, ReactNode } from "react";

export type MoriPatternVariant =
  | "synapse-river"
  | "forgetting-topography"
  | "interval-bloom"
  | "constellation-memory"
  | "recall-current"
  | "mnemonic-weave"
  | "knowledge-canopy"
  | "echo-architecture"
  | "retention-aurora"
  | "card-cascade"
  | "temporal-orbits"
  | "threshold-field"
  | "signal-noise"
  | "mori-drift";

type PatternStyle = CSSProperties & {
  "--mori-pattern-color"?: string;
  "--mori-pattern-accent"?: string;
  "--mori-pattern-opacity"?: number | string;
  "--mori-pattern-scale"?: number | string;
  "--mori-pattern-density"?: number | string;
  "--mori-pattern-speed"?: number | string;
  "--mori-pattern-x"?: string;
  "--mori-pattern-y"?: string;
  "--mori-pattern-rotation"?: string;
};

type CascadeStyle = CSSProperties & {
  "--cascade-left": string;
  "--cascade-top": string;
  "--cascade-rotation": string;
  "--cascade-delay": string;
};

const topographyPaths = Array.from({ length: 11 }, (_, n) =>
  `M${-100 - n * 7} ${520 + n * 9}C${120 - n * 8} ${260 - n * 4} ${240 + n * 13} ${690 - n * 20} ${475 + n * 7} ${400 - n * 4}S${760 - n * 8} ${110 + n * 14} ${915 + n * 6} ${330 - n * 4} ${1170 - n * 9} ${510 + n * 10} ${1320 + n * 3} ${230 + n * 8}`
);

const currentPaths = Array.from({ length: 9 }, (_, n) =>
  `M-120 ${90 + n * 70}C110 ${-30 + n * 74} 260 ${230 + n * 52} 480 ${90 + n * 70}S840 ${-40 + n * 75} 1050 ${92 + n * 68} 1320 ${200 + n * 52} 1450 ${20 + n * 70}`
);

const orbitData = [
  [490, 190, -20],
  [390, 145, -7],
  [285, 105, 6],
  [180, 70, 19],
];

function PatternArtwork({ variant }: { variant: MoriPatternVariant }) {
  switch (variant) {
    case "synapse-river":
      return (
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
          <g fill="none" stroke="currentColor">
            <path className="mori-stroke river-echo" d="M-80 540C160 630 184 206 430 326S720 630 920 330 1100 130 1300 170" />
            <path className="mori-stroke river-echo" d="M-90 590C150 680 200 258 442 374S740 674 942 372 1118 174 1310 214" />
            <path className="mori-stroke river-main" d="M-60 490C120 570 172 160 410 278S690 584 894 286 1080 86 1280 126" />
          </g>
          <g className="river-nodes">
            <circle className="mori-node" cx="170" cy="392" r="8" />
            <circle className="mori-node" cx="410" cy="278" r="9" />
            <circle className="mori-node" cx="686" cy="483" r="9" />
            <circle className="mori-node" cx="894" cy="286" r="9" />
            <circle className="mori-accent-node" cx="1083" cy="112" r="12" />
          </g>
        </svg>
      );
    case "forgetting-topography":
      return (
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
          <g className="topography-lines" fill="none" stroke="currentColor">
            {topographyPaths.map((path, index) => <path key={index} className="mori-stroke" d={path} />)}
          </g>
          <circle className="mori-accent-node topography-summit" cx="917" cy="332" r="9" />
        </svg>
      );
    case "constellation-memory":
      return (
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
          <g className="constellation-links" fill="none" stroke="currentColor">
            <path className="mori-stroke" d="M50 530 170 340 290 440 420 190 552 302 678 132 770 390 930 250 1130 92M170 340 420 190M290 440 552 302M552 302 770 390M678 132 930 250M770 390 1130 92" />
          </g>
          <path className="mori-stroke constellation-route" d="M50 530 170 340 290 440 420 190 552 302 678 132 770 390 930 250 1130 92" />
          {[[50,530],[170,340],[290,440],[420,190],[552,302],[678,132],[770,390],[930,250],[1130,92],[1040,510],[350,610],[820,570]].map(([x, y], index) => (
            <circle key={`${x}-${y}`} className={index === 8 ? "constellation-star constellation-hot" : "constellation-star"} cx={x} cy={y} r={index === 8 ? 11 : (index % 3) + 3} />
          ))}
        </svg>
      );
    case "recall-current":
      return (
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
          <g className="current-lines" fill="none" stroke="currentColor">
            {currentPaths.map((path, index) => <path key={index} className="mori-stroke" d={path} />)}
          </g>
        </svg>
      );
    case "knowledge-canopy":
      return (
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
          <g className="canopy-branches" fill="none" stroke="currentColor">
            <path className="mori-stroke" d="M70 690C210 590 245 485 310 390S470 250 590 360 710 530 790 380 890 210 1130 70" />
            <path className="mori-stroke" d="M310 390 210 250M590 360 535 180M790 380 920 470M870 244 810 110" />
          </g>
          <g className="canopy-twigs" fill="none" stroke="currentColor">
            <path className="mori-stroke" d="M210 250 120 205M210 250 250 135M535 180 450 98M535 180 650 72M920 470 1030 420M920 470 1010 565M810 110 730 45" />
          </g>
          {[[120,205],[250,135],[450,98],[650,72],[1030,420],[1010,565],[730,45],[1130,70]].map(([x, y]) => (
            <circle key={`${x}-${y}`} className="canopy-leaf" cx={x} cy={y} r="8" />
          ))}
        </svg>
      );
    case "card-cascade":
      return (
        <div className="cascade-field">
          {Array.from({ length: 7 }, (_, index) => (
            <span
              key={index}
              className="cascade-card"
              style={{
                "--cascade-left": `${4 + index * 14}%`,
                "--cascade-top": `${8 + (index % 3) * 21}%`,
                "--cascade-rotation": `${-15 + index * 5}deg`,
                "--cascade-delay": `${index * -1.1}s`,
              } as CascadeStyle}
            />
          ))}
        </div>
      );
    case "temporal-orbits":
      return (
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
          <g fill="none" stroke="currentColor">
            {orbitData.map(([rx, ry, rotation], index) => (
              <ellipse key={rx} className={`temporal-orbit orbit-${index + 1}`} cx="680" cy="350" rx={rx} ry={ry} transform={`rotate(${rotation} 680 350)`} />
            ))}
            <g className="orbit-ticks">
              {Array.from({ length: 24 }, (_, index) => (
                <path key={index} className="mori-stroke" d={`M680 50v${index % 4 === 0 ? 18 : 9}`} transform={`rotate(${index * 15} 680 350)`} />
              ))}
            </g>
          </g>
          <circle className="mori-accent-node orbit-planet" cx="1080" cy="182" r="10" />
          <circle cx="680" cy="350" r="6" fill="currentColor" opacity=".5" />
        </svg>
      );
    case "mori-drift":
      return (
        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
          {[-140, 130, 400, 670, 940].map((x, index) => (
            <g key={x} transform={`translate(${x} ${index % 2 ? 210 : -20}) scale(1.35)`}>
              <path className="drift-path" d="M16 84 58 38l42 44 42-43 22-13" />
              <circle className="drift-node" cx="58" cy="38" r="9" />
              <circle className="drift-node" cx="100" cy="82" r="9" />
              <circle className="mori-accent-node" cx="164" cy="26" r="11" />
            </g>
          ))}
        </svg>
      );
    default:
      return null;
  }
}

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
      className={`mori-creative-pattern-layer mori-creative-pattern-${variant} ${className}`}
      style={style}
      aria-hidden="true"
    >
      <div className="mori-creative-pattern-art">
        <PatternArtwork variant={variant} />
      </div>
    </div>
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
