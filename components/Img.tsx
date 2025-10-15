// components/Img.tsx
import Image from "next/image";
import React from "react";

type NextImageRestProps = Omit<
  React.ComponentProps<typeof Image>,
  "src" | "alt" | "width" | "height" | "fill" | "sizes"
>;

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  sizes?: string;
  unoptimized?: boolean;
};

export default function Img({
  src = "",
  alt = "",
  width,
  height,
  className,
  style,
  sizes = "(max-width: 768px) 100vw, 400px",
  unoptimized = false,
  ...rest
}: Props) {
  if (!src) return null;

  const w = typeof width === "number" ? width : Number(width);
  const h = typeof height === "number" ? height : Number(height);
  const hasSize = Number.isFinite(w) && Number.isFinite(h);

  if (hasSize) {
    return (
      <Image
        src={src as string}
        alt={alt}
        width={w as number}
        height={h as number}
        className={className}
        style={style as React.CSSProperties}
        sizes={sizes}
        unoptimized={unoptimized}
        {...(rest as NextImageRestProps)}
      />
    );
  }

  // fallback sin width/height: fill con contenedor 16:9
  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        width: "100%",
        aspectRatio: "16 / 9",
        ...(style as React.CSSProperties),
      }}
    >
      <Image
        src={src as string}
        alt={alt}
        fill
        sizes={sizes}
        style={{ objectFit: "cover" }}
        unoptimized={unoptimized}
        {...(rest as NextImageRestProps)}
      />
    </span>
  );
}
