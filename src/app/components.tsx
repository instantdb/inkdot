'use client';

import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/error-message';
import { sketchQuery } from '@/lib/sketch-query';
import { recordSketchView } from '@/lib/view-recording';
import {
  beginOptimisticVote,
  clearOptimisticVote,
  settleOptimisticVote,
  useOptimisticVoteEntry,
} from '@/lib/vote-store';
import { showToast } from '@/lib/toast';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';
import { useRouter } from 'next/navigation';
import { useGuestBootstrap } from './InstantProvider';

// -- Types --

export type StrokeEvent = {
  t: number;
  x: number;
  y: number;
  type:
    | 'start'
    | 'move'
    | 'end'
    | 'cursor'
    | 'bg'
    | 'shape'
    | 'fill'
    | 'state'
    | 'relocate'
    | 'click'
    | 'delete'
    | 'stroke'
    | 'snapshot-start'
    | 'snapshot-end';
  color?: string;
  tool?: string;
  size?: number;
  // For shape events
  shape?: 'rect' | 'circle' | 'line';
  x2?: number;
  y2?: number;
  filled?: boolean;
  // Shape identity for move tool
  shapeId?: string;
  // For compact stroke events (SVG-like path data: "M10,20 L15,25 L20,30")
  path?: string;
};

// Accumulated offsets from relocate events, keyed by shapeId
export type ShapeOffsets = Map<string, { dx: number; dy: number }>;

export type DrawTool =
  | 'pen'
  | 'eraser'
  | 'rect'
  | 'circle'
  | 'line'
  | 'fill'
  | 'move';

export const BRUSH_SIZES = [2, 4, 8, 14];
export const BRUSH_SIZE_LABELS = ['S', 'M', 'L', 'XL'];

export const TOOL_ICONS: Record<string, { path: string; stroke?: boolean }> = {
  pen: {
    path: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  },
  eraser: {
    path: 'M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.01 4.01 0 01-5.66 0L2.81 17a2.01 2.01 0 010-2.83l10.6-10.6a2.01 2.01 0 012.83 0zM4.22 15.58l3.54 3.53a2 2 0 002.83 0l2.83-2.83-4.95-4.95-4.25 4.25z',
  },
  line: { path: 'M4 20L20 4', stroke: true },
  rect: { path: 'M3 3h18v18H3z', stroke: true },
  circle: { path: 'M12 2a10 10 0 100 20 10 10 0 000-20z', stroke: true },
  fill: {
    path: 'M16.56 8.94L7.62 0 6.21 1.42l2.38 2.38-5.15 5.15a1.49 1.49 0 000 2.12l5.5 5.5a1.49 1.49 0 002.12 0l5.5-5.5a1.49 1.49 0 000-2.13zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5a2 2 0 104 0c0-1.33-2-3.5-2-3.5z',
  },
  move: {
    path: 'M12 2l3 3h-2v4h4v-2l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H7v2l-3-3 3-3v2h4V5H9l3-3z',
  },
};

export function ToolIconSvg({
  tool,
  size = 20,
  color = 'currentColor',
}: {
  tool: string;
  size?: number;
  color?: string;
}) {
  const icon = TOOL_ICONS[tool];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={icon.stroke ? 'none' : color}
      stroke={icon.stroke ? color : 'none'}
      strokeWidth={icon.stroke ? '2' : '0'}
    >
      {tool === 'line' ? (
        <line
          x1="4"
          y1="20"
          x2="20"
          y2="4"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2"
        />
      ) : (
        <path d={icon.path} />
      )}
    </svg>
  );
}

export function PencilIcon({
  size,
  filled = false,
}: {
  size: number;
  filled?: boolean;
}) {
  const bodyFill = filled ? '#fbbf24' : 'none';
  const bodyStroke = filled ? '#b45309' : 'currentColor';
  const graphiteStroke = filled ? '#374151' : 'currentColor';
  const coreStroke = filled ? '#92400e' : 'currentColor';
  const ferruleFill = filled ? '#9ca3af' : 'none';
  const ferruleStroke = filled ? '#6b7280' : 'currentColor';
  const eraserFill = filled ? '#f472b6' : 'currentColor';
  const eraserStroke = filled ? '#db2777' : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ overflow: 'visible' }}
    >
      <path
        d="M9 6 L10 4.3 L11 2.7 L12 1 L13 2.7 L14 4.3 L15 6 L15 18 L9 18 Z"
        fill={bodyFill}
        stroke={bodyStroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ transition: 'fill 0.3s, stroke 0.3s' }}
      />
      <line
        x1="12"
        y1="1"
        x2="12"
        y2="6"
        stroke={graphiteStroke}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="6"
        x2="12"
        y2="18"
        stroke={coreStroke}
        strokeWidth="1.2"
        opacity="0.5"
      />
      <line
        x1="10.5"
        y1="6"
        x2="10.5"
        y2="18"
        stroke={coreStroke}
        strokeWidth="0.5"
        opacity="0.15"
      />
      <line
        x1="13.5"
        y1="6"
        x2="13.5"
        y2="18"
        stroke={coreStroke}
        strokeWidth="0.5"
        opacity="0.15"
      />
      <rect
        x="9"
        y="18"
        width="6"
        height="2"
        fill={ferruleFill}
        stroke={ferruleStroke}
        strokeWidth="1.5"
        style={{ transition: 'fill 0.3s, stroke 0.3s' }}
      />
      <rect
        x="9"
        y="20"
        width="6"
        height="2.5"
        rx="1"
        fill={eraserFill}
        fillOpacity={filled ? 1 : 0.15}
        stroke={eraserStroke}
        strokeWidth="1.5"
        style={{ transition: 'fill 0.3s, stroke 0.3s, fill-opacity 0.3s' }}
      />
    </svg>
  );
}

// -- Constants --

export const PEN_COLORS = [
  '#1e293b',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
];

export const BG_COLORS = [
  '#ffffff', // White
  '#fdf6e3', // Cream
  '#f5f0e8', // Parchment
  '#d4eaff', // Soft blue
  '#d5f5d5', // Soft green
  '#e8d5f5', // Soft purple
  '#fde2e2', // Soft pink
  '#2c3e50', // Dark slate
  '#000000', // Black
];

export const DEFAULT_BG = '#ffffff';
export const TEMPLATES = [
  {
    id: 'this-is-fine',
    name: 'This Is Fine',
    src: '/templates/this-is-fine.svg',
  },
  { id: 'nyan-cat', name: 'Nyan Cat', src: '/templates/nyan-cat.svg' },
  { id: 'doge', name: 'Doge', src: '/templates/doge.svg' },
  { id: 'among-us', name: 'Among Us', src: '/templates/among-us.svg' },
  { id: 'pikachu', name: 'Pikachu', src: '/templates/pikachu.svg' },
  { id: 'cat', name: 'Cat', src: '/templates/cat.svg' },
  { id: 'owl', name: 'Owl', src: '/templates/owl.svg' },
  { id: 'mona-lisa', name: 'Mona Lisa', src: '/templates/mona-lisa.svg' },
  {
    id: 'starry-night',
    name: 'Starry Night',
    src: '/templates/starry-night.svg',
  },
  { id: 'the-scream', name: 'The Scream', src: '/templates/the-scream.svg' },
  {
    id: 'great-wave',
    name: 'The Great Wave',
    src: '/templates/great-wave.svg',
  },
  {
    id: 'persistence-of-memory',
    name: 'Melting Clocks',
    src: '/templates/persistence-of-memory.svg',
  },
  {
    id: 'girl-with-pearl-earring',
    name: 'Pearl Earring',
    src: '/templates/girl-with-pearl-earring.svg',
  },
  { id: 'rocket', name: 'Rocket', src: '/templates/rocket.svg' },
  { id: 'skull', name: 'Skull', src: '/templates/skull.svg' },
  { id: 'dinosaur', name: 'T-Rex', src: '/templates/dinosaur.svg' },
  { id: 'mushroom', name: 'Mushroom', src: '/templates/mushroom.svg' },
  { id: 'penguin', name: 'Penguin', src: '/templates/penguin.svg' },
  { id: 'cactus', name: 'Cactus', src: '/templates/cactus.svg' },
  { id: 'ghost', name: 'Ghost', src: '/templates/ghost.svg' },
  { id: 'sunflower', name: 'Sunflower', src: '/templates/sunflower.svg' },
  { id: 'fox', name: 'Fox', src: '/templates/fox.svg' },
  { id: 'robot', name: 'Robot', src: '/templates/robot.svg' },
  { id: 'boba-tea', name: 'Boba Tea', src: '/templates/boba-tea.svg' },
  { id: 'avocado', name: 'Avocado', src: '/templates/avocado.svg' },
  { id: 'ufo', name: 'UFO', src: '/templates/ufo.svg' },
  { id: 'rubber-duck', name: 'Rubber Duck', src: '/templates/rubber-duck.svg' },
  { id: 'totoro', name: 'Totoro', src: '/templates/totoro.svg' },
  { id: 'kirby', name: 'Kirby', src: '/templates/kirby.svg' },
  { id: 'astronaut', name: 'Astronaut', src: '/templates/astronaut.svg' },
  { id: 'elephant', name: 'Elephant', src: '/templates/elephant.svg' },
  { id: 'frog', name: 'Frog', src: '/templates/frog.svg' },
  { id: 'pizza', name: 'Pizza', src: '/templates/pizza.svg' },
  { id: 'octopus', name: 'Octopus', src: '/templates/octopus.svg' },
  { id: 'whale', name: 'Whale', src: '/templates/whale.svg' },
  { id: 'butterfly', name: 'Butterfly', src: '/templates/butterfly.svg' },
  { id: 'sushi', name: 'Sushi', src: '/templates/sushi.svg' },
  { id: 'guitar', name: 'Guitar', src: '/templates/guitar.svg' },
  { id: 'crown', name: 'Crown', src: '/templates/crown.svg' },
  { id: 'house', name: 'House', src: '/templates/house.svg' },
  { id: 'anchor', name: 'Anchor', src: '/templates/anchor.svg' },
  { id: 'bicycle', name: 'Bicycle', src: '/templates/bicycle.svg' },
  { id: 'castle', name: 'Castle', src: '/templates/castle.svg' },
  { id: 'diamond', name: 'Diamond', src: '/templates/diamond.svg' },
  { id: 'dragon', name: 'Dragon', src: '/templates/dragon.svg' },
  { id: 'flamingo', name: 'Flamingo', src: '/templates/flamingo.svg' },
  { id: 'helicopter', name: 'Helicopter', src: '/templates/helicopter.svg' },
  { id: 'igloo', name: 'Igloo', src: '/templates/igloo.svg' },
  { id: 'jellyfish', name: 'Jellyfish', src: '/templates/jellyfish.svg' },
  { id: 'kite', name: 'Kite', src: '/templates/kite.svg' },
  { id: 'lighthouse', name: 'Lighthouse', src: '/templates/lighthouse.svg' },
  { id: 'microphone', name: 'Microphone', src: '/templates/microphone.svg' },
  { id: 'ninja', name: 'Ninja', src: '/templates/ninja.svg' },
  { id: 'origami', name: 'Origami Crane', src: '/templates/origami.svg' },
  { id: 'palm-tree', name: 'Palm Tree', src: '/templates/palm-tree.svg' },
  { id: 'ramen', name: 'Ramen', src: '/templates/ramen.svg' },
  { id: 'sailboat', name: 'Sailboat', src: '/templates/sailboat.svg' },
  { id: 'telescope', name: 'Telescope', src: '/templates/telescope.svg' },
  { id: 'umbrella', name: 'Umbrella', src: '/templates/umbrella.svg' },
  { id: 'violin', name: 'Violin', src: '/templates/violin.svg' },
  { id: 'windmill', name: 'Windmill', src: '/templates/windmill.svg' },
  { id: 'xmas-tree', name: 'Xmas Tree', src: '/templates/xmas-tree.svg' },
  { id: 'yin-yang', name: 'Yin Yang', src: '/templates/yin-yang.svg' },
  { id: 'zeppelin', name: 'Zeppelin', src: '/templates/zeppelin.svg' },
  { id: 'bonsai', name: 'Bonsai', src: '/templates/bonsai.svg' },
  { id: 'corgi', name: 'Corgi', src: '/templates/corgi.svg' },
  {
    id: 'dreamcatcher',
    name: 'Dreamcatcher',
    src: '/templates/dreamcatcher.svg',
  },
  {
    id: 'eye-of-horus',
    name: 'Eye of Horus',
    src: '/templates/eye-of-horus.svg',
  },
  {
    id: 'cupcake',
    name: 'Cupcake',
    src: '/templates/cupcake.svg',
  },
  { id: 'gameboy', name: 'Game Boy', src: '/templates/gameboy.svg' },
  {
    id: 'hot-air-balloon',
    name: 'Hot Air Balloon',
    src: '/templates/hot-air-balloon.svg',
  },
  { id: 'ice-cream', name: 'Ice Cream', src: '/templates/ice-cream.svg' },
  {
    id: 'jack-o-lantern',
    name: 'Jack-o-Lantern',
    src: '/templates/jack-o-lantern.svg',
  },
  { id: 'koala', name: 'Koala', src: '/templates/koala.svg' },
  { id: 'llama', name: 'Llama', src: '/templates/llama.svg' },
  { id: 'mandala', name: 'Mandala', src: '/templates/mandala.svg' },
  { id: 'narwhal', name: 'Narwhal', src: '/templates/narwhal.svg' },
  {
    id: 'paper-airplane',
    name: 'Paper Airplane',
    src: '/templates/paper-airplane.svg',
  },
  { id: 'quill', name: 'Quill & Ink', src: '/templates/quill.svg' },
  { id: 'sloth', name: 'Sloth', src: '/templates/sloth.svg' },
];

