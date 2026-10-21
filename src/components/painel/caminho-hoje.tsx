import { Check, ChevronRight, FileSpreadsheet, Plus, Send } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/basicos";
import { formatarTelefone, plural } from "@/lib/formato";
import type { Cliente } from "@/lib/clientes";
import type { VagaNoCaminho } from "@/lib/servidor/caminho";

// As peças novas da Hoje de quem contrata: a faixa "O caminho das suas vagas" (um bloco por
// passo, com o número, o que está acontecendo e a ação), "Comece por aqui" para a conta nova
// e "Seus clientes" da agência.

export type Passo = {
  nome: string;
  numero: number;
  /** o que está acontecendo nesse passo, numa linha */
  texto: string;
  acao: string;
  href: string;
  /** feito: já tem algo nesse passo; agora: é o que pede a pessoa */
  estado: "feito" | "agora" | "normal";
};

/** A faixa com os passos do caminho da vaga. No celular, vira lista. */
export function FaixaDoCaminho({ passos }: { passos: Passo[] }) {
  return (
    <section aria-labelledby="caminho-titulo" className="flex flex-col gap-3">
      <h2 id="caminho-titulo" className="text-h3">
        O caminho das suas vagas
      </h2>
      <ol
        className={`grid grid-cols-1 overflow-hidden rounded-lg border border-line bg-surface-200 ${
          passos.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"
        }`}
      >
        {passos.map((p, i) => (
          <li
            key={p.nome}
            data-passo={p.estado}
            className={`relative border-line not-first:border-t lg:not-first:border-t-0 lg:not-first:border-l ${
              p.estado === "agora" ? "bg-terra-soft" : ""
            }`}
          >
            <Link
              href={p.href}
              className="group grid h-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-3 lg:flex lg:min-h-40 lg:flex-col lg:gap-1 lg:px-4 lg:pt-4 lg:pb-4"
            >
              <span className="col-start-1 flex items-center gap-2 text-label">
                <span
                  aria-hidden
                  className={`grid size-[22px] shrink-0 place-items-center rounded-pill border-[1.5px] text-[12px] font-bold ${
                    p.estado === "agora"
                      ? "border-terra bg-terra text-on-terra"
                      : p.estado === "feito"
                        ? "border-cerrado bg-cerrado text-on-cerrado"
                        : "border-line-strong text-ink-muted"
                  }`}
                >
                  {i + 1}
                </span>
                {p.nome}
              </span>
              <span className="col-start-2 row-span-2 row-start-1 self-center font-display text-h2 leading-none tabular-nums lg:mt-1.5 lg:self-start lg:text-[34px]">
                {p.numero}
              </span>
              <span
                className={`col-start-1 line-clamp-2 text-body-sm ${p.estado === "agora" ? "text-terra-text" : "text-ink-muted"}`}
              >
                {p.texto}
              </span>
              <span
                className={`col-span-2 mt-1 inline-flex items-center gap-0.5 text-label underline underline-offset-3 lg:mt-auto lg:pt-2 ${
                  p.estado === "agora" ? "text-terra-text" : ""
                }`}
              >
                {p.acao}
                <ChevronRight aria-hidden className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type PrimeiroPasso = { titulo: string; texto: string; feito: boolean; acao?: { nome: string; href: string } };

/** Conta nova: os primeiros passos, com a barra de progresso. O primeiro que falta fica em destaque. */
export function ComecePorAqui({ passos }: { passos: PrimeiroPasso[] }) {
  const feitos = passos.filter((p) => p.feito).length;
  const proximo = passos.findIndex((p) => !p.feito);
  return (
    <section
      aria-labelledby="comece-titulo"
      className="flex flex-col rounded-lg border border-line-strong bg-surface-200 px-4 pt-5 pb-2 sm:px-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="comece-titulo" className="text-h2">
          Comece por aqui
        </h2>
        <span className="text-label text-ink-muted">
          {feitos} de {passos.length}
        </span>
      </div>
      <span
        role="progressbar"
        aria-label="Primeiros passos"
        aria-valuemin={0}
        aria-valuemax={passos.length}
        aria-valuenow={feitos}
        className="mt-3 mb-4 block h-2 overflow-hidden rounded-pill bg-surface-300"
      >
        <span
          className="block h-full rounded-pill bg-cerrado"
          style={{ width: `${(100 * feitos) / passos.length}%` }}
        />
      </span>
      <ol className="flex flex-col">
        {passos.map((p, i) => {
          const agora = i === proximo;
          return (
            <li
              key={p.titulo}
              data-passo={p.feito ? "feito" : agora ? "agora" : "depois"}
              className={`grid grid-cols-[30px_minmax(0,1fr)] items-start gap-x-3.5 gap-y-2 border-t py-3.5 sm:grid-cols-[30px_minmax(0,1fr)_auto] ${
                agora ? "-mx-4 border-transparent bg-terra-soft px-4 sm:-mx-6 sm:px-6" : "border-line"
              }`}
            >
              <span
                aria-hidden
                className={`grid size-[30px] place-items-center rounded-pill border-[1.5px] text-label ${
                  p.feito
                    ? "border-ink bg-ink text-surface-100"
                    : agora
                      ? "border-terra bg-terra text-on-terra"
                      : "border-line-strong text-ink-muted"
                }`}
              >
                {p.feito ? <Check className="size-4" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-body font-semibold ${!p.feito && !agora ? "text-ink-muted" : ""}`}>
                  {p.titulo}
                  {p.feito && <span className="sr-only"> (feito)</span>}
                </span>
                <span className={`mt-0.5 block text-body-sm ${agora ? "text-terra-text" : "text-ink-muted"}`}>
                  {p.texto}
                </span>
              </span>
              {p.acao && !p.feito && (
                <Link
                  href={p.acao.href}
                  className={`col-start-2 inline-flex min-h-10 items-center self-center justify-self-start rounded-md px-4 text-label transition-opacity hover:opacity-90 sm:col-start-3 ${
                    agora ? "bg-terra text-on-terra" : "border border-line-strong"
                  }`}
                >
                  {p.acao.nome}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "Seus clientes": cada cliente com os 4 números, as vagas e as ações. */
export function SeusClientes({ clientes, vagas }: { clientes: Cliente[]; vagas: VagaNoCaminho[] }) {
  if (clientes.length === 0) return null;
  const mostrados = clientes
    .map((c) => ({ c, vagas: vagas.filter((v) => v.clienteId === c.id) }))
    // primeiro quem tem vaga no ar
    .sort((a, b) => noAr(b.vagas).length - noAr(a.vagas).length)
    .slice(0, 6);
  return (
    <section aria-labelledby="seus-clientes" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="seus-clientes" className="text-h3">
          Seus clientes
        </h2>
        <Link href="/painel/clientes" className="text-label text-ink-muted underline underline-offset-2 hover:text-ink">
          {clientes.length > mostrados.length ? `Ver os ${clientes.length}` : "Ver todos"}
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200 shadow-card">
        {mostrados.map(({ c, vagas: dele }) => {
          const ativas = noAr(dele);
          const responder = dele.reduce((t, v) => t + v.responder, 0);
          const comCliente = dele.reduce((t, v) => t + (v.link ? v.finalistas.filter((f) => !f.decisao).length : 0), 0);
          const contratados = dele.reduce((t, v) => t + v.contratados.length, 0);
          const prontas = ativas.filter((v) => v.prontos.length > 0);
          const contato = [c.bairro, c.responsavel, c.telefone && formatarTelefone(c.telefone)]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={c.id} data-cliente={c.nome} className="flex flex-col gap-3 p-4 sm:p-5">
              <Link href={`/painel/clientes/${c.id}`} className="group flex items-center gap-3">
                <Avatar nome={c.nome} forma="quadrada" colorida tamanho={40} />
                <span className="min-w-0">
                  <span className="block truncate text-label group-hover:underline">{c.nome}</span>
                  <span className="block truncate text-body-sm text-ink-muted">{contato || "sem contato salvo"}</span>
                </span>
              </Link>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini numero={ativas.length} nome={ativas.length === 1 ? "vaga no ar" : "vagas no ar"} />
                <Mini numero={responder} nome="para responder" destaque={responder > 0} />
                <Mini numero={comCliente} nome="com o cliente" />
                <Mini numero={contratados} nome={contratados === 1 ? "contratado" : "contratados"} />
              </dl>
              {ativas.length > 0 && (
                <ul className="flex flex-col gap-1 text-body-sm">
                  {ativas.slice(0, 3).map((v) => (
                    <li key={v.anuncio.id}>
                      <Link href={`/painel/anuncio/${v.anuncio.id}/quadro`} className="hover:underline">
                        <span className="font-semibold">{v.anuncio.titulo}</span>
                        <span className="text-ink-muted">
                          {" "}
                          ·{" "}
                          {v.candidatos.length
                            ? plural(v.candidatos.length, "candidato", "candidatos")
                            : "nenhum candidato ainda"}
                          {v.prontos.length > 0 &&
                            ` · ${plural(v.prontos.length, "finalista pronto", "finalistas prontos")}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {prontas.length > 0 && (
                  <AcaoCliente
                    href={
                      prontas.length === 1
                        ? `/painel/anuncio/${prontas[0].anuncio.id}/finalistas`
                        : "/painel/finalistas"
                    }
                    principal
                  >
                    <Send aria-hidden className="size-4" />
                    Mandar finalistas
                  </AcaoCliente>
                )}
                <AcaoCliente href={`/publicar?cliente=${c.id}`}>
                  <Plus aria-hidden className="size-4" />
                  Publicar vaga
                </AcaoCliente>
                {dele.length > 0 && (
                  <AcaoCliente href={`/painel/candidatos/planilha?cliente=${c.id}`} arquivo>
                    <FileSpreadsheet aria-hidden className="size-4" />
                    Planilha
                  </AcaoCliente>
                )}
                <Link
                  href={`/painel/clientes/${c.id}`}
                  className="inline-flex min-h-10 items-center px-1 text-label underline underline-offset-2"
                >
                  Abrir ficha
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function noAr(vagas: VagaNoCaminho[]) {
  return vagas.filter((v) => v.anuncio.status === "ativo");
}

function Mini({ numero, nome, destaque = false }: { numero: number; nome: string; destaque?: boolean }) {
  return (
    <div
      className={`flex flex-col-reverse rounded-md px-2.5 py-2 ${destaque ? "bg-terra-soft text-terra-text" : "bg-surface-100"}`}
    >
      <dt className={`text-caption ${destaque ? "" : "text-ink-muted"}`}>{nome}</dt>
      <dd className="font-display text-h3 leading-tight tabular-nums">{numero}</dd>
    </div>
  );
}

function AcaoCliente({
  href,
  principal = false,
  arquivo = false,
  children,
}: {
  href: string;
  principal?: boolean;
  /** a planilha é um arquivo: link comum, sem pré-carregar */
  arquivo?: boolean;
  children: React.ReactNode;
}) {
  const classe = `inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-label transition-colors ${
    principal ? "bg-ink text-surface-100 hover:opacity-90" : "border border-line-strong hover:bg-surface-300"
  }`;
  return arquivo ? (
    <a href={href} className={classe}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classe}>
      {children}
    </Link>
  );
}
