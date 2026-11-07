interface MarkProps {
  size?: number;
}

/* ── CubeMark — the koza brand: one solid isometric cube ─────── */
export function CubeMark({ size = 22 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* top face */}
      <path
        d="M16 3.2 L27.8 9.6 L16 16 L4.2 9.6 Z"
        fill="#FF6363"
        stroke="#FF6363"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* left face */}
      <path
        d="M4.2 9.6 L16 16 L16 28.8 L4.2 22.4 Z"
        fill="#D94848"
        stroke="#D94848"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* right face */}
      <path
        d="M27.8 9.6 L16 16 L16 28.8 L27.8 22.4 Z"
        fill="#A33333"
        stroke="#A33333"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── BoxMark — the box brand: an isometric open crate, blueprint line-art ── */
export function BoxMark({ size = 22 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* outer silhouette */}
      <path
        d="M16 4.4 L28 11 L28 21.4 L16 28 L4 21.4 L4 11 Z"
        fill="rgba(255,99,99,0.07)"
        stroke="#FF6363"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* interior back walls */}
      <path
        d="M8.6 12.4 V19.9 L16 23.6 M23.4 12.4 V19.9 L16 23.6"
        stroke="#FF6363"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* open mouth */}
      <path
        d="M16 8.2 L23.4 12.4 L16 16.6 L8.6 12.4 Z"
        fill="#0b0c0e"
        stroke="#FF6363"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* front corner edge */}
      <path d="M16 16.6 V28" stroke="#FF6363" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── LinkMark — the shortener brand: a two-tone chain link ───── */
export function LinkMark({ size = 22 }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <g strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* upper link — coral */}
        <path
          d="M10.2 13.2a5 5 0 0 0 7.5.5l2.9-2.9a5 5 0 0 0-7.05-7.05l-1.6 1.6"
          stroke="#FF6363"
        />
        {/* lower link — ash */}
        <path
          d="M13.8 10.8a5 5 0 0 0-7.5-.5l-2.9 2.9a5 5 0 0 0 7.05 7.05l1.6-1.6"
          stroke="#B9B9BA"
        />
      </g>
    </svg>
  );
}