export const CANVAS_W = 800;
export const CANVAS_H = 600;

// -- Auth Header --

function ThemeIcon({ theme }: { theme: string }) {
  if (theme === 'dark')
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  if (theme === 'light')
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { user } = db.useAuth();
  const isRealUser = user?.type === 'user';
  const isGuest = user?.type === 'guest';
  const { data } = db.useQuery(
    isRealUser && user.id
      ? { $users: { $: { where: { id: user.id } } } }
      : null,
  );
  const handle = data?.$users?.[0]?.handle;

  const themeLabel =
    theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';
  const nextTheme =
    theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-text-tertiary hover:text-text-primary hover:bg-hover flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors sm:h-8 sm:w-8"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div
          className="border-border bg-surface absolute top-full right-0 z-50 mt-1 min-w-[160px] overflow-hidden rounded-lg border py-1 shadow-lg"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTheme(nextTheme);
            }}
            className="text-text-secondary hover:bg-hover flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
          >
            <ThemeIcon theme={theme} />
            Theme: {themeLabel}
          </button>
          <div className="border-border my-1 border-t" />
          <BrowseMenuItems
            mySketchesHref={
              isRealUser && handle
                ? `/user/${encodeURIComponent(handle)}`
                : undefined
            }
            upvotedHref={isRealUser ? '/upvoted' : undefined}
          />
          <db.SignedIn>
            <div className="border-border my-1 border-t" />
            <SignedInMenuItems
              email={isRealUser ? (user.email ?? undefined) : undefined}
              onClose={() => setOpen(false)}
              showSignOut={!isGuest}
            />
          </db.SignedIn>
        </div>
      )}
    </div>
  );
}

const menuLinkClass =
  'text-text-secondary hover:bg-hover flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors';

function BrowseMenuItems({
  mySketchesHref,
  upvotedHref,
}: {
  mySketchesHref?: string;
  upvotedHref?: string;
}) {
  const iconSlotClass = 'inline-block h-[14px] w-[14px] shrink-0';

  return (
    <>
      <Link href="/best" className={menuLinkClass}>
        <PencilIcon size={14} filled />
        Best
      </Link>
      <Link href="/newest" className={menuLinkClass}>
        <span aria-hidden="true" className={iconSlotClass} />
        Newest
      </Link>
      <Link href="/top" className={menuLinkClass}>
        <span aria-hidden="true" className={iconSlotClass} />
        Top
      </Link>
      {mySketchesHref && (
        <Link href={mySketchesHref} className={menuLinkClass}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          My sketches
        </Link>
      )}
      {upvotedHref && (
        <Link href={upvotedHref} className={menuLinkClass}>
          <span aria-hidden="true" className={iconSlotClass} />
          Upvoted
        </Link>
      )}
    </>
  );
}

