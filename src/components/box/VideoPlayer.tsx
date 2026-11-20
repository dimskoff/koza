// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/* Small custom player in the koza style: play/pause, seek bar, time, mute,
   fullscreen. Space / K toggles play, M mutes, F goes fullscreen. */
export function VideoPlayer({ src, autoPlay = false }: { src: string; autoPlay?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [failed, setFailed] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | null>(null);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  const seekTo = (clientX: number, bar: HTMLElement) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
    setTime(v.currentTime);
  };

  const fullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };

  /* controls fade out while playing and the mouse is still */
  const poke = () => {
    setIdle(false);
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key.toLowerCase() === "m") {
        setMuted((m) => !m);
      } else if (e.key.toLowerCase() === "f") {
        fullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const hideControls = playing && idle;

  if (failed) {
    return (
      <div className="flex h-48 w-full max-w-md flex-col items-center justify-center rounded-xl border border-white/10 bg-black/60 px-6 text-center">
        <p className="text-[14px] font-medium text-white/90">This video can&apos;t play in the browser</p>
        <p className="kz-mono mt-1 text-[11px] text-white/50">download it to watch it in your player</p>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`group relative max-h-full max-w-full overflow-hidden rounded-lg bg-black shadow-2xl ${
        hideControls ? "cursor-none" : ""
      }`}
      onMouseMove={poke}
      onClick={(e) => e.stopPropagation()}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
        className="block max-h-[calc(100dvh-140px)] max-w-full"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          poke();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (Number.isFinite(v.duration)) {
            setDuration(v.duration);
            return;
          }
          /* browser-recorded webm has no duration in its header: seeking far
             past the end makes the browser compute it, then jump back */
          const wasPaused = v.paused;
          v.addEventListener(
            "durationchange",
            () => {
              if (!Number.isFinite(v.duration)) return;
              setDuration(v.duration);
              v.currentTime = 0;
              if (!wasPaused || autoPlay) void v.play().catch(() => {});
            },
            { once: false },
          );
          v.currentTime = 1e101;
        }}
        onDurationChange={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length && v.duration) {
            setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
          }
        }}
        onError={() => setFailed(true)}
      />

      {/* big centre play button while paused */}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[var(--kz-coral)] text-[#1a0b0b] shadow-lg transition-transform hover:scale-105"
          aria-label="Play"
        >
          <Play className="ml-1 h-7 w-7" fill="currentColor" />
        </button>
      )}

      {/* control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-300 ${
          hideControls ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          className="relative h-4 cursor-pointer"
          onPointerDown={(e) => {
            const bar = e.currentTarget;
            bar.setPointerCapture(e.pointerId);
            seekTo(e.clientX, bar);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekTo(e.clientX, e.currentTarget);
          }}
          onKeyDown={(e) => {
            const v = videoRef.current;
            if (!v) return;
            if (e.key === "ArrowRight") v.currentTime = Math.min(duration, v.currentTime + 5);
            if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 5);
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
            <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${buffered}%` }} />
            <div className="absolute inset-y-0 left-0 bg-[var(--kz-coral)]" style={{ width: `${pct}%` }} />
          </div>
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
            style={{ left: `${pct}%` }}
          />
        </div>

        <div className="mt-1 flex items-center gap-1 text-white/90">
          <button
            type="button"
            onClick={toggle}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-white/10"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
          </button>
          <span className="kz-mono px-1 text-[11.5px] tabular-nums text-white/80">
            {fmtTime(time)} / {fmtTime(duration)}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-white/10"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={fullscreen}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-white/10"
            aria-label="Fullscreen"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
