export type StageIconName =
  | "play"
  | "pause"
  | "reset"
  | "sliders"
  | "info"
  | "expand"
  | "shrink"
  | "close"
  | "trash"
  | "step"
  | "shuffle";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round"
} as const;

export function StageIcon({ name }: { name: StageIconName }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {name === "play" ? <path d="M5 3.2v9.6l7.6-4.8z" fill="currentColor" /> : null}
      {name === "pause" ? (
        <>
          <rect x="4" y="3.5" width="2.6" height="9" rx="0.6" fill="currentColor" />
          <rect x="9.4" y="3.5" width="2.6" height="9" rx="0.6" fill="currentColor" />
        </>
      ) : null}
      {name === "step" ? (
        <>
          <path d="M4 3.6v8.8l6-4.4z" fill="currentColor" />
          <rect x="10.8" y="3.6" width="1.8" height="8.8" rx="0.5" fill="currentColor" />
        </>
      ) : null}
      {name === "reset" ? (
        <>
          <path d="M3.4 8.2a4.6 4.6 0 1 0 1.5-3.6" {...STROKE} />
          <path d="M3.3 2.4v3h3" {...STROKE} />
        </>
      ) : null}
      {name === "shuffle" ? (
        <>
          <path d="M2.5 4.5h2.2c3.2 0 3.6 7 6.8 7h2" {...STROKE} />
          <path d="M2.5 11.5h2.2c1.3 0 2.1-1.1 2.7-2.4M9.3 6.7c.6-1.2 1.2-2.2 2.2-2.2h2" {...STROKE} />
          <path d="M12 2.8l1.6 1.7L12 6.2M12 9.8l1.6 1.7-1.6 1.7" {...STROKE} />
        </>
      ) : null}
      {name === "sliders" ? (
        <>
          <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" {...STROKE} />
          <circle cx="10.5" cy="4.5" r="1.7" fill="currentColor" />
          <circle cx="5.5" cy="8" r="1.7" fill="currentColor" />
          <circle cx="9" cy="11.5" r="1.7" fill="currentColor" />
        </>
      ) : null}
      {name === "info" ? (
        <>
          <circle cx="8" cy="8" r="6" {...STROKE} />
          <path d="M8 7.3v3.9" {...STROKE} />
          <circle cx="8" cy="5" r="0.95" fill="currentColor" />
        </>
      ) : null}
      {name === "expand" ? <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" {...STROKE} /> : null}
      {name === "shrink" ? <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" {...STROKE} /> : null}
      {name === "close" ? <path d="M4 4l8 8M12 4l-8 8" {...STROKE} /> : null}
      {name === "trash" ? (
        <>
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" {...STROKE} />
        </>
      ) : null}
    </svg>
  );
}
