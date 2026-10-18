"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A foto da notícia; se ela não abrir (foi apagada na origem), mostra a capa desenhada e some a legenda. */
export function FotoComReserva({
  src,
  alt,
  className,
  carregar,
  reserva,
  legenda,
}: {
  src: string;
  alt: string;
  className: string;
  carregar: "eager" | "lazy";
  reserva: ReactNode;
  legenda?: ReactNode;
}) {
  const [falhou, setFalhou] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // o erro pode ter acontecido antes do React chegar: confere ao abrir
  useEffect(() => {
    const i = img.current;
    if (i?.complete && i.naturalWidth === 0) setFalhou(true);
  }, []);
  if (falhou) return reserva;
  return (
    <>
      {/* a foto vem do Flickr ou da Wikimedia já num tamanho bom: sem passar pelo otimizador */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt={alt}
        loading={carregar}
        decoding="async"
        onError={() => setFalhou(true)}
        className={`block w-full bg-surface-300 object-cover ${className}`}
      />
      {legenda}
    </>
  );
}
