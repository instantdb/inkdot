'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import {
  AuthHeader,
  LoginModal,
  ToolBar,
  ColorPickers,
  CANVAS_W,
  CANVAS_H,
} from '../components';
import {
  useDrawingCanvas,
  TemplatePicker,
  type DrawingUserSettings,
} from '../drawing';

function SignedOutPractice() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-text-secondary text-base sm:text-lg">
          Sign in to practice drawing
        </p>
        <button
          onClick={() => setShowLogin(true)}
          className="bg-accent text-accent-text shadow-border hover:bg-accent-hover cursor-pointer rounded-xl px-5 py-2 text-sm font-semibold shadow-md transition-all sm:text-base"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <>
      <db.SignedOut>
        <SignedOutPractice />
      </db.SignedOut>
      <db.SignedIn>
        <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
          <AuthHeader />
          <PracticeCanvas />
        </div>
      </db.SignedIn>
    </>
  );
}

function PracticeCanvas() {
  const user = db.useUser();
  const { data: settingsData } = db.useSuspenseQuery({
    userSettings: { $: { where: { 'owner.id': user.id } } },
  });
  const rawSettings = settingsData?.userSettings?.[0];
  const userSettings: DrawingUserSettings | undefined = rawSettings
    ? {
        id: rawSettings.id,
        lastPenColor: rawSettings.lastPenColor ?? undefined,
        lastBgColor: rawSettings.lastBgColor ?? undefined,
        lastTool: rawSettings.lastTool ?? undefined,
        lastBrushSize: rawSettings.lastBrushSize ?? undefined,
        penColors: rawSettings.penColors ?? undefined,
        bgColors: rawSettings.bgColors ?? undefined,
      }
    : undefined;

  const drawing = useDrawingCanvas({
    userId: user.id,
    userSettings,
    drawTraceOnCanvas: true,
  });
  const { canvasRef, traceInputRef } = drawing;

  const saveImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `inkdot-practice-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-2 py-2 sm:gap-4 sm:p-6">
      {/* Top bar */}
      <div className="flex min-h-11 items-center justify-between gap-2 px-2 sm:px-0">
        <Link
          href="/new"
          className="border-border text-text-secondary hover:border-border-strong hover:text-text-primary rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
        >
          Create sketch
        </Link>
        <span className="text-text-tertiary text-xs font-medium">
          Practice mode
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
          <input
            ref={traceInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={drawing.handleTraceFileChange}
          />
          <button
            onClick={() => drawing.setShowEasyMode((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              drawing.traceUrl
                ? 'border-border-strong bg-surface-secondary text-text-secondary'
                : 'border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {drawing.traceUrl ? 'Easy mode ✓' : 'Easy mode'}
          </button>
          {drawing.traceUrl && (
            <div className="flex items-center gap-2">
              <div className="flex">
                <button
                  onClick={() => drawing.setShowTrace(true)}
                  className={`rounded-l-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    drawing.showTrace
                      ? 'border-accent bg-accent text-accent-text'
                      : 'border-border bg-surface text-text-secondary hover:text-text-primary'
                  }`}
                >
                  On
                </button>
                <button
                  onClick={() => drawing.setShowTrace(false)}
                  className={`rounded-r-lg border border-l-0 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    !drawing.showTrace
                      ? 'border-accent bg-accent text-accent-text'
                      : 'border-border bg-surface text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Off
                </button>
              </div>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={drawing.traceOpacity}
                onChange={(e) =>
                  drawing.setTraceOpacity(parseFloat(e.target.value))
                }
                className={`h-1 w-14 cursor-pointer accent-slate-700 sm:w-20 ${drawing.showTrace ? 'opacity-100' : 'opacity-30'}`}
              />
            </div>
          )}
          <button
            onClick={drawing.clearCanvas}
            className="border-border text-text-secondary rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-red-300 hover:text-red-500"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Easy mode template picker */}
      {drawing.showEasyMode && (
        <TemplatePicker
          traceUrl={drawing.traceUrl}
          onSelectTrace={drawing.selectTrace}
          onClose={() => drawing.setShowEasyMode(false)}
          onUploadClick={() => traceInputRef.current?.click()}
        />
      )}

      {/* Canvas */}
      <div className="border-border bg-surface relative overflow-hidden border-y sm:rounded-2xl sm:border sm:shadow-lg sm:shadow-slate-100/50">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full cursor-crosshair"
          style={{ touchAction: 'none', backgroundColor: drawing.bgColor }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.handlePointerDown(e);
          }}
          onPointerMove={drawing.handlePointerMove}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            drawing.handlePointerUp(e);
          }}
        />
        <div className="bg-surface-secondary absolute right-0 bottom-0 left-0 h-1.5" />
      </div>

      <ToolBar
        tool={drawing.tool}
        onToolChange={drawing.changeTool}
        shapeFilled={drawing.shapeFilled}
        onShapeFilledChange={drawing.setShapeFilled}
        brushSize={drawing.brushSize}
        onBrushSizeChange={drawing.changeBrushSize}
      />

      <ColorPickers
        penPalette={drawing.penPalette}
        bgPalette={drawing.bgPalette}
        penColor={drawing.penColor}
        bgColor={drawing.bgColor}
        onPenColorChange={drawing.changePenColor}
        onBgColorChange={drawing.changeBgColor}
        onPaletteChange={(type, index, color) => {
          const current =
            type === 'pen' ? [...drawing.penPalette] : [...drawing.bgPalette];
          current[index] = color;
          drawing.saveSettings(
            type === 'pen'
              ? { penColors: current, lastPenColor: color }
              : { bgColors: current },
          );
          if (type === 'pen') {
            drawing.writeStateChange({ color });
          } else {
            drawing.changeBgColor(color);
          }
        }}
      />
    </div>
  );
}