function SignedInMenuItems({
  email,
  onClose,
  showSignOut = true,
}: {
  email?: string;
  onClose: () => void;
  showSignOut?: boolean;
}) {
  const { signOutToGuest } = useGuestBootstrap();

  return (
    <>
      <Link href="/new" className={menuLinkClass}>
        <ToolIconSvg tool="pen" size={14} />
        Create Sketch
      </Link>
      {showSignOut && (
        <>
          <div className="border-border my-1 border-t" />
          <button
            onClick={async (e) => {
              e.stopPropagation();
              onClose();
              await signOutToGuest();
            }}
            className="text-text-secondary hover:bg-hover flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </>
      )}
      {email && (
        <>
          <div className="border-border my-1 border-t" />
          <div className="px-3 py-2">
            <div className="text-text-primary truncate text-sm font-medium">
              {email}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function AuthHeader() {
  const [showLogin, setShowLogin] = useState(false);
  const { isBootstrappingGuest } = useGuestBootstrap();

  return (
    <>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div className="flex w-full max-w-4xl items-center justify-between px-3 pt-2 sm:px-6 sm:pt-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight sm:text-xl"
            style={{ fontFamily: 'var(--font-kanit)' }}
          >
            <span className="text-slate-700 dark:text-zinc-300">ink</span>
            <span className="text-stone-500">dot</span>
          </Link>
          <span className="hidden text-xs text-stone-500 sm:inline">
            powered by{' '}
            <a
              href="https://instantdb.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-stone-300 underline-offset-2 transition-colors hover:text-stone-600"
            >
              InstantDB
            </a>
            {' & '}
            <a
              href="https://instantdb.com/docs/streams"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-stone-300 underline-offset-2 transition-colors hover:text-stone-600"
            >
              Streams
            </a>
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {!isBootstrappingGuest && (
            <db.SignedOut>
              <button
                onClick={() => setShowLogin(true)}
                className="bg-accent text-accent-text hover:bg-accent-hover cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:rounded-xl sm:px-5 sm:py-2"
              >
                Sign in
              </button>
            </db.SignedOut>
          )}
          <db.SignedIn>
            <SignedInHeader />
          </db.SignedIn>
          <HeaderMenu />
        </div>
      </div>
    </>
  );
}

function SignedInHeader() {
  const user = db.useUser();
  const [editingHandle, setEditingHandle] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const handleRef = useRef<HTMLInputElement>(null);
  const isGuest = !user.email;

  const saveHandle = async () => {
    const val = handleRef.current?.value.trim();
    if (val) {
      try {
        await db.transact(db.tx.$users[user.id].update({ handle: val }));
        setEditingHandle(false);
      } catch (err: unknown) {
        const msg =
          err instanceof Error && err.message.includes('unique')
            ? `The handle "${val}" is already taken. Try another one!`
            : 'Failed to save handle.';
        alert(msg);
      }
    } else {
      setEditingHandle(false);
    }
  };

  const { data } = db.useSuspenseQuery({
    $users: { $: { where: { id: user.id } } },
  });
  const handle = data.$users[0]?.handle;

  return (
    <>
      {showSignupModal && (
        <LoginModal
          onClose={() => setShowSignupModal(false)}
          title="Sign up / Log in"
          description="Enter your email to save and vote on sketches."
        />
      )}
      {isGuest && !showSignupModal && (
        <button
          onClick={() => setShowSignupModal(true)}
          className="border-border-strong bg-surface text-text-primary hover:bg-hover cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold transition-all active:scale-95 sm:rounded-xl sm:px-5 sm:py-2"
        >
          Sign up
        </button>
      )}
      {!isGuest && !showSignupModal && !handle && (
        <button
          onClick={() => setEditingHandle(true)}
          className="text-text-secondary hover:text-text-primary text-sm transition-colors"
        >
          Set handle
        </button>
      )}
      {!isGuest && handle && (
        <span className="text-text-secondary text-xs font-medium sm:text-sm">
          @{handle}
        </span>
      )}
      {editingHandle && !handle && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 pt-[10vh] pb-[40vh] backdrop-blur-sm sm:items-center sm:px-0 sm:pt-0 sm:pb-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingHandle(false);
          }}
        >
          <div className="bg-surface relative w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <button
              onClick={() => setEditingHandle(false)}
              className="text-text-tertiary hover:text-text-secondary absolute top-3 right-3 transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h2 className="text-text-primary mb-2 text-center text-lg font-bold">
              Choose your handle
            </h2>
            <p className="text-text-secondary mb-5 text-center text-sm">
              This is permanent and can&apos;t be changed later.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveHandle();
              }}
              className="flex flex-col gap-4"
            >
              <div className="border-border flex items-center gap-2 rounded-xl border px-4 py-2.5">
                <span className="text-text-tertiary">@</span>
                <input
                  ref={handleRef}
                  type="text"
                  defaultValue=""
                  placeholder="yourhandle"
                  className="w-full focus:outline-none"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="bg-accent text-accent-text hover:bg-accent-hover w-full rounded-xl px-4 py-2.5 font-semibold transition-colors"
              >
                Save handle
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// -- Login Modal --

export function LoginModal({
  onClose,
  redirectTo,
  title,
  description,
}: {
  onClose: () => void;
  redirectTo?: string;
  title?: string;
  description?: string;
}) {
  const [sentEmail, setSentEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const router = useRouter();

  const handleSuccess = async () => {
    setErrorMessage('');
    onClose();
    if (redirectTo) {
      // Small delay to let auth state propagate to React tree
      await new Promise((r) => setTimeout(r, 100));
      router.push(redirectTo);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 pt-[10vh] pb-[40vh] backdrop-blur-sm sm:items-center sm:px-0 sm:pt-0 sm:pb-0"
      onClick={(event) => handleModalBackdropClick(event, onClose)}
    >
      <div
        className="bg-surface relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        onClick={stopModalClick}
      >
        <button
          onClick={(event) => handleModalCloseClick(event, onClose)}
          className="text-text-tertiary hover:text-text-secondary absolute top-3 right-3 transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {title ? (
          <h2 className="text-text-primary mb-2 text-center text-lg font-bold">
            {title}
          </h2>
        ) : (
          <h2
            className="mb-6 text-center text-2xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-kanit)' }}
          >
            <span className="text-slate-700">ink</span>
            <span className="text-stone-500">dot</span>
          </h2>
        )}
        {sentEmail && (
          <p className="text-text-primary mb-3 text-center text-sm font-medium">
            {sentEmail}
          </p>
        )}
        {!sentEmail ? (
          <EmailStep
            onSendEmail={setSentEmail}
            onError={setErrorMessage}
            description={description}
          />
        ) : (
          <CodeStep
            sentEmail={sentEmail}
            onBack={() => {
              setSentEmail('');
              setErrorMessage('');
            }}
            onError={setErrorMessage}
            onSuccess={handleSuccess}
          />
        )}
        {errorMessage && (
          <p className="mt-4 text-center text-sm text-red-600">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function EmailStep({
  onSendEmail,
  onError,
  description,
}: {
  onSendEmail: (email: string) => void;
  onError: (message: string) => void;
  description?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = inputRef.current!.value;
    onError('');
    onSendEmail(email);
    db.auth
      .sendMagicCode({ email })
      .catch((err: { body?: { message?: string } }) => {
        onError(err.body?.message || 'Failed to send code.');
        onSendEmail('');
      });
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
      <p className="text-text-secondary text-center text-sm">
        {description || 'Enter your email to sign in or create an account.'}
      </p>
      <input
        ref={inputRef}
        type="email"
        className="border-border w-full rounded-xl border px-4 py-2.5 focus:border-slate-500 focus:outline-none"
        placeholder="you@example.com"
        required
        autoFocus
      />
      <button
        type="submit"
        className="bg-accent text-accent-text hover:bg-accent-hover w-full rounded-xl px-4 py-2.5 font-semibold transition-colors"
      >
        Send Code
      </button>
    </form>
  );
}

function CodeStep({
  sentEmail,
  onBack,
  onError,
  onSuccess,
}: {
  sentEmail: string;
  onBack: () => void;
  onError: (message: string) => void;
  onSuccess?: () => void;
}) {
  const submitCode = async (code: string) => {
    onError('');

    try {
      await db.auth.signInWithMagicCode({ email: sentEmail, code });

      const response = await fetch('/api/auth/merge-linked-guest-data', {
        method: 'POST',
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || 'Failed to merge linked guest data');
      }

      onSuccess?.();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' &&
              err !== null &&
              'body' in err &&
              typeof err.body === 'object' &&
              err.body !== null &&
              'message' in err.body &&
              typeof err.body.message === 'string'
            ? err.body.message
            : 'Failed to sign in.';
      onError(message);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <p className="text-text-secondary text-center text-sm">
        We sent a code to{' '}
        <strong className="text-text-primary">{sentEmail}</strong>
      </p>
      <CodeInput onComplete={submitCode} />
      <button
        type="button"
        onClick={onBack}
        className="text-text-tertiary hover:text-text-secondary text-sm"
      >
        Use a different email
      </button>
    </div>
  );
}

// -- Code Input (6 digits) --

function CodeInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focusIdx = (i: number) => refs.current[i]?.focus();

  const handleChange = (i: number, value: string) => {
    // Handle pasted full code
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 6) {
      const next = cleaned.slice(0, 6).split('');
      setDigits(next);
      focusIdx(5);
      onComplete(next.join(''));
      return;
    }
    if (cleaned.length > 1) {
      // Pasted partial — fill from current index
      const next = [...digits];
      for (let j = 0; j < cleaned.length && i + j < 6; j++) {
        next[i + j] = cleaned[j];
      }
      setDigits(next);
      const end = Math.min(i + cleaned.length, 5);
      focusIdx(end);
      if (next.every((d) => d)) onComplete(next.join(''));
      return;
    }
    const char = cleaned[0] || '';
    const next = [...digits];
    next[i] = char;
    setDigits(next);
    if (char && i < 5) focusIdx(i + 1);
    if (next.every((d) => d)) onComplete(next.join(''));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits];
        next[i] = '';
        setDigits(next);
      } else if (i > 0) {
        const next = [...digits];
        next[i - 1] = '';
        setDigits(next);
        focusIdx(i - 1);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focusIdx(i - 1);
    } else if (e.key === 'ArrowRight' && i < 5) {
      focusIdx(i + 1);
    }
  };

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={d}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
            if (pasted.length > 1) {
              e.preventDefault();
              handleChange(i, pasted);
            }
          }}
          className="border-border text-text-primary h-12 w-10 rounded-lg border text-center text-xl font-semibold transition-colors focus:border-slate-500 focus:outline-none"
        />
      ))}
    </div>
  );
}

// -- Live Thumbnail --

export function LiveThumbnail({
  streamId,
  duration,
  showCursor = true,
}: {
  streamId: string;
  duration?: number | null;
  showCursor?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelledRef = useRef(false);
  const progressRef = useRef(0);
  const cursorRef = useRef<{
    x: number;
    y: number;
    tool?: string;
    color?: string;
    lastDrawTime?: number;
    pressed?: boolean;
    pressTime?: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    cancelledRef.current = false;

    const readStream = db.streams.createReadStream({ streamId });
    const reader = readStream.getReader();

    let buffer = '';
    const allEvents: StrokeEvent[] = [];
    const incState: IncrementalState = {
      tool: '',
      color: '',
      size: 4,
      shapeStart: null,
    };
    let snapshotBuffer: StrokeEvent[] | null = null;

    (async () => {
      try {
        while (!cancelledRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt: StrokeEvent = JSON.parse(line);
              allEvents.push(evt);

              // Snapshot buffering: batch events between markers
              if (evt.type === 'snapshot-start') {
                snapshotBuffer = [];
                continue;
              }
              if (evt.type === 'snapshot-end') {
                if (snapshotBuffer) {
                  renderEventsToCanvas(ctx, allEvents);
                  snapshotBuffer = null;
                }
                continue;
              }
              if (snapshotBuffer) {
                snapshotBuffer.push(evt);
                continue;
              }

              const result = processEventIncremental(
                ctx,
                evt,
                allEvents,
                incState,
              );

              if (result.needsFullRedraw) {
                renderEventsToCanvas(ctx, allEvents);
              }

              if (result.shapePreview) {
                renderEventsToCanvas(ctx, allEvents);
                const sp = result.shapePreview;
                drawShapeOnCanvas(
                  ctx,
                  sp.shape,
                  sp.x1,
                  sp.y1,
                  sp.x2,
                  sp.y2,
                  sp.color,
                  sp.size,
                  1,
                );
              }

              // Update cursor
              if (evt.type === 'click') {
                if (cursorRef.current) {
                  cursorRef.current = {
                    ...cursorRef.current,
                    pressed: true,
                    pressTime: performance.now(),
                  };
                }
              } else if (result.cursorPosition) {
                cursorRef.current = {
                  x: result.cursorPosition.x,
                  y: result.cursorPosition.y,
                  tool: incState.tool || undefined,
                  color: incState.color || undefined,
                  lastDrawTime: result.isDrawEvent
                    ? performance.now()
                    : cursorRef.current?.lastDrawTime,
                };
              } else if (result.stateChanged) {
                cursorRef.current = {
                  x: cursorRef.current?.x ?? 0,
                  y: cursorRef.current?.y ?? 0,
                  tool: incState.tool || undefined,
                  color: incState.color || undefined,
                  lastDrawTime: cursorRef.current?.lastDrawTime,
                };
              }

              // Update progress
              if (duration && allEvents.length > 1) {
                const first = allEvents[0].t;
                progressRef.current = computePlaybackProgress({
                  elapsed: evt.t,
                  start: first,
                  end: first + duration * 1000,
                  stalledOnStream: false,
                  lastProcessedTime: evt.t,
                  previousProgress: progressRef.current,
                });
              }
            } catch {}
          }
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
      }
    })();

    return () => {
      cancelledRef.current = true;
      reader.cancel().catch(() => {});
    };
  }, [streamId, duration]);

  return (
    <div className="relative aspect-[4/3] w-full">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="aspect-[4/3] w-full"
      />
      {showCursor && <CursorOverlay cursorRef={cursorRef} />}
      <ThumbnailProgressBar progressRef={progressRef} />
    </div>
  );
}

// -- Static Stream Thumbnail (renders final frame from stream when no thumbnail image exists) --

function StaticStreamThumbnail({ streamId }: { streamId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    let cancelled = false;
    const readStream = db.streams.createReadStream({ streamId });
    const reader = readStream.getReader();

    let buffer = '';
    const allEvents: StrokeEvent[] = [];

    (async () => {
      try {
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              allEvents.push(JSON.parse(line));
            } catch {}
          }
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
      }

      if (!cancelled && allEvents.length > 0) {
        renderEventsToCanvas(ctx, allEvents);
      }
    })();

    return () => {
      cancelled = true;
      reader.cancel().catch(() => {});
    };
  }, [streamId]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className="aspect-[4/3] w-full"
    />
  );
}

