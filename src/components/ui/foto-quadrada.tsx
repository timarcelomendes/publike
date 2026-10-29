"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * A foto da empresa no quadro arredondado. Foto (quadrada ou em pé) preenche o quadro inteiro; logo
 * largo (mais largo que alto) fica inteiro num quadro branco com folga, para não cortar o nome.
 * A proporção só se sabe depois de carregar: começa preenchendo, que é o caso mais comum.
 */
export function FotoQuadrada({
  url,
  tamanho,
  raio,
  className = "",
}: {
  url: string;
  tamanho: number;
  raio: CSSProperties;
  className?: string;
}) {
  const [larga, setLarga] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const medir = (el: HTMLImageElement | null) => {
    if (el?.naturalWidth && el.naturalHeight) setLarga(el.naturalWidth / el.naturalHeight > 1.25);
  };
  // a imagem que já estava no cache carrega antes do React ligar o onLoad
  useEffect(() => medir(img.current), [url]);
  const folga = larga ? Math.max(2, Math.round(tamanho * 0.1)) : 0;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-[#fff] shadow-[inset_0_0_0_1px_var(--pk-line)] ${className}`}
      style={{ width: tamanho, height: tamanho, padding: folga, ...raio }}
    >
      <Image
        src={url}
        alt=""
        width={tamanho}
        height={tamanho}
        unoptimized
        ref={img}
        onLoad={(e) => medir(e.currentTarget)}
        className={`size-full ${larga ? "object-contain" : "object-cover"}`}
        style={raio}
      />
    </span>
  );
}
