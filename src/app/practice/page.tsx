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
    <div className="flex min-h-[100dvh] flex-col items-center bg-white font-sans text-gray-800">
      <AuthHeader />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-base text-gray-500 sm:text-lg">
          Sign in to practice drawing
        </p>
        <button
          onClick={() => setShowLogin(true)}
          className="cursor-pointer rounded-xl bg-slate-700 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-slate-200 transition-all hover:bg-slate-800 sm:text-base"
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
        <div className="flex min-h-[100dvh] flex-col bg-white font-sans text-gray-800">
          <div className="flex w-full items-center justify-between px-3 pt-2 sm:mx-auto sm:max-w-4xl sm:px-6 sm:pt-4">
            <Link href="/" className="text-lg font-bold tracking-tight sm:text-xl">
              <span className="text-slate-700">ink</span>
              <span className="text-stone-500">dot</span>
              <span className="ml-1.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 sm:px-2 sm:text-xs">
                Practice
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/new"
                className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-slate-800 sm:rounded-xl sm:px-4 sm:py-1.5 sm:text-sm"
              >
                Create sketch
              </Link>
            </div>
          </div>
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
    <div className="flex w-full flex-1 flex-col sm:mx-auto sm:max-w-4xl sm:p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-0 sm:pb-4">
        <Link
          href="/new"
          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-slate-300 hover:text-gray-800"
        >
          Create sketch
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
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
                ? 'border-slate-300 bg-slate-50 text-slate-700'
                : 'border-gray-200 text-gray-500 hover:text-gray-800'
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
                      ? 'border-slate-700 bg-slate-700 text-white'
                      : 'border-gray-200 bg-white text-gray-500 hover:text-gray-800'
                  }`}
                >
                  On
                </button>
                <button
                  onClick={() => drawing.setShowTrace(false)}
                  className={`rounded-r-lg border border-l-0 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    !drawing.showTrace
                      ? 'border-slate-700 bg-slate-700 text-white'
                      : 'border-gray-200 bg-white text-gray-500 hover:text-gray-800'
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
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-500"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Easy mode template picker */}
      {drawing.showEasyMode && (
        <div className="mb-2 sm:mb-4">
          <TemplatePicker
            traceUrl={drawing.traceUrl}
            onSelectTrace={drawing.selectTrace}
            onClose={() => drawing.setShowEasyMode(false)}
            onUploadClick={() => traceInputRef.current?.click()}
          />
        </div>
      )}

      {/* Canvas */}
      <div className="relative overflow-hidden border-y border-gray-200 bg-white sm:mx-0 sm:rounded-2xl sm:border sm:shadow-lg sm:shadow-slate-100/50">
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
      </div>

      {/* Controls below canvas */}
      <div className="flex flex-col gap-2 py-1 sm:gap-4 sm:py-4">
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
              type === 'pen'
                ? [...drawing.penPalette]
                : [...drawing.bgPalette];
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
    </div>
  );
}