// -- Thumbnail Progress Bar --

function ThumbnailProgressBar({
  progressRef,
}: {
  progressRef: React.RefObject<number>;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let running = true;
    const update = () => {
      if (!running) return;
      const bar = barRef.current;
      if (bar) {
        bar.style.transform = `scaleX(${progressRef.current ?? 0})`;
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
    return () => {
      running = false;
    };
  }, [progressRef]);

  return (
    <div className="absolute right-0 bottom-0 left-0 h-1 bg-black/10">
      <div
        ref={barRef}
        className="bg-accent h-full origin-left"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}

// -- Replay Thumbnail (hover autoplay) --

export function ReplayThumbnail({
  sketchId,
  authorUserId,
  streamId,
  trimStart,
  trimEnd,
  playbackSpeed,
  showCursor = true,
}: {
  sketchId: string;
  authorUserId?: string;
  streamId: string;
  trimStart: number;
  trimEnd: number | null;
  playbackSpeed: number;
  showCursor?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user } = db.useAuth();
  const progressRef = useRef(0);
  const cursorRef = useRef<{
    x: number;
    y: number;
    tool?: string;
    color?: string;
    lastDrawTime?: number;
    pressed?: boolean;
    pressTime?: number;
  } | null>(null);
  const recordedViewRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    let cancelled = false;
    let animFrame = 0;
    const allEvents: StrokeEvent[] = [];

    const ts = trimStart ?? 0;
    let streamDone = false;
    let trimStartIdx = 0;
    let trimStartFound = false;
    let replayStarted = false;
    let replayStart = 0;
    recordedViewRef.current = false;

    const replayState: IncrementalState = {
      tool: '',
      color: '',
      size: 4,
      shapeStart: null,
    };
    let eventIdx = 0;

    const redrawUpTo = (time: number) => {
      const result = renderEventsToCanvas(ctx, allEvents, {
        upToTime: time,
      });
      replayState.tool = result.tool;
      replayState.color = result.color;
      replayState.size = result.size;
      replayState.shapeStart = null;
    };

    // Compute effective trim end (only known once stream is done if trimEnd is null)
    const getTe = () =>
      trimEnd ?? (allEvents.length > 0 ? allEvents[allEvents.length - 1].t : 0);

    // Get the current upper bound index for replay
    const getTrimEndIdx = () => {
      if (trimEnd == null) return allEvents.length;
      // Binary-ish: find first event past trimEnd
      for (let i = allEvents.length - 1; i >= 0; i--) {
        if (allEvents[i].t <= trimEnd) return i + 1;
      }
      return 0;
    };

    const startReplay = () => {
      if (replayStarted) return;
      replayStarted = true;

      // Render initial state at trim start
      const initResult = renderEventsToCanvas(
        ctx,
        allEvents.slice(0, trimStartIdx),
      );
      replayState.tool = initResult.tool;
      replayState.color = initResult.color;
      replayState.size = initResult.size;
      replayState.shapeStart = null;

      eventIdx = trimStartIdx;
      replayStart = performance.now();
      animFrame = requestAnimationFrame(frame);
    };

    const frame = () => {
      if (cancelled) return;

      const elapsed = (performance.now() - replayStart) * playbackSpeed + ts;
      const trimEndIdx = getTrimEndIdx();

      let needsRedraw = false;
      while (eventIdx < trimEndIdx && allEvents[eventIdx].t <= elapsed) {
        const evt = allEvents[eventIdx];

        // Snapshot buffering: wait for snapshot-end, then render all at once
        if (evt.type === 'snapshot-start') {
          let endIdx = eventIdx + 1;
          while (
            endIdx < trimEndIdx &&
            allEvents[endIdx].type !== 'snapshot-end'
          ) {
            endIdx++;
          }
          if (
            endIdx >= trimEndIdx ||
            allEvents[endIdx].type !== 'snapshot-end'
          ) {
            // snapshot-end hasn't arrived yet — stop processing, wait for more data
            break;
          }
          eventIdx = endIdx + 1;
          renderEventsToCanvas(ctx, allEvents.slice(0, eventIdx));
          needsRedraw = false;
          continue;
        }

        const result = processEventIncremental(
          ctx,
          evt,
          allEvents.slice(0, eventIdx + 1),
          replayState,
        );

        if (result.needsFullRedraw) {
          eventIdx++;
          needsRedraw = true;
          continue;
        }

        if (needsRedraw) {
          needsRedraw = false;
          redrawUpTo(evt.t);
        }

        if (result.shapePreview) {
          renderEventsToCanvas(ctx, allEvents.slice(0, eventIdx));
          const sp = result.shapePreview;
          drawShapeOnCanvas(
            ctx,
            sp.shape,
            sp.x1,
            sp.y1,
            sp.x2,
            sp.y2,
            sp.color,
            sp.size,
            1,
          );
        }

        // Update cursor
        if (evt.type === 'click') {
          if (cursorRef.current) {
            cursorRef.current = {
              ...cursorRef.current,
              pressed: true,
              pressTime: performance.now(),
            };
          }
        } else if (result.cursorPosition) {
          cursorRef.current = {
            x: result.cursorPosition.x,
            y: result.cursorPosition.y,
            tool: replayState.tool || undefined,
            color: replayState.color || undefined,
            lastDrawTime: result.isDrawEvent
              ? performance.now()
              : cursorRef.current?.lastDrawTime,
          };
        } else if (result.stateChanged) {
          cursorRef.current = {
            x: cursorRef.current?.x ?? 0,
            y: cursorRef.current?.y ?? 0,
            tool: replayState.tool || undefined,
            color: replayState.color || undefined,
            lastDrawTime: cursorRef.current?.lastDrawTime,
          };
        }

        eventIdx++;
      }

      if (needsRedraw) {
        redrawUpTo(elapsed);
      }

      // Update progress
      progressRef.current = computePlaybackProgress({
        elapsed,
        start: ts,
        end: getTe(),
        stalledOnStream: !streamDone && eventIdx >= allEvents.length,
        lastProcessedTime:
          eventIdx > trimStartIdx ? allEvents[eventIdx - 1].t : ts,
        previousProgress: progressRef.current,
      });

      // Stop when done: stream must be finished and all events processed
      if (streamDone && eventIdx >= trimEndIdx) {
        progressRef.current = 1;
        cursorRef.current = null;
        if (!recordedViewRef.current) {
          recordedViewRef.current = true;
          void recordSketchView({
            sketchId,
            viewerUserId: user?.id,
            authorUserId,
          }).catch(() => {
            recordedViewRef.current = false;
          });
        }
        return;
      }

      animFrame = requestAnimationFrame(frame);
    };

    // Read stream and start replay as soon as we have events past trimStart
    const readStream = db.streams.createReadStream({ streamId });
    const reader = readStream.getReader();
    let buffer = '';

    (async () => {
      try {
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              allEvents.push(JSON.parse(line));
            } catch {
              continue;
            }

            // Find trimStartIdx once
            if (!trimStartFound) {
              const lastEvt = allEvents[allEvents.length - 1];
              if (lastEvt.t >= ts) {
                trimStartFound = true;
                trimStartIdx = allEvents.length - 1;
                // Walk back to find exact boundary
                for (let i = 0; i < allEvents.length; i++) {
                  if (allEvents[i].t >= ts) {
                    trimStartIdx = i;
                    break;
                  }
                }
                startReplay();
              }
            }
          }
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
      }

      streamDone = true;

      // If trimStart is 0 and we got events but never started replay
      if (!replayStarted && allEvents.length > 0 && !cancelled) {
        trimStartIdx = 0;
        startReplay();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrame);
      reader.cancel().catch(() => {});
    };
  }, [
    authorUserId,
    playbackSpeed,
    sketchId,
    streamId,
    trimEnd,
    trimStart,
    user?.id,
  ]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="aspect-[4/3] w-full"
      />
      {showCursor && <CursorOverlay cursorRef={cursorRef} />}
      <ThumbnailProgressBar progressRef={progressRef} />
    </div>
  );
}

// -- Cursor Overlay --

export function CursorOverlay({
  cursorRef,
}: {
  cursorRef: React.RefObject<{
    x: number;
    y: number;
    tool?: string;
    color?: string;
    lastDrawTime?: number;
    pressed?: boolean;
    pressTime?: number;
  } | null>;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const currentPos = useRef<{ x: number; y: number } | null>(null);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentColor, setCurrentColor] = useState<string>('#64748b');
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    let running = true;
    const lerp = 0.3;
    let lastTool: string | null = null;
    let lastColor = '#64748b';
    let lastPressed = false;

    const update = () => {
      if (!running) return;
      const pos = cursorRef.current;
      const el = elRef.current;
      if (!pos && el) {
        el.style.opacity = '0';
        currentPos.current = null;
      }
      if (pos && el) {
        if (!currentPos.current) {
          currentPos.current = { x: pos.x, y: pos.y };
        } else {
          currentPos.current.x += (pos.x - currentPos.current.x) * lerp;
          currentPos.current.y += (pos.y - currentPos.current.y) * lerp;
        }
        const cx = currentPos.current.x;
        const cy = currentPos.current.y;
        const outOfBounds = cx < 0 || cx > CANVAS_W || cy < 0 || cy > CANVAS_H;
        el.style.left = `${(cx / CANVAS_W) * 100}%`;
        el.style.top = `${(cy / CANVAS_H) * 100}%`;
        el.style.opacity = outOfBounds ? '0' : '1';

        const newTool = pos.tool && TOOL_ICONS[pos.tool] ? pos.tool : null;
        const newColor = pos.color || '#64748b';
        if (newTool !== lastTool) {
          lastTool = newTool;
          setCurrentTool(newTool);
        }
        if (newColor !== lastColor) {
          lastColor = newColor;
          setCurrentColor(newColor);
        }
        // Check press state (show for 200ms after pressTime)
        const isPressed =
          !!pos.pressed &&
          !!pos.pressTime &&
          performance.now() - pos.pressTime < 200;
        if (isPressed !== lastPressed) {
          lastPressed = isPressed;
          setPressed(isPressed);
        }
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
    return () => {
      running = false;
    };
  }, [cursorRef]);

  return (
    <div
      ref={elRef}
      className="pointer-events-none absolute opacity-0"
      style={{
        marginLeft: -14,
        marginTop: -14,
        willChange: 'left, top',
        transform: pressed ? 'scale(0.85)' : 'scale(1)',
        transition: 'transform 0.08s ease-out',
      }}
    >
      {currentTool ? (
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            backgroundColor: currentColor + (pressed ? '50' : '25'),
            borderColor: currentColor,
            borderWidth: pressed ? 2.5 : 2,
            borderStyle: 'solid',
            boxShadow: pressed
              ? `0 0 0 3px ${currentColor}30`
              : isLightColor(currentColor)
                ? '0 0 0 1px rgba(0,0,0,0.25)'
                : '0 1px 2px rgba(0,0,0,0.1)',
            transition:
              'box-shadow 0.08s ease-out, background-color 0.08s ease-out',
          }}
        >
          <ToolIconSvg
            tool={currentTool}
            size={14}
            color={isLightColor(currentColor) ? '#64748b' : currentColor}
          />
        </div>
      ) : (
        <div
          className="rounded-full"
          style={{
            marginLeft: 8,
            marginTop: 8,
            width: pressed ? 10 : 12,
            height: pressed ? 10 : 12,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: pressed ? '#f43f5e' : '#fb7185',
            backgroundColor: pressed
              ? 'rgba(244, 63, 94, 0.5)'
              : 'rgba(251, 113, 133, 0.3)',
            boxShadow: pressed ? '0 0 0 3px rgba(251, 113, 133, 0.25)' : 'none',
            transition: 'all 0.08s ease-out',
          }}
        />
      )}
    </div>
  );
}

