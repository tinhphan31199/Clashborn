"use client";

import React from "react";

/** Nút menu kiểu mobile-game: cao cỡ ngón tay, full-width. */
export function MenuButton({
  children,
  onClick,
  disabled,
  primary,
  danger,
  small,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "flex w-full items-center justify-center gap-2 rounded-xl border font-semibold tracking-wide transition-all active:scale-[0.98]",
        small ? "min-h-[48px] px-3 py-2 text-sm" : "min-h-[56px] px-5 py-3 text-base",
        primary
          ? "border-amber-300 bg-amber-500/20 text-amber-200 hover:bg-amber-500/35 hover:shadow-[0_0_18px_rgba(251,191,36,0.35)]"
          : danger
            ? "border-red-500/60 bg-red-900/40 text-red-200 hover:bg-red-800/50"
            : "border-zinc-700 bg-zinc-800/80 text-zinc-100 hover:border-amber-400/60 hover:bg-zinc-700/80",
        disabled ? "cursor-not-allowed opacity-40 hover:shadow-none" : "cursor-pointer",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`w-full rounded-2xl border border-zinc-700/80 bg-zinc-900/90 shadow-2xl backdrop-blur ${
        wide ? "max-w-[720px]" : "max-w-[520px]"
      } p-4 sm:p-6`}
    >
      {children}
    </div>
  );
}

/** Khung màn mobile-game: nền cố định + cột nội dung cuộn. */
export function MenuScreen({
  children,
  narrow,
}: {
  children: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="relative min-h-dvh w-screen bg-black text-white">
      <MenuBackground />
      <div
        className={`relative z-10 mx-auto flex min-h-dvh w-full flex-col items-center px-4 pb-10 pt-4 ${
          narrow ? "max-w-[480px]" : "max-w-[760px]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Header sticky kiểu app mobile: nút về tròn + tiêu đề giữa + thanh blur. */
export function MobileHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <div className="-mx-4 sticky top-0 z-10 w-[calc(100%+2rem)] border-b border-white/10 bg-black/70 px-4 pb-2 pt-2 backdrop-blur-md">
      <div className="relative flex min-h-[44px] items-center">
        <button
          onClick={onBack}
          aria-label="Quay lại"
          className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/40 bg-zinc-800/90 text-2xl leading-none text-amber-200 transition-transform active:scale-95"
        >
          ‹
        </button>
        <div className="mx-auto max-w-[70%] text-center">
          <h2 className="truncate text-lg font-black leading-tight text-amber-200">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        <div className="absolute right-0 w-11" />
      </div>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300/90">
      {children}
    </div>
  );
}

export function Row({
  label,
  hint,
  right,
}: {
  label: string;
  hint?: string;
  right: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

/** Nền menu: ảnh PixelLab + phủ tối + lưới mờ (cố định khi cuộn). */
export function MenuBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <img
        src="/menu/bg.png"
        alt=""
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: "cover", imageRendering: "pixelated" }}
      />
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 500px at 20% 10%, rgba(59,130,246,0.12), transparent 60%), radial-gradient(900px 500px at 85% 15%, rgba(239,68,68,0.12), transparent 60%), linear-gradient(180deg, rgba(9,9,11,0.4) 0%, transparent 40%, rgba(9,9,11,0.7) 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}

/** Icon pixel-art cho nút menu (rớt về emoji nếu thiếu file). */
export function BtnIcon({ src, emoji, size = 20 }: { src: string; emoji: string; size?: number }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="inline-block align-[-4px]"
      style={{ imageRendering: "pixelated" }}
      onError={(e) => {
        // Rớt về emoji nếu file ảnh chưa có.
        const span = document.createElement("span");
        span.textContent = emoji;
        e.currentTarget.replaceWith(span);
      }}
    />
  );
}

export function SegButtons<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onPick(o.value)}
          className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
            value === o.value
              ? "border-amber-300 bg-amber-500/25 text-amber-100"
              : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
