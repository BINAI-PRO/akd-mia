// components/Img.tsx
import Image from "next/image";
import React, { useEffect, useState } from "react";

type NextImageRestProps = Omit<
  React.ComponentProps<typeof Image>,
  "src" | "alt" | "width" | "height" | "fill" | "sizes"
>;

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  sizes?: string;
  unoptimized?: boolean;
  fallbackSrc?: string;
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
  fallbackSrc,
  ...imgRest
}: Props) {
  if (!src) return null;

  const stringSrc = typeof src === "string" ? src : String(src);
  const [currentSrc, setCurrentSrc] = useState<string>(stringSrc);

  useEffect(() => {
    setCurrentSrc(stringSrc);
  }, [stringSrc]);

  const handleFallback = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      event.preventDefault();
      setCurrentSrc(fallbackSrc);
      return true;
    }
    return false;
  };

  const useNativeImg =
    unoptimized || stringSrc.toLowerCase().endsWith(".svg");

  if (useNativeImg) {
    const { onError, ...rest } = imgRest;
    const nativeProps = rest as React.ImgHTMLAttributes<HTMLImageElement>;
    return (
      <img
        src={currentSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={style as React.CSSProperties | undefined}
        sizes={sizes}
        onError={(event) => {
          const handled = handleFallback(event);
          if (!handled) onError?.(event as React.SyntheticEvent<HTMLImageElement>);
        }}
        {...nativeProps}
      />
    );
  }

  const w = typeof width === "number" ? width : Number(width);
  const h = typeof height === "number" ? height : Number(height);
  const hasSize = Number.isFinite(w) && Number.isFinite(h);

  if (hasSize) {
    const { onError, ...rest } = imgRest as NextImageRestProps & {
      onError?: React.ReactEventHandler<HTMLImageElement>;
    };
    return (
      <Image
        src={currentSrc}
        alt={alt}
        width={w as number}
        height={h as number}
        className={className}
        style={style as React.CSSProperties | undefined}
        sizes={sizes}
        onError={(event) => {
          const handled = handleFallback(event);
          if (!handled) onError?.(event as React.SyntheticEvent<HTMLImageElement>);
        }}
        {...rest}
      />
    );
  }

  // fallback sin width/height: fill con contenedor 16:9
  const { onError, ...rest } = imgRest as NextImageRestProps & {
    onError?: React.ReactEventHandler<HTMLImageElement>;
  };

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
        src={currentSrc}
        alt={alt}
        fill
        sizes={sizes}
        style={{ objectFit: "cover" }}
        onError={(event) => {
          const handled = handleFallback(event);
          if (!handled) {
            onError?.(event as React.SyntheticEvent<HTMLImageElement>);
          }
        }}
        {...(rest as NextImageRestProps)}
      />
    </span>
  );
}
