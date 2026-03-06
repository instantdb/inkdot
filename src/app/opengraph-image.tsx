import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'InkDot — Draw, share, and remix sketches';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            marginBottom: '24px',
          }}
        >
          <span
            style={{
              fontSize: '80px',
              fontWeight: 700,
              color: '#334155',
              letterSpacing: '-2px',
            }}
          >
            ink
          </span>
          <span
            style={{
              fontSize: '80px',
              fontWeight: 700,
              color: '#78716c',
              letterSpacing: '-2px',
            }}
          >
            dot
          </span>
        </div>
        <span
          style={{
            fontSize: '28px',
            color: '#78716c',
            maxWidth: '700px',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Draw, stream, and replay tiny sketches.
        </span>
        <span
          style={{
            fontSize: '18px',
            color: '#a8a29e',
            marginTop: '16px',
          }}
        >
          powered by InstantDB
        </span>
      </div>
    ),
    { ...size },
  );
}
