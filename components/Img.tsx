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
  ...imgRest
}: Props) {
  if (!src) return null;

  const stringSrc = typeof src === "string" ? src : String(src);
  const useNativeImg =
    unoptimized || stringSrc.toLowerCase().endsWith(".svg");

  if (useNativeImg) {
    return (
      <img
        src={stringSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={style as React.CSSProperties | undefined}
        sizes={sizes}
        {...imgRest}
      />
    );
  }

  const w = typeof width === "number" ? width : Number(width);
  const h = typeof height === "number" ? height : Number(height);
  const hasSize = Number.isFinite(w) && Number.isFinite(h);

  if (hasSize) {
    return (
      <Image
        src={stringSrc}
        alt={alt}
        width={w as number}
        height={h as number}
        className={className}
        style={style as React.CSSProperties | undefined}
        sizes={sizes}
        {...(imgRest as NextImageRestProps)}
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
        src={stringSrc}
        alt={alt}
        fill
        sizes={sizes}
        style={{ objectFit: "cover" }}
        {...(imgRest as NextImageRestProps)}
      />
    </span>
  );
}