// -- Timer Display --

export function TimerDisplay({
  timeLeft,
  duration,
  progress,
}: {
  timeLeft: number;
  duration: number;
  progress: number;
}) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      <svg width="44" height="44" className="-rotate-90">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth="3"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={timeLeft <= 5 ? '#ef4444' : '#f43f5e'}
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <span
        className={`absolute text-sm font-bold ${
          timeLeft <= 5 ? 'text-red-500' : 'text-text-secondary'
        }`}
      >
        {timeLeft}
      </span>
    </div>
  );
}

// -- Drawing Helpers --

export let lastX = 0;
export let lastY = 0;

export function resetDrawState() {
  lastX = 0;
  lastY = 0;
}

// Apply shape offset to an event's coordinates
function offsetEvt(
  evt: StrokeEvent,
  offsets?: ShapeOffsets,
): { x: number; y: number; x2?: number; y2?: number } {
  const o = evt.shapeId && offsets?.get(evt.shapeId);
  const dx = o ? o.dx : 0;
  const dy = o ? o.dy : 0;
  return {
    x: evt.x + dx,
    y: evt.y + dy,
    x2: evt.x2 != null ? evt.x2 + dx : undefined,
    y2: evt.y2 != null ? evt.y2 + dy : undefined,
  };
}

export function drawEvent(
  ctx: CanvasRenderingContext2D,
  evt: StrokeEvent,
  scale: number,
  offsets?: ShapeOffsets,
  deleted?: Set<string>,
) {
  if (
    evt.type === 'cursor' ||
    evt.type === 'bg' ||
    evt.type === 'relocate' ||
    evt.type === 'click' ||
    evt.type === 'delete' ||
    evt.type === 'snapshot-start' ||
    evt.type === 'snapshot-end'
  )
    return;
  if (evt.shapeId && deleted?.has(evt.shapeId)) return;

  const { x: ox, y: oy, x2: ox2, y2: oy2 } = offsetEvt(evt, offsets);

  if (evt.type === 'shape') {
    drawShapeOnCanvas(
      ctx,
      evt.shape || 'rect',
      ox * scale,
      oy * scale,
      (ox2 ?? ox) * scale,
      (oy2 ?? oy) * scale,
      evt.color || '#1e293b',
      (evt.size || 4) * scale,
      1,
      evt.filled,
    );
    return;
  }

  if (evt.type === 'fill') {
    floodFill(
      ctx,
      Math.round(ox * scale),
      Math.round(oy * scale),
      evt.color || '#1e293b',
    );
    return;
  }

  if (evt.type === 'stroke' && evt.path) {
    const size = (evt.size || 4) * scale;
    const color = evt.color || '#1e293b';
    const commands = evt.path.split(' ');
    let cx = 0;
    let cy = 0;
    let first = true;
    for (const cmd of commands) {
      if (cmd.startsWith('M')) {
        const [mx, my] = cmd.slice(1).split(',').map(Number);
        cx =
          (mx + ((evt.shapeId && offsets?.get(evt.shapeId)?.dx) || 0)) * scale;
        cy =
          (my + ((evt.shapeId && offsets?.get(evt.shapeId)?.dy) || 0)) * scale;
        if (first) {
          // Draw initial dot like 'start' does
          ctx.beginPath();
          ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          first = false;
        }
      } else if (cmd.startsWith('L')) {
        const [lx, ly] = cmd.slice(1).split(',').map(Number);
        const nx =
          (lx + ((evt.shapeId && offsets?.get(evt.shapeId)?.dx) || 0)) * scale;
        const ny =
          (ly + ((evt.shapeId && offsets?.get(evt.shapeId)?.dy) || 0)) * scale;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        cx = nx;
        cy = ny;
      }
    }
    lastX = cx;
    lastY = cy;
    return;
  }

  const x = ox * scale;
  const y = oy * scale;
  const size = (evt.size || 4) * scale;

  if (evt.type === 'start') {
    lastX = x;
    lastY = y;
    // Don't draw a dot for shape tool starts (rect/circle/line)
    const shapeTools = ['rect', 'circle', 'line'];
    if (!shapeTools.includes(evt.tool || '')) {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = evt.color || '#1e293b';
      ctx.fill();
    }
  } else if (evt.type === 'move') {
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = evt.color || '#1e293b';
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastX = x;
    lastY = y;
  } else if (evt.type === 'end') {
    lastX = x;
    lastY = y;
  }
}

// Build offsets map and deleted set from a list of events
export function buildOffsets(events: StrokeEvent[]): ShapeOffsets {
  const offsets: ShapeOffsets = new Map();
  for (const evt of events) {
    if (evt.type === 'relocate' && evt.shapeId) {
      const cur = offsets.get(evt.shapeId) || { dx: 0, dy: 0 };
      cur.dx += evt.x;
      cur.dy += evt.y;
      offsets.set(evt.shapeId, cur);
    }
  }
  return offsets;
}

export function buildDeletedSet(events: StrokeEvent[]): Set<string> {
  const deleted = new Set<string>();
  for (const evt of events) {
    if (evt.type === 'delete' && evt.shapeId) {
      deleted.add(evt.shapeId);
    }
  }
  return deleted;
}

