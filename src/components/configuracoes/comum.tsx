import type { ReactNode } from "react";

/** Uma caixa da página Configurações: o título, o que faz e o conteúdo. */
export function CaixaConfig({
  id,
  icone,
  titulo,
  texto,
  children,
}: {
  id: string;
  icone?: ReactNode;
  titulo: ReactNode;
  texto?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className="flex scroll-mt-28 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
    >
      <div>
        <h3 id={`${id}-titulo`} className="flex flex-wrap items-center gap-2 text-h3">
          {icone}
          {titulo}
        </h3>
        {texto && <p className="mt-1 text-body-sm text-ink-muted">{texto}</p>}
      </div>
      {children}
    </section>
  );
}

/** Uma escolha de ligar e desligar, com o que ela faz embaixo. */
export function Chave({
  marcada,
  mudar,
  titulo,
  texto,
  desligada = false,
}: {
  marcada: boolean;
  mudar: (v: boolean) => void;
  titulo: ReactNode;
  texto?: ReactNode;
  desligada?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-md border border-line bg-surface-100 p-3 sm:p-4 ${
        desligada ? "opacity-70" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={marcada}
        disabled={desligada}
        onChange={(e) => mudar(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
      />
      <span className="min-w-0">
        <span className="block text-label">{titulo}</span>
        {texto && <span className="mt-0.5 block text-body-sm text-ink-muted">{texto}</span>}
      </span>
    </label>
  );
}

/** Escolher uma entre poucas opções, em pílulas. */
export function Pilulas<T extends string>({
  rotulo,
  valor,
  opcoes,
  mudar,
  desligada = false,
}: {
  rotulo: string;
  valor: T;
  opcoes: readonly { valor: T; nome: string }[];
  mudar: (v: T) => void;
  desligada?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-lg border border-line-strong bg-surface-100 p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          disabled={desligada}
          onClick={() => mudar(o.valor)}
          className={`min-h-9 rounded-md px-3 text-label transition-colors ${
            valor === o.valor ? "bg-ink text-surface-100" : "text-ink-muted hover:text-ink"
          }`}
        >
          {o.nome}
        </button>
      ))}
    </div>
  );
}

/** A mensagem depois de salvar. */
export function AvisoSalvar({ aviso }: { aviso: { ok: boolean; texto: string } | null }) {
  if (!aviso) return null;
  return (
    <p role={aviso.ok ? "status" : "alert"} className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
      {aviso.texto}
    </p>
  );
}
