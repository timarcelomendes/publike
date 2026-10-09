import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { iniciais, urlDaFoto } from "@/lib/formato";
import { LOGO } from "./logo-caminhos";

export function Container({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`} {...props} />;
}

// ------------------------------------------------------------------ Selo

const SELOS = {
  neutro: "bg-surface-300 text-ink",
  novo: "bg-ipe text-on-ipe",
  match: "bg-cerrado text-on-cerrado",
  like: "bg-like-soft text-like-text",
  aviso: "bg-terra-soft text-terra-text",
  perigo: "border border-danger text-danger",
  contorno: "border border-line-strong text-ink-muted",
} as const;

export type VarianteSelo = keyof typeof SELOS;

/** Selos e chips usam o estilo caption em maiúsculas (Design System). */
export function Selo({
  variante = "neutro",
  className = "",
  children,
}: {
  variante?: VarianteSelo;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-caption whitespace-nowrap uppercase [&_svg]:size-3.5 ${SELOS[variante]} ${className}`}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Aviso

const AVISOS: Record<string, { classe: string; icone: LucideIcon; cor: string }> = {
  info: { classe: "bg-surface-300", icone: Info, cor: "text-ink-muted" },
  sucesso: { classe: "bg-surface-300", icone: CircleCheck, cor: "text-cerrado-text" },
  alerta: { classe: "bg-terra-soft", icone: TriangleAlert, cor: "text-terra-text" },
  erro: { classe: "border border-danger bg-surface-200", icone: CircleAlert, cor: "text-danger" },
};

export function Aviso({
  tipo = "info",
  titulo,
  children,
  className = "",
}: {
  tipo?: "info" | "sucesso" | "alerta" | "erro";
  titulo?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { classe, icone: Icone, cor } = AVISOS[tipo];
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={`flex gap-3 rounded-md p-4 text-body-sm text-ink ${classe} ${className}`}
    >
      <Icone aria-hidden className={`mt-0.5 size-5 shrink-0 ${cor}`} />
      <div className="flex min-w-0 flex-col gap-1">
        {titulo && <p className="text-label">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Avatar

export function Avatar({
  nome,
  foto,
  tamanho = 40,
  className = "",
}: {
  nome: string;
  foto?: string | null;
  tamanho?: number;
  className?: string;
}) {
  const url = urlDaFoto(foto);
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={tamanho}
        height={tamanho}
        unoptimized
        className={`shrink-0 rounded-pill bg-surface-300 object-cover ${className}`}
        style={{ width: tamanho, height: tamanho }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-pill bg-surface-300 font-display font-bold text-ink ${className}`}
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.38) }}
    >
      {iniciais(nome)}
    </span>
  );
}

// ------------------------------------------------------------------ Esqueleto e vazio

export function Esqueleto({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-300 ${className}`} />;
}

export function Vazio({
  icone: Icone,
  titulo,
  children,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface-200 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-pill bg-surface-300 text-ink">
        <Icone aria-hidden className="size-6" />
      </span>
      <h2 className="text-h3">{titulo}</h2>
      {children && <div className="max-w-md text-body-sm text-ink-muted">{children}</div>}
      {acao && <div className="mt-2 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Logo

/**
 * A assinatura, desenhada aqui mesmo (sem arquivo) para o "li" poder se mexer:
 * ele troca entre ink (lê-se publi) e vermelho (lê-se like), 1,8 s em cada
 * leitura e 0,6 s de troca. Parado (`animado={false}`) e para quem pede menos
 * movimento, o li fica meio a meio. No tema escuro, o ink vira branco.
 * Regras e arquivos: guia da marca (public/logo/).
 */
export function Logo({ altura = 32, className = "", animado = true }: { altura?: number; className?: string; animado?: boolean }) {
  const largura = Math.round((altura * 806) / 217);
  const meio = (
    <>
      <path d={LOGO.liBaixo} fill="#e0192d" />
      <path d={LOGO.liCima} className="logo-ink" />
    </>
  );
  return (
    <svg
      viewBox="0 0 806 217"
      width={largura}
      height={altura}
      role="img"
      aria-label="Publike"
      className={`logo-publike block ${className}`}
    >
      <path d={LOGO.simbolo} fill="#e0192d" />
      <path d={LOGO.pub} className="logo-ink" />
      {animado ? (
        <>
          <g className="logo-meio">{meio}</g>
          <path d={LOGO.li} className="logo-li" />
        </>
      ) : (
        meio
      )}
      <path d={LOGO.ke} fill="#e0192d" />
    </svg>
  );
}

export function Simbolo({ altura = 32, className = "" }: { altura?: number; className?: string }) {
  const largura = Math.round((altura * 131) / 183);
  return (
    <picture className={className}>
      <source media="(prefers-color-scheme: dark)" srcSet="/logo/publike-simbolo-branco.svg" />
      <img src="/logo/publike-simbolo.svg" alt="" width={largura} height={altura} className="block" />
    </picture>
  );
}