export function drawShapeOnCanvas(
  ctx: CanvasRenderingContext2D,
  shape: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  size: number,
  scale: number,
  filled?: boolean,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (filled) ctx.fillStyle = color;

  if (shape === 'rect') {
    const w = x2 - x1;
    const h = y2 - y1;
    const r = Math.min(8 * scale, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.roundRect(x1, y1, w, h, r);
    if (filled) ctx.fill();
    ctx.stroke();
  } else if (shape === 'circle') {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (filled) ctx.fill();
    ctx.stroke();
  } else if (shape === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  // Perceived luminance
  return r * 0.299 + g * 0.587 + b * 0.114 > 186;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: string,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const [fr, fg, fb] = hexToRgb(fillColor);

  const idx = (startY * w + startX) * 4;
  const tr = data[idx];
  const tg = data[idx + 1];
  const tb = data[idx + 2];

  if (tr === fr && tg === fg && tb === fb) return;

  const tolerance = 10;
  const match = (i: number) =>
    Math.abs(data[i] - tr) <= tolerance &&
    Math.abs(data[i + 1] - tg) <= tolerance &&
    Math.abs(data[i + 2] - tb) <= tolerance;

  const stack = [startX, startY];
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const i = (y * w + x) * 4;
    if (!match(i)) continue;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = 255;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  ctx.putImageData(imageData, 0, 0);
}

// -- Unified Event Rendering --

export type RenderResult = {
  tool: string;
  color: string;
  size: number;
  cursor: { x: number; y: number } | null;
};

/**
 * Full redraw: clears canvas, builds offsets/deleted, iterates events, returns final state.
 * Replaces all "redraw from scratch" code paths.
 */
export function renderEventsToCanvas(
  ctx: CanvasRenderingContext2D,
  events: StrokeEvent[],
  opts?: {
    upToTime?: number;
    bgColor?: string;
  },
): RenderResult {
  const initialBg = opts?.bgColor ?? DEFAULT_BG;
  const upToTime = opts?.upToTime;

  const filtered =
    upToTime != null ? events.filter((e) => e.t <= upToTime) : events;

  const offsets = buildOffsets(filtered);
  const deleted = buildDeletedSet(filtered);

  // Determine the last bg color so it goes behind all strokes
  let bgColor = initialBg;
  for (const evt of filtered) {
    if (evt.type === 'bg') bgColor = evt.color || DEFAULT_BG;
  }
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  resetDrawState();

  const shapeToolSet = ['rect', 'circle', 'line'];
  let currentTool = '';
  let currentColor = '';
  let currentSize = 4;
  let cursorX: number | null = null;
  let cursorY: number | null = null;
  // Track in-progress shape for preview rendering
  let shapeStart: { x: number; y: number } | null = null;
  let shapeCursorX: number | null = null;
  let shapeCursorY: number | null = null;

  for (const evt of filtered) {
    if (evt.type === 'bg') {
      // bg already applied above as the base layer; skip
    } else if (evt.type === 'state') {
      if (evt.tool) currentTool = evt.tool;
      if (evt.color) currentColor = evt.color;
      if (evt.size) currentSize = evt.size;
    } else if (evt.type === 'cursor') {
      cursorX = evt.x;
      cursorY = evt.y;
      // Track cursor position during shape drawing for preview
      if (shapeStart) {
        shapeCursorX = evt.x;
        shapeCursorY = evt.y;
      }
    } else if (
      evt.type !== 'relocate' &&
      evt.type !== 'delete' &&
      evt.type !== 'click' &&
      evt.type !== 'snapshot-start' &&
      evt.type !== 'snapshot-end'
    ) {
      if (evt.type === 'start') {
        currentTool = evt.tool || 'pen';
        currentColor = evt.color || '#1e293b';
        if (evt.size) currentSize = evt.size;
        if (shapeToolSet.includes(currentTool)) {
          shapeStart = { x: evt.x, y: evt.y };
          shapeCursorX = null;
          shapeCursorY = null;
        }
      } else if (evt.type === 'shape') {
        currentTool = evt.shape || 'rect';
        currentColor = evt.color || '#1e293b';
        if (evt.size) currentSize = evt.size;
        shapeStart = null;
      } else if (evt.type === 'fill') {
        currentTool = 'fill';
        currentColor = evt.color || '#1e293b';
      } else if (evt.type === 'end') {
        shapeStart = null;
      } else if (evt.type === 'stroke') {
        currentTool = evt.tool || 'pen';
        currentColor = evt.color || '#1e293b';
        if (evt.size) currentSize = evt.size;
      }
      // Use x2/y2 for cursor position on shape events (fixes snap-to-start bug)
      if (evt.type === 'stroke' && evt.path) {
        // Parse last point from path for cursor
        const commands = evt.path.split(' ');
        const last = commands[commands.length - 1];
        if (last && (last.startsWith('L') || last.startsWith('M'))) {
          const [px, py] = last.slice(1).split(',').map(Number);
          cursorX = px;
          cursorY = py;
        }
      } else {
        cursorX = evt.type === 'shape' && evt.x2 != null ? evt.x2 : evt.x;
        cursorY = evt.type === 'shape' && evt.y2 != null ? evt.y2 : evt.y;
      }
      drawEvent(ctx, evt, 1, offsets, deleted);
    }
  }

  // Draw in-progress shape preview if we stopped mid-shape
  if (shapeStart && shapeCursorX != null && shapeCursorY != null) {
    drawShapeOnCanvas(
      ctx,
      currentTool,
      shapeStart.x,
      shapeStart.y,
      shapeCursorX,
      shapeCursorY,
      currentColor,
      currentSize,
      1,
    );
  }

  return {
    tool: currentTool,
    color: currentColor,
    size: currentSize,
    cursor:
      cursorX != null && cursorY != null ? { x: cursorX, y: cursorY } : null,
  };
}

export type IncrementalState = {
  tool: string;
  color: string;
  size: number;
  shapeStart: { x: number; y: number } | null;
};

export type IncrementalResult = {
  needsFullRedraw: boolean;
  cursorPosition: { x: number; y: number } | null;
  isDrawEvent: boolean;
  stateChanged: boolean;
  shapePreview?: {
    shape: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    size: number;
  };
};

const SHAPE_TOOLS = ['rect', 'circle', 'line'];

/**
 * Incremental single-event processing: updates state, draws to canvas, returns
 * cursor/redraw info. Replaces all "process one new event" code paths.
 *
 * - Mutates `state` in place (tool/color/size/shapeStart).
 * - Does NOT touch cursorRef — callers apply the returned cursor to their own ref.
 */
export function processEventIncremental(
  ctx: CanvasRenderingContext2D,
  evt: StrokeEvent,
  allEvents: StrokeEvent[],
  state: IncrementalState,
): IncrementalResult {
  // Snapshot markers signal batch rendering
  if (evt.type === 'snapshot-start' || evt.type === 'snapshot-end') {
    return {
      needsFullRedraw: true,
      cursorPosition: null,
      isDrawEvent: false,
      stateChanged: false,
    };
  }

  // Events that require a full redraw
  if (evt.type === 'bg' || evt.type === 'relocate' || evt.type === 'delete') {
    return {
      needsFullRedraw: true,
      cursorPosition: null,
      isDrawEvent: false,
      stateChanged: false,
    };
  }

  // State change (tool/color/size switch)
  if (evt.type === 'state') {
    if (evt.tool) state.tool = evt.tool;
    if (evt.color) state.color = evt.color;
    if (evt.size) state.size = evt.size;
    return {
      needsFullRedraw: false,
      cursorPosition: null,
      isDrawEvent: false,
      stateChanged: true,
    };
  }

  // Cursor event
  if (evt.type === 'cursor') {
    // During shape drawing, provide preview data
    if (state.shapeStart && SHAPE_TOOLS.includes(state.tool)) {
      return {
        needsFullRedraw: false,
        cursorPosition: { x: evt.x, y: evt.y },
        isDrawEvent: false,
        stateChanged: false,
        shapePreview: {
          shape: state.tool,
          x1: state.shapeStart.x,
          y1: state.shapeStart.y,
          x2: evt.x,
          y2: evt.y,
          color: state.color,
          size: state.size,
        },
      };
    }
    return {
      needsFullRedraw: false,
      cursorPosition: { x: evt.x, y: evt.y },
      isDrawEvent: false,
      stateChanged: false,
    };
  }

  // Click event (cursor press indicator)
  if (evt.type === 'click') {
    return {
      needsFullRedraw: false,
      cursorPosition: { x: evt.x, y: evt.y },
      isDrawEvent: false,
      stateChanged: false,
    };
  }

  // Compact stroke event
  if (evt.type === 'stroke') {
    state.tool = evt.tool || 'pen';
    state.color = evt.color || '#1e293b';
    if (evt.size) state.size = evt.size;

    const offsets = buildOffsets(allEvents);
    const deleted = buildDeletedSet(allEvents);
    drawEvent(ctx, evt, 1, offsets, deleted);

    // Parse last point from path for cursor position
    let cursorX = evt.x;
    let cursorY = evt.y;
    if (evt.path) {
      const commands = evt.path.split(' ');
      const last = commands[commands.length - 1];
      if (last && (last.startsWith('L') || last.startsWith('M'))) {
        const [px, py] = last.slice(1).split(',').map(Number);
        cursorX = px;
        cursorY = py;
      }
    }

    return {
      needsFullRedraw: false,
      cursorPosition: { x: cursorX, y: cursorY },
      isDrawEvent: true,
      stateChanged: false,
    };
  }

  // Draw events: start, move, end, shape, fill
  if (evt.type === 'start') {
    state.tool = evt.tool || 'pen';
    state.color = evt.color || '#1e293b';
    if (evt.size) state.size = evt.size;
    if (SHAPE_TOOLS.includes(state.tool)) {
      state.shapeStart = { x: evt.x, y: evt.y };
    }
  } else if (evt.type === 'shape') {
    state.tool = evt.shape || 'rect';
    state.color = evt.color || '#1e293b';
    if (evt.size) state.size = evt.size;
    state.shapeStart = null;
  } else if (evt.type === 'fill') {
    state.tool = 'fill';
    state.color = evt.color || '#1e293b';
  } else if (evt.type === 'end') {
    state.shapeStart = null;
  }

  // Draw the event with current offsets
  const offsets = buildOffsets(allEvents);
  const deleted = buildDeletedSet(allEvents);
  drawEvent(ctx, evt, 1, offsets, deleted);

  // For shape events, cursor goes to x2/y2 (end point, not start)
  const cursorX = evt.type === 'shape' && evt.x2 != null ? evt.x2 : evt.x;
  const cursorY = evt.type === 'shape' && evt.y2 != null ? evt.y2 : evt.y;

  return {
    needsFullRedraw: false,
    cursorPosition: { x: cursorX, y: cursorY },
    isDrawEvent: true,
    stateChanged: false,
  };
}

// -- Helpers --

/**
 * Compute playback progress as 0-1.
 * Time-based for smoothness, but held back when stalled on stream data.
 * Monotonic: never decreases from previousProgress.
 */
export function computePlaybackProgress({
  elapsed,
  start,
  end,
  stalledOnStream,
  lastProcessedTime,
  previousProgress,
}: {
  elapsed: number;
  start: number;
  end: number;
  stalledOnStream: boolean;
  lastProcessedTime: number;
  previousProgress: number;
}): number {
  const range = end - start;
  if (range <= 0) return previousProgress;
  const displayTime = stalledOnStream ? lastProcessedTime : elapsed;
  const next = Math.min(1, (displayTime - start) / range);
  return next > previousProgress ? next : previousProgress;
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function Loading() {
  return (
    <div className="bg-surface flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
    </div>
  );
}

export function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="bg-surface flex h-screen items-center justify-center text-red-500">
      Error: {msg}
    </div>
  );
}

function handleModalBackdropClick(
  event: React.MouseEvent<HTMLDivElement>,
  onClose: () => void,
) {
  event.stopPropagation();
  if (event.target !== event.currentTarget) return;
  event.preventDefault();
  onClose();
}

function stopModalClick(event: React.MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function handleModalCloseClick(
  event: React.MouseEvent<HTMLButtonElement>,
  onClose: () => void,
) {
  event.preventDefault();
  event.stopPropagation();
  onClose();
}

function AnimatedNumber({ value }: { value: number }) {
  const [state, setState] = useState({
    prev: value,
    key: 0,
    direction: 'up' as 'up' | 'down',
  });

  // Derive new state when value changes (React pattern for syncing props to state)
  if (value !== state.prev) {
    setState({
      prev: value,
      key: state.key + 1,
      direction: value > state.prev ? 'up' : 'down',
    });
  }

  return (
    <span
      key={state.key}
      className="inline-block tabular-nums"
      style={{
        animation:
          state.key > 0 ? `slide-in-${state.direction} 0.25s ease-out` : 'none',
      }}
    >
      {value}
    </span>
  );
}

export function UpvoteButton({
  sketchId,
  score,
  votes,
  compact,
  authorId,
}: {
  sketchId: string;
  score: number;
  votes: { id: string }[];
  compact?: boolean;
  authorId?: string;
}) {
  const { user } = db.useAuth();
  const isOwnSketch = !!user && !!authorId && user.id === authorId;
  const voted = isOwnSketch || votes.length > 0;
  // Author's implicit upvote adds 1 to the stored score
  const adjustedScore = score + 1;
  const optimistic = useOptimisticVoteEntry(sketchId);
  const [showLogin, setShowLogin] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [pending, setPending] = useState(false);

  const displayVoted = optimistic ? optimistic.voted : voted;
  const displayScore = optimistic ? optimistic.score + 1 : adjustedScore;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isOwnSketch) return;

    if (!user) {
      setShowLogin(true);
      return;
    }
    if (!user.email) {
      setShowUpgrade(true);
      return;
    }

    if (pending) return;
    setPending(true);

    const nextDisplayScore = displayVoted
      ? Math.max(0, displayScore - 1)
      : displayScore + 1;
    const nextStoredScore = Math.max(0, nextDisplayScore - 1);
    const nextVoted = !displayVoted;
    const requestId = beginOptimisticVote(sketchId, {
      score: nextStoredScore,
      voted: nextVoted,
    });

    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sketchId }),
      });
      if (!response.ok) {
        throw new Error('Vote request failed');
      }
      const result = (await response.json()) as { score?: number };
      settleOptimisticVote(sketchId, requestId, {
        score: result.score ?? nextStoredScore,
        voted: nextVoted,
      });
    } catch {
      // Revert on error
      clearOptimisticVote(sketchId, requestId);
    } finally {
      setPending(false);
    }
  };

  if (compact) {
    return (
      <>
        {showLogin &&
          createPortal(
            <LoginModal onClose={() => setShowLogin(false)} />,
            document.body,
          )}
        {showUpgrade &&
          createPortal(
            <LoginModal
              onClose={() => setShowUpgrade(false)}
              title="Sign up / Log in"
              description="Enter your email to save and vote on sketches."
            />,
            document.body,
          )}
        <button
          onClick={
            isOwnSketch
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : handleClick
          }
          className={`flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white tabular-nums transition-colors ${isOwnSketch ? '!cursor-default' : 'cursor-pointer hover:bg-black/70'}`}
        >
          <PencilIcon size={12} filled={displayVoted} />
          {displayScore > 0 && <AnimatedNumber value={displayScore} />}
        </button>
      </>
    );
  }

  return (
    <>
      {showLogin &&
        createPortal(
          <LoginModal onClose={() => setShowLogin(false)} />,
          document.body,
        )}
      {showUpgrade &&
        createPortal(
          <LoginModal
            onClose={() => setShowUpgrade(false)}
            title="Sign up / Log in"
            description="Enter your email to save and vote on sketches."
          />,
          document.body,
        )}
      <button
        onClick={
          isOwnSketch
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
              }
            : handleClick
        }
        className={`border-border-strong flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold tabular-nums transition-all sm:rounded-xl sm:px-5 sm:py-2 ${
          displayVoted ? 'text-text-primary' : 'text-text-secondary'
        } ${
          isOwnSketch
            ? '!cursor-default'
            : 'hover:bg-hover cursor-pointer active:scale-95'
        }`}
      >
        <PencilIcon size={16} filled={displayVoted} />
        <AnimatedNumber value={displayScore} />
      </button>
    </>
  );
}

