import { type NodeDef, C } from './diagram-data';

function PhoneIcon({
  node,
  fill,
  stroke,
  sw,
  detailColor,
  filled,
  dim,
}: {
  node: NodeDef;
  fill: string;
  stroke: string;
  sw: number;
  detailColor: string;
  filled: boolean;
  dim: boolean;
}) {
  const pw = 16;
  const ph = 24;
  const px = node.cx - pw / 2;
  const py = node.cy - ph / 2;
  return (
    <g className="hidden max-sm:block">
      {filled && !dim && (
        <rect
          x={px + 1}
          y={py + 1}
          width={pw}
          height={ph}
          rx={3}
          fill={node.color}
          opacity={0.2}
        />
      )}
      <rect
        x={px}
        y={py}
        width={pw}
        height={ph}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* Speaker notch */}
      <line
        x1={node.cx - 3}
        y1={py + 3.5}
        x2={node.cx + 3}
        y2={py + 3.5}
        stroke={detailColor}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      {/* Home button */}
      <circle
        cx={node.cx}
        cy={py + ph - 4}
        r={2}
        fill="none"
        stroke={detailColor}
        strokeWidth={0.8}
      />
    </g>
  );
}

function MonitorIcon({
  node,
  fill,
  stroke,
  sw,
  detailColor,
  filled,
  dim,
}: {
  node: NodeDef;
  fill: string;
  stroke: string;
  sw: number;
  detailColor: string;
  filled: boolean;
  dim: boolean;
}) {
  const mw = 28;
  const mh = 18;
  const mx = node.cx - mw / 2;
  const my = node.cy - mh / 2 - 3;
  return (
    <g className="max-sm:hidden sm:block">
      {filled && !dim && (
        <rect
          x={mx + 1}
          y={my + 1}
          width={mw}
          height={mh}
          rx={2.5}
          fill={node.color}
          opacity={0.2}
        />
      )}
      <rect
        x={mx}
        y={my}
        width={mw}
        height={mh}
        rx={2.5}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      <line
        x1={mx + 3}
        y1={my + mh - 3}
        x2={mx + mw - 3}
        y2={my + mh - 3}
        stroke={detailColor}
        strokeWidth={0.6}
      />
      <line
        x1={node.cx}
        y1={my + mh}
        x2={node.cx}
        y2={my + mh + 4}
        stroke={stroke}
        strokeWidth={sw}
      />
      <line
        x1={node.cx - 7}
        y1={my + mh + 4}
        x2={node.cx + 7}
        y2={my + mh + 4}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </g>
  );
}

export function CleanNode({
  node,
  filled,
  dim,
}: {
  node: NodeDef;
  filled: boolean;
  dim: boolean;
}) {
  const stroke = dim ? C.edgeDim : node.color;
  const fill = dim ? C.edgeDim : filled ? node.color : 'transparent';
  const sw = filled ? 1.8 : 1.2;
  const detailColor = dim
    ? C.edgeDim
    : filled
      ? 'rgba(255,255,255,0.5)'
      : node.color;

  if (node.shape === 'circle') {
    const shared = { node, fill, stroke, sw, detailColor, filled, dim };
    return (
      <g>
        <PhoneIcon {...shared} />
        <MonitorIcon {...shared} />
      </g>
    );
  }

  if (node.shape === 'cylinder') {
    const s = 0.7;
    const tx = node.cx - 20 * s;
    const ty = node.cy - 20 * s;
    const bucketD =
      'M23.532,15.391 L23.729,13.932 C25.821,15.131 25.864,15.626 25.863,15.64 C25.859,15.643 25.509,15.923 23.532,15.391 Z M22.564,15.103 C19.722,14.206 15.904,12.531 13.723,11.504 C13.723,11.497 13.727,11.491 13.727,11.484 C13.727,10.821 13.187,10.281 12.524,10.281 C11.861,10.281 11.321,10.821 11.321,11.484 C11.321,12.148 11.861,12.687 12.524,12.687 C12.814,12.687 13.07,12.571 13.278,12.4 C14.547,12.994 19.075,15.076 22.428,16.113 L21.249,24.85 C21.249,25.716 17.575,27 12.5,27 C7.425,27 3.751,25.716 3.746,24.784 L1.283,6.563 C3.458,8.155 8.074,9 12.5,9 C16.926,9 21.543,8.155 23.718,6.563 L22.564,15.103 Z M1.003,4.489 C1.032,3.609 5.104,1 12.5,1 C19.895,1 23.97,3.609 24,4.489 L24,4.603 C23.81,6.231 19.137,8 12.5,8 C5.863,8 1.209,6.231 1.018,4.604 L1.003,4.489 Z M25,4.5 C25,2.665 20.131,0 12.5,0 C4.869,0 0,2.665 0,4.5 L0,4.567 L2.751,24.85 C2.751,26.896 7.773,28 12.5,28 C17.226,28 22.249,26.896 22.244,24.917 L23.396,16.39 C24.217,16.604 24.881,16.718 25.392,16.718 C25.985,16.718 26.386,16.574 26.628,16.285 C26.827,16.047 26.903,15.76 26.845,15.454 C26.708,14.716 25.797,13.919 23.89,12.87 L23.869,12.896 L25,4.567 L25,4.5 Z';
    return (
      <g transform={`translate(${tx},${ty}) scale(${s})`}>
        <rect
          width={40}
          height={40}
          rx={4}
          fill={dim ? C.edgeDim : filled ? node.color : 'transparent'}
          stroke={dim ? 'none' : filled ? 'none' : stroke}
          strokeWidth={filled || dim ? 0 : sw / s}
        />
        <path
          d={bucketD}
          fill={dim ? '#fff' : filled ? '#fff' : node.color}
          transform="translate(7,6)"
        />
      </g>
    );
  }

  // Server rack
  const w = node.w ?? 36;
  const h = node.h ?? 28;
  const x = node.cx - w / 2;
  const y = node.cy - h / 2;
  const unitH = h / 3;
  return (
    <g>
      {filled && !dim && (
        <rect
          x={x + 1}
          y={y + 1}
          width={w}
          height={h}
          rx={2.5}
          fill={node.color}
          opacity={0.2}
        />
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2.5}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
      {[0, 1, 2].map((i) => {
        const uy = y + i * unitH;
        return (
          <g key={i}>
            {i > 0 && (
              <line
                x1={x + 1}
                y1={uy}
                x2={x + w - 1}
                y2={uy}
                stroke={detailColor}
                strokeWidth={0.5}
              />
            )}
            <line
              x1={x + 3.5}
              y1={uy + unitH / 2}
              x2={x + w - 10}
              y2={uy + unitH / 2}
              stroke={detailColor}
              strokeWidth={0.5}
            />
            <circle
              cx={x + w - 5.5}
              cy={uy + unitH / 2}
              r={1.2}
              fill={
                dim
                  ? C.edgeDim
                  : filled
                    ? i === 0
                      ? '#34d399'
                      : detailColor
                    : detailColor
              }
            />
          </g>
        );
      })}
    </g>
  );
}
