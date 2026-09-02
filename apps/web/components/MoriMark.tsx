/**
 * The Mori mark — one continuous review path: entry dot -> peak -> valley
 * -> peak -> terminal dot. Hollow (nodeFill) nodes read as checkpoints;
 * solid endpoints read as entry / reinforced memory.
 */
export function MoriMark({
  className,
  nodeFill = "currentColor",
  terminalFill = "currentColor",
}: {
  className?: string;
  nodeFill?: string;
  terminalFill?: string;
}) {
  return (
    // w-auto alone isn't enough here: as a flex child, align-items:stretch
    // still stretches an SVG's cross-axis size unless something forces
    // shrink-to-fit — without w-fit the mark's viewBox gets stretched
    // non-uniformly to fill the row, warping the whole path (confirmed
    // directly: computed width came out at 624px instead of the ~68px its
    // own aspect ratio implies).
    <svg viewBox="0 0 180 105" className={`w-fit shrink-0 ${className ?? ""}`} aria-hidden="true">
      <path
        d="M16 84 L58 38 L100 82 L142 39 L164 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="84" r="9" fill="currentColor" />
      <circle cx="58" cy="38" r="10" fill={nodeFill} stroke="currentColor" strokeWidth="7" />
      <circle cx="100" cy="82" r="11" fill={nodeFill} stroke="currentColor" strokeWidth="7" />
      <circle cx="142" cy="39" r="10" fill={nodeFill} stroke="currentColor" strokeWidth="7" />
      <circle cx="164" cy="26" r="13" fill={terminalFill} />
    </svg>
  );
}