export function SketchCard({
  sketch,
  isAdmin,
  playbackSpeed,
  showCursor,
}: {
  sketch: {
    id: string;
    createdAt: number;
    score?: number | null;
    votes?: { id: string }[];
    stream?: { id: string; done?: boolean | null };
    thumbnail?: { url: string };
    author?: { id?: string; handle?: string | null };
    duration?: number | null;
    durationMs?: number | null;
    trimStart?: number | null;
    trimEnd?: number | null;
    remixOf?: { author?: { handle?: string | null } } | null;
  };
  isAdmin?: boolean;
  playbackSpeed?: number;
  showCursor?: boolean;
}) {
  const { user } = db.useAuth();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [replayRestartKey, setReplayRestartKey] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const stream = sketch.stream;
  const thumbnailUrl = sketch.thumbnail?.url;
  const authorHandle = sketch.author?.handle;

  // Track if this card has ever shown a live stream so we can preload the
  // thumbnail before swapping away from the canvas (avoids flash of "No preview").
  const isCurrentlyLive = !!stream?.id && !stream?.done;
  const [everLive, setEverLive] = useState(isCurrentlyLive);
  const [thumbPreloaded, setThumbPreloaded] = useState(false);

  if (isCurrentlyLive && !everLive) {
    setEverLive(true);
  }

  useEffect(() => {
    if (!confirmDelete) {
      setDeletePending(false);
    }
  }, [confirmDelete]);

  useEffect(() => {
    if (!everLive || !thumbnailUrl) return;
    let cancelled = false;
    const img = new Image();
    img.src = thumbnailUrl;
    const done = () => {
      if (!cancelled) setThumbPreloaded(true);
    };
    if (img.complete) {
      done();
    } else {
      img.onload = done;
      img.onerror = done;
    }
    return () => {
      cancelled = true;
    };
  }, [everLive, thumbnailUrl]);

  // Effective duration in ms — same calculation as the playback bar
  const totalMs =
    sketch.durationMs ?? (sketch.duration ? sketch.duration * 1000 : null);
  const effectiveDurationMs = totalMs
    ? (sketch.trimEnd ?? totalMs) - (sketch.trimStart ?? 0)
    : null;

  // Detect orphaned streams (not closed but past expected duration)
  const maxDurationMs = sketch.duration
    ? sketch.duration * 1000 + 5000
    : 120_000;
  const [now] = useState(() => Date.now());
  const isOrphaned =
    stream &&
    !stream.done &&
    !!sketch.createdAt &&
    now > sketch.createdAt + maxDurationMs;
  const isLive = !!stream && !stream.done && !isOrphaned;

  return (
    <>
      <Link
        href={`/sketch/${sketch.id}`}
        className="group border-border bg-surface hover:shadow-border relative block w-full overflow-hidden rounded-xl border text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] sm:rounded-2xl"
        onMouseEnter={() => {
          setIsHovering(true);
          // Start a subscription to warm the reactive cache for the sketch page.
          const unsub = db.core.subscribeQuery(
            sketchQuery(sketch.id, user),
            async () => {
              await db.core._reactor.querySubs.flush();
              unsub();
            },
          );
        }}
        onMouseLeave={() => setIsHovering(false)}
        onTouchStart={() => {
          longPressTriggered.current = false;
          longPressTimer.current = setTimeout(() => {
            longPressTriggered.current = true;
            if (stream?.done && isHovering) {
              setReplayRestartKey((value) => value + 1);
              return;
            }
            setIsHovering(true);
          }, 300);
        }}
        onTouchEnd={(e) => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          // If long-press triggered replay, prevent navigation and let it play
          if (longPressTriggered.current) {
            e.preventDefault();
            longPressTriggered.current = false;
          }
        }}
        onTouchCancel={() => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }}
        onTouchMove={() => {
          // Cancel long-press if finger moves (scrolling)
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }}
      >
        {stream && (isLive || (everLive && !thumbPreloaded)) ? (
          <LiveThumbnail
            streamId={stream.id}
            duration={sketch.duration}
            showCursor={showCursor ?? true}
          />
        ) : (
          <div
            className="relative aspect-[4/3] w-full select-none"
            onContextMenu={(e) => e.preventDefault()}
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt="Sketch thumbnail"
                className="aspect-[4/3] w-full object-cover"
                draggable={false}
              />
            ) : stream?.id ? (
              <StaticStreamThumbnail streamId={stream.id} />
            ) : (
              <div
                className="aspect-[4/3] w-full"
                style={{ backgroundColor: DEFAULT_BG }}
              />
            )}
            {isHovering && stream && stream.done && (
              <ReplayThumbnail
                key={`${stream.id}-${replayRestartKey}`}
                sketchId={sketch.id}
                authorUserId={sketch.author?.id}
                streamId={stream.id}
                trimStart={sketch.trimStart ?? 0}
                trimEnd={sketch.trimEnd ?? null}
                playbackSpeed={playbackSpeed ?? 2}
                showCursor={showCursor ?? true}
              />
            )}
          </div>
        )}
        {effectiveDurationMs != null && effectiveDurationMs > 0 && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white sm:top-2 sm:left-2 sm:text-xs">
            {Math.floor(effectiveDurationMs / 1000)}s
          </span>
        )}
        {isAdmin && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500 sm:top-2 sm:right-2"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        )}
        <div className="absolute right-0 bottom-0 left-0 flex items-center justify-between p-1.5 sm:p-2.5">
          <div className="flex items-center gap-1">
            {authorHandle ? (
              <span
                role="link"
                tabIndex={0}
                className="cursor-pointer rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black/70 sm:text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/user/${encodeURIComponent(authorHandle)}`);
                }}
              >
                @{authorHandle}
              </span>
            ) : (
              <div />
            )}
            {sketch.remixOf && (
              <span
                className="rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white sm:text-xs"
                title={
                  sketch.remixOf.author?.handle
                    ? `Remix of @${sketch.remixOf.author.handle}`
                    : 'Remix'
                }
              >
                <svg
                  className="inline-block h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isLive && (
              <span className="bg-accent text-accent-text animate-pulse rounded-full px-2 py-0.5 text-xs font-semibold">
                LIVE
              </span>
            )}
            {!isLive && (
              <UpvoteButton
                sketchId={sketch.id}
                score={sketch.score ?? 0}
                votes={sketch.votes ?? []}
                authorId={sketch.author?.id}
                compact
              />
            )}
          </div>
        </div>
      </Link>
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 pt-[10vh] pb-[40vh] sm:items-center sm:px-0 sm:pt-0 sm:pb-0"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-surface rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-text-primary mb-4 text-center font-medium">
              Delete this sketch?
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deletePending}
                className="text-text-secondary hover:bg-hover rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDeletePending(true);
                  try {
                    await db.transact(db.tx.sketches[sketch.id].delete());
                    setConfirmDelete(false);
                  } catch (error) {
                    showToast({
                      message: getErrorMessage(
                        error,
                        'Failed to delete sketch. Please try again.',
                        'Delete failed. You can only delete your own sketches for the first 5 minutes.',
                      ),
                      tone: 'error',
                    });
                  } finally {
                    setDeletePending(false);
                  }
                }}
                disabled={deletePending}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletePending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// -- Shared drawing UI components --

const TOOL_KEYS: Record<string, string> = {
  move: 'V',
  pen: 'N',
  eraser: 'E',
  rect: 'M',
  circle: 'L',
  line: '\\',
  fill: 'G',
};

