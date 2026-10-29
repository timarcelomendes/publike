import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { iniciais, nomeDaConta, urlDaFoto } from "@/lib/formato";
import { FotoQuadrada } from "./foto-quadrada";
import { LOGO, LOGO_LARGURA } from "./logo-caminhos";

export function Container({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`} {...props} />;
}

// ------------------------------------------------------------------ Selo

const SELOS = {
  neutro: "bg-surface-300 text-ink",
  novo: "bg-ipe text-on-ipe",
  match: "bg-cerrado text-on-cerrado",
  /** % de match entre 50 e 79 (de 80 para cima, "match") */
  matchContorno: "border border-cerrado-text text-cerrado-text",
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
  title,
  children,
}: {
  variante?: VarianteSelo;
  className?: string;
  /** a explicação que aparece ao parar o mouse em cima */
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
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

/**
 * As cores das iniciais de quem não tem foto (cada nome cai sempre na mesma): tons fechados e
 * foscos, só para avatares, com letra clara. Sem terra (a ação principal) nem ipê (os selos).
 */
const CORES_INICIAIS = [
  "bg-avatar-cerrado text-on-avatar",
  "bg-avatar-petroleo text-on-avatar",
  "bg-avatar-ameixa text-on-avatar",
  "bg-avatar-ocre text-on-avatar",
  "bg-avatar-grafite text-on-avatar",
] as const;

/** A cor de fundo de um nome (a mesma das iniciais): para a capa colorida dos cartões. */
export function fundoDoNome(nome: string) {
  return corDoNome(nome).split(" ")[0];
}

function corDoNome(nome: string) {
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + (letra.codePointAt(0) ?? 0)) % 9973;
  return CORES_INICIAIS[soma % CORES_INICIAIS.length];
}

/**
 * Foto da conta ou, sem foto, as iniciais. Pessoa: círculo. `forma="quadrada"`: empresa, comércio
 * e agência, num quadrado de cantos arredondados (28% do lado, a mesma forma em qualquer tamanho);
 * o logo enviado fica inteiro num quadro branco com folga e borda fina, sem cortar.
 * `colorida`: as iniciais num fundo de cor, pelo nome.
 */
export function Avatar({
  nome: nomeMostrado,
  foto,
  tamanho = 40,
  className = "",
  forma = "redonda",
  colorida = false,
}: {
  nome: string;
  foto?: string | null;
  tamanho?: number;
  className?: string;
  forma?: "redonda" | "quadrada";
  colorida?: boolean;
}) {
  // "Ana Souza · Clínica Sorriso" (o responsável nas conversas): as iniciais e a cor são as da conta
  const nome = nomeDaConta(nomeMostrado);
  const url = urlDaFoto(foto);
  const quadrada = forma === "quadrada";
  const canto = quadrada ? "" : "rounded-pill";
  const raio = quadrada ? { borderRadius: Math.round(tamanho * 0.28) } : {};
  if (url && quadrada) {
    // foto: preenche o quadro; logo largo: inteiro, num quadro branco (logos são feitos para fundo claro)
    return <FotoQuadrada url={url} tamanho={tamanho} raio={raio} className={className} />;
  }
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={tamanho}
        height={tamanho}
        unoptimized
        className={`shrink-0 ${canto} bg-surface-300 object-cover ${className}`}
        style={{ width: tamanho, height: tamanho }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center ${canto} font-display font-bold ${
        colorida ? corDoNome(nome) : "bg-surface-300 text-ink"
      } ${className}`}
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.38), ...raio }}
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

// O estilo vai dentro do próprio SVG: não depende do globals.css.
const ESTILO_LOGO =
  '.lk-i{fill:#1f1a14}:root[data-tema="escuro"] .lk-i{fill:#ffffff}@media (prefers-color-scheme:dark){:root[data-tema="auto"] .lk-i{fill:#ffffff}}';

/**
 * A assinatura no site: o p de publike é o pino, com o check vazado (deu match).
 * Tudo numa cor só (ink; branca no tema escuro), e o fundo aparece pelo check.
 * A versão com o check vermelho fica para e-mail e arquivos (public/logo/publike-logo.svg).
 * Regras e arquivos: guia da marca (public/logo/).
 */
export function Logo({ altura = 32, className = "" }: { altura?: number; className?: string }) {
  const largura = Math.round((altura * LOGO_LARGURA) / 217);
  return (
    <svg
      viewBox={`0 0 ${LOGO_LARGURA} 217`}
      width={largura}
      height={altura}
      role="img"
      aria-label="Publike"
      className={`logo-publike block ${className}`}
    >
      <style>{ESTILO_LOGO}</style>
      <path d={`${LOGO.pino}${LOGO.check}`} fillRule="evenodd" className="lk-i" />
      <path d={LOGO.palavra} className="lk-i" />
    </svg>
  );
}

/** O símbolo sozinho: o pino vermelho com o check vazado (vermelho também no tema escuro). */
export function Simbolo({ altura = 32, className = "" }: { altura?: number; className?: string }) {
  const largura = Math.round((altura * 131) / 183);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG pequeno e fixo, não precisa do otimizador
    <img src="/logo/publike-simbolo.svg" alt="" width={largura} height={altura} className={`block ${className}`} />
  );
}
