import type { RoiRect } from "@/lib/camera/quality";

interface Props {
  roi: RoiRect;
  ready: boolean;
}

/** SVG oval guide showing ROI bounds. */
export function FaceGuideOverlay({ roi, ready }: Props) {
  const cx = (roi.x + roi.w / 2) * 100;
  const cy = (roi.y + roi.h / 2) * 100;
  const rx = (roi.w / 2) * 100;
  const ry = (roi.h / 2) * 100;
  const stroke = ready ? "rgb(16 185 129)" : "rgb(248 250 252 / 0.85)";

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <mask id="oval-mask">
          <rect x="0" y="0" width="100" height="100" fill="white" />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black" />
        </mask>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="rgb(0 0 0 / 0.45)" mask="url(#oval-mask)" />
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={stroke}
        strokeWidth="0.4"
        strokeDasharray={ready ? undefined : "1.2 1.2"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