export function ToolBar({
  tool,
  onToolChange,
  shapeFilled,
  onShapeFilledChange,
  brushSize,
  onBrushSizeChange,
}: {
  tool: DrawTool;
  onToolChange: (t: DrawTool) => void;
  shapeFilled: boolean;
  onShapeFilledChange: (f: boolean) => void;
  brushSize: number;
  onBrushSizeChange: (s: number) => void;
}) {
  return (
    <>
      {/* Mobile: Row 1 — tools */}
      <div className="flex w-full items-center justify-center sm:hidden">
        {(Object.keys(TOOL_ICONS) as DrawTool[]).map((t) => (
          <button
            key={t}
            onClick={() => onToolChange(t)}
            className={`flex h-12 flex-1 items-center justify-center focus-visible:outline-none ${
              tool === t ? 'text-text-primary' : 'text-text-tertiary'
            }`}
          >
            <div
              className={`rounded-xl p-2 ${tool === t ? 'bg-surface-secondary' : ''}`}
            >
              <ToolIconSvg tool={t} size={24} />
            </div>
          </button>
        ))}
        <button
          onClick={() => onShapeFilledChange(!shapeFilled)}
          className={`flex h-12 flex-1 items-center justify-center ${
            shapeFilled ? 'text-text-primary' : 'text-text-tertiary'
          }`}
        >
          <div
            className={`rounded-xl p-2 ${shapeFilled ? 'bg-surface-secondary' : ''}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              {shapeFilled ? (
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="3"
                  fill="currentColor"
                />
              ) : (
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              )}
            </svg>
          </div>
        </button>
      </div>
      {/* Mobile: Row 2 — brush sizes */}
      <div className="flex w-full items-center justify-center gap-3 sm:hidden">
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => onBrushSizeChange(s)}
            className={`flex h-11 w-11 items-center justify-center rounded-xl focus-visible:outline-none ${
              brushSize === s
                ? 'bg-surface-secondary text-text-primary'
                : 'text-text-tertiary'
            }`}
          >
            <span
              className="rounded-full bg-current"
              style={{ width: s + 4, height: s + 4 }}
            />
          </button>
        ))}
      </div>
      {/* Desktop: single row with keyboard badges */}
      <div className="hidden w-full items-center justify-center gap-4 sm:flex">
        <div className="flex items-center gap-1">
          {(Object.keys(TOOL_ICONS) as DrawTool[]).map((t) => (
            <button
              key={t}
              onClick={() => onToolChange(t)}
              className={`relative rounded-lg p-1.5 transition-all focus-visible:outline-none ${
                tool === t
                  ? 'bg-surface-secondary text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
              title={`${t.charAt(0).toUpperCase() + t.slice(1)} (${TOOL_KEYS[t]})`}
            >
              <ToolIconSvg tool={t} size={20} />
              <span className="bg-surface-secondary text-text-secondary absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded text-[9px] font-bold">
                {TOOL_KEYS[t]}
              </span>
            </button>
          ))}
          <button
            onClick={() => onShapeFilledChange(!shapeFilled)}
            className={`relative cursor-pointer rounded-lg p-1.5 transition-all focus-visible:outline-none ${
              shapeFilled
                ? 'bg-surface-secondary text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            title={`${shapeFilled ? 'Filled' : 'Hollow'} (F)`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              {shapeFilled ? (
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="3"
                  fill="currentColor"
                />
              ) : (
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              )}
            </svg>
            <span className="bg-surface-secondary text-text-secondary absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded text-[9px] font-bold">
              F
            </span>
          </button>
        </div>
        <div className="bg-border h-6 w-px" />
        <div className="flex items-center gap-1">
          {BRUSH_SIZES.map((s, i) => {
            const key = ['Q', 'W', 'R', 'T'][i];
            return (
              <button
                key={s}
                onClick={() => onBrushSizeChange(s)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all focus-visible:outline-none ${
                  brushSize === s
                    ? 'bg-surface-secondary text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title={`Size ${BRUSH_SIZE_LABELS[i]} (${key})`}
              >
                <span
                  className="rounded-full bg-current"
                  style={{ width: s + 2, height: s + 2 }}
                />
                <span className="bg-surface-secondary text-text-secondary absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded text-[9px] font-bold">
                  {key}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function PaletteColor({
  color,
  isSelected,
  ring,
  border,
  shortcut,
  size,
  onClick,
  onRightClickChange,
}: {
  color: string;
  isSelected: boolean;
  ring: string;
  border?: boolean;
  shortcut?: string;
  size?: number;
  onClick: () => void;
  onRightClickChange?: (newColor: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const isShift = shortcut?.startsWith('Shift+');
  const shortcutLabel = shortcut
    ? isShift
      ? `\u21E7${shortcut.replace('Shift+', '')}`
      : shortcut
    : undefined;

  const startLongPress = (e: React.TouchEvent) => {
    if (!onRightClickChange) return;
    // Prevent browser context menu / text selection from stealing the touch
    e.preventDefault();
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      inputRef.current?.click();
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          if (didLongPress.current) {
            e.preventDefault();
            didLongPress.current = false;
            return;
          }
          onClick();
        }}
        onContextMenu={
          onRightClickChange
            ? (e) => {
                e.preventDefault();
                inputRef.current?.click();
              }
            : undefined
        }
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className={`${size ? '' : 'h-[30px] w-[30px] sm:h-7 sm:w-7'} shrink-0 rounded-full shadow-sm transition-all ${
          border ? 'border-border border' : ''
        } ${
          isSelected
            ? `scale-110 ring-2 ${ring} ring-offset-2`
            : 'hover:scale-110'
        }`}
        style={{
          backgroundColor: color,
          ...(size ? { width: size, height: size } : {}),
        }}
        title={
          onRightClickChange
            ? `${shortcut ? `(${shortcut}) ` : ''}Left-click to select, right-click to change`
            : shortcut
              ? `(${shortcut})`
              : undefined
        }
      />
      {shortcutLabel && (
        <span className="bg-surface-secondary text-text-secondary absolute -top-1.5 -right-1.5 hidden h-3.5 min-w-3.5 items-center justify-center rounded px-0.5 text-[8px] leading-none font-bold sm:flex">
          {shortcutLabel}
        </span>
      )}
      {onRightClickChange && (
        <input
          ref={inputRef}
          type="color"
          value={color}
          onChange={(e) => onRightClickChange(e.target.value)}
          className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
        />
      )}
    </div>
  );
}

function PaletteRowMobile({
  label,
  palette,
  selectedColor,
  onColorChange,
  ring,
  border,
  onPaletteChange,
}: {
  label: string;
  palette: string[];
  selectedColor: string;
  onColorChange: (c: string) => void;
  ring: string;
  border?: boolean;
  onPaletteChange?: (index: number, color: string) => void;
}) {
  const half = Math.ceil((palette.length + 1) / 2); // +1 for custom picker
  const row1 = palette.slice(0, half);
  const row2 = palette.slice(half);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-text-tertiary text-[10px] font-medium tracking-wider uppercase">
        {label}
      </span>
      <div className="flex items-center justify-center gap-3">
        {row1.map((c, i) => (
          <PaletteColor
            key={i}
            color={c}
            isSelected={selectedColor === c}
            ring={ring}
            border={border}
            size={36}
            onClick={() => onColorChange(c)}
            onRightClickChange={
              onPaletteChange
                ? (nc) => {
                    onPaletteChange(i, nc);
                    onColorChange(nc);
                  }
                : undefined
            }
          />
        ))}
      </div>
      <div className="flex items-center justify-center gap-3">
        {row2.map((c, i) => (
          <PaletteColor
            key={i}
            color={c}
            isSelected={selectedColor === c}
            ring={ring}
            border={border}
            size={36}
            onClick={() => onColorChange(c)}
            onRightClickChange={
              onPaletteChange
                ? (nc) => {
                    onPaletteChange(half + i, nc);
                    onColorChange(nc);
                  }
                : undefined
            }
          />
        ))}
        <label
          className={`border-border-strong relative h-9 w-9 shrink-0 cursor-pointer rounded-full border-2 border-dashed ${
            !palette.includes(selectedColor)
              ? `ring-2 ${ring} ring-offset-2`
              : ''
          }`}
          style={{ backgroundColor: selectedColor }}
        >
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

function PaletteRowDesktop({
  label,
  palette,
  selectedColor,
  onColorChange,
  ring,
  border,
  shortcutPrefix,
  onPaletteChange,
}: {
  label: string;
  palette: string[];
  selectedColor: string;
  onColorChange: (c: string) => void;
  ring: string;
  border?: boolean;
  shortcutPrefix?: string;
  onPaletteChange?: (index: number, color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-tertiary text-xs tracking-wide uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2.5">
        {palette.map((c, i) => (
          <PaletteColor
            key={`${label}-${i}`}
            color={c}
            isSelected={selectedColor === c}
            ring={ring}
            border={border}
            shortcut={
              i < 9
                ? shortcutPrefix
                  ? `${shortcutPrefix}${i + 1}`
                  : `${i + 1}`
                : undefined
            }
            onClick={() => onColorChange(c)}
            onRightClickChange={
              onPaletteChange
                ? (newColor) => {
                    onPaletteChange(i, newColor);
                    onColorChange(newColor);
                  }
                : undefined
            }
          />
        ))}
        <label
          className={`border-border-strong relative h-7 w-7 shrink-0 cursor-pointer rounded-full border-2 border-dashed transition-all hover:scale-110 ${
            !palette.includes(selectedColor)
              ? `scale-110 ring-2 ${ring} ring-offset-2`
              : ''
          }`}
          style={{ backgroundColor: selectedColor }}
        >
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

export function ColorPickers({
  penPalette,
  bgPalette,
  penColor,
  bgColor,
  onPenColorChange,
  onBgColorChange,
  onPaletteChange,
}: {
  penPalette: string[];
  bgPalette: string[];
  penColor: string;
  bgColor: string;
  onPenColorChange: (c: string) => void;
  onBgColorChange: (c: string) => void;
  onPaletteChange?: (type: 'pen' | 'bg', index: number, color: string) => void;
}) {
  return (
    <>
      {/* Mobile */}
      <div className="flex w-full flex-col items-center gap-4 sm:hidden">
        <PaletteRowMobile
          label="Pen"
          palette={penPalette}
          selectedColor={penColor}
          onColorChange={onPenColorChange}
          ring="ring-slate-500"
          onPaletteChange={
            onPaletteChange ? (i, c) => onPaletteChange('pen', i, c) : undefined
          }
        />
        <PaletteRowMobile
          label="BG"
          palette={bgPalette}
          selectedColor={bgColor}
          onColorChange={onBgColorChange}
          ring="ring-stone-500"
          border
          onPaletteChange={
            onPaletteChange ? (i, c) => onPaletteChange('bg', i, c) : undefined
          }
        />
      </div>
      {/* Desktop */}
      <div className="hidden items-center justify-center gap-6 sm:flex">
        <PaletteRowDesktop
          label="Pen"
          palette={penPalette}
          selectedColor={penColor}
          onColorChange={onPenColorChange}
          ring="ring-slate-500"
          onPaletteChange={
            onPaletteChange ? (i, c) => onPaletteChange('pen', i, c) : undefined
          }
        />
        <div className="bg-border h-6 w-px" />
        <PaletteRowDesktop
          label="BG"
          palette={bgPalette}
          selectedColor={bgColor}
          onColorChange={onBgColorChange}
          ring="ring-stone-500"
          border
          shortcutPrefix="Shift+"
          onPaletteChange={
            onPaletteChange ? (i, c) => onPaletteChange('bg', i, c) : undefined
          }
        />
      </div>
    </>
  );
}
