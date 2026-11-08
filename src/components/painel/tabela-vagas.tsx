import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/basicos";

// "Suas vagas" (na agência, "Seus clientes"), no Hoje de quem contrata (claude/plano-painel-hoje-novo-design.md):
// uma linha por vaga, com a barra do andamento e o número de cada etapa. A barra é fina e sem texto (os números
// estão ao lado), num verde que escurece do Novos ao Contratados (conferido para daltonismo e contraste). No
// celular, cada vaga vira um cartão com a barra e os quatro números.

export type LinhaDaVaga = {
  id: string;
  titulo: string;
  href: string;
  /** "Até 22/11 · 412 visitas", "Parada há 9 dias", "3 prontos para o cliente" */
  meta: string;
  novos: number;
  /** entre os novos, quem espera a sua resposta */
  esperam: number;
  analise: number;
  entrevista: number;
  contratados: number;
};

export type GrupoDeVagas = {
  /** agência: o cliente (sem cliente: "Vagas sem cliente") */
  cliente?: { nome: string; bairro: string | null; href: string | null } | null;
  vagas: LinhaDaVaga[];
};

const ETAPAS = [
  { chave: "novos", nome: "Novos", curto: "Novos", cor: "bg-[#8fc2a6]" },
  { chave: "analise", nome: "Em análise", curto: "Análise", cor: "bg-[#5fa683]" },
  { chave: "entrevista", nome: "Entrevista", curto: "Entrevista", cor: "bg-[#1f6f4a]" },
  { chave: "contratados", nome: "Contratados", curto: "Contratado", cor: "bg-[#0f3d27]" },
] as const;

function descricao(v: LinhaDaVaga) {
  const partes = ETAPAS.map((e) => [v[e.chave], e.nome.toLowerCase()] as const).filter(([n]) => n > 0);
  return partes.length ? partes.map(([n, nome]) => `${n} ${nome}`).join(", ") : "Nenhum candidato";
}

/** A barra fina do andamento: cada etapa do tamanho do número, 2 px de folga entre elas. */
function Barra({ v, className = "" }: { v: LinhaDaVaga; className?: string }) {
  const partes = ETAPAS.map((e) => ({ ...e, n: v[e.chave] })).filter((p) => p.n > 0);
  return (
    <span role="img" aria-label={descricao(v)} className={`flex h-2 gap-0.5 ${className}`}>
      {partes.length === 0 ? (
        <span className="block h-full flex-1 rounded-pill bg-surface-300" />
      ) : (
        partes.map((p, i) => (
          <span
            key={p.chave}
            className={`block h-full ${p.cor} ${i === 0 ? "rounded-l-pill" : ""} ${
              i === partes.length - 1 ? "rounded-r-pill" : ""
            }`}
            style={{ flex: `${p.n} 1 0` }}
          />
        ))
      )}
    </span>
  );
}

function Cliente({ c }: { c: NonNullable<GrupoDeVagas["cliente"]> }) {
  return (
    <span className="flex items-center gap-3">
      <Avatar nome={c.nome} forma="quadrada" colorida tamanho={32} />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{c.nome}</span>
        {c.bairro && <span className="text-ink-muted"> · {c.bairro}</span>}
      </span>
      {c.href && (
        <Link href={c.href} className="shrink-0 text-body-sm font-semibold underline underline-offset-2 hover:text-terra-text">
          Abrir ficha
        </Link>
      )}
    </span>
  );
}

export function TabelaDasVagas({
  titulo,
  grupos,
  link,
}: {
  titulo: string;
  grupos: GrupoDeVagas[];
  link: { href: string; texto: string };
}) {
  const comCliente = grupos.some((g) => g.cliente);
  return (
    <section aria-labelledby="tabela-vagas" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tabela-vagas" className="text-h2">
          {titulo}
        </h2>
        <Link href={link.href} className="text-label underline underline-offset-2 hover:text-terra-text">
          {link.texto}
        </Link>
      </div>

      {/* no computador: a tabela */}
      <div className="relative hidden overflow-x-auto rounded-lg border border-line bg-surface-200 shadow-card sm:block">
        <table className="w-full min-w-[680px] border-collapse text-body">
          <thead>
            <tr className="text-left text-[13px] leading-[18px] text-ink-muted">
              <th scope="col" className="px-5 pt-4 pb-3 font-semibold">
                Vaga
              </th>
              <th scope="col" className="w-[140px] px-3 pt-4 pb-3 font-semibold">
                Andamento
              </th>
              {ETAPAS.map((e) => (
                <th key={e.chave} scope="col" className="px-3 pt-4 pb-3 text-right font-semibold whitespace-nowrap">
                  <span aria-hidden className={`mr-1.5 inline-block size-2 rounded-pill ${e.cor}`} />
                  {e.curto === "Contratado" ? "Contratados" : e.curto}
                </th>
              ))}
              <th scope="col" className="w-[60px] px-5 pt-4 pb-3">
                <span className="sr-only">Abrir</span>
              </th>
            </tr>
          </thead>
          {grupos.map((g, gi) => (
            <tbody key={g.cliente?.nome ?? `grupo-${gi}`}>
              {comCliente && (
                <tr className="border-t border-line bg-surface-100">
                  <th scope="colgroup" colSpan={7} className="px-5 py-3 text-left font-normal">
                    {g.cliente ? (
                      <Cliente c={g.cliente} />
                    ) : (
                      <span className="font-semibold">Vagas sem cliente</span>
                    )}
                  </th>
                </tr>
              )}
              {g.vagas.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="px-5 py-4">
                    <Link href={v.href} className="font-bold hover:underline">
                      {v.titulo}
                    </Link>
                    <span className="block text-body-sm text-ink-muted">{v.meta}</span>
                  </td>
                  <td className="px-3 py-4">
                    <Barra v={v} className="w-[116px]" />
                  </td>
                  {ETAPAS.map((e) => (
                    <td
                      key={e.chave}
                      className={`px-3 py-4 text-right font-bold tabular-nums ${v[e.chave] === 0 ? "text-ink-muted" : ""}`}
                    >
                      {v[e.chave]}
                      {e.chave === "novos" && v.esperam > 0 && (
                        <span className="block text-[12px] leading-4 whitespace-nowrap text-terra-text">
                          {v.esperam === 1 ? "1 espera" : `${v.esperam} esperam`}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={v.href}
                      aria-label={`Abrir ${v.titulo}`}
                      className="inline-grid size-10 place-items-center rounded-pill hover:bg-surface-300"
                    >
                      <ChevronRight aria-hidden className="size-5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* no celular: um cartão por vaga */}
      <ul className="overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card sm:hidden">
        {grupos.map((g, gi) => (
          <li key={g.cliente?.nome ?? `grupo-${gi}`} className={gi > 0 ? "border-t border-line" : ""}>
            {comCliente && (
              <div className="bg-surface-100 px-4 py-3 text-body-sm">
                {g.cliente ? <Cliente c={g.cliente} /> : <span className="font-semibold">Vagas sem cliente</span>}
              </div>
            )}
            <ul>
              {g.vagas.map((v, i) => (
                <li key={v.id} className={i > 0 || comCliente ? "border-t border-line" : ""}>
                  <Link href={v.href} className="flex flex-col gap-2.5 p-4">
                    <span className="flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body font-bold">{v.titulo}</span>
                        <span className="text-body-sm text-ink-muted">{v.meta}</span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0" />
                    </span>
                    <Barra v={v} />
                    {v.novos + v.analise + v.entrevista + v.contratados > 0 && (
                      <span aria-hidden className="grid grid-cols-4 gap-1">
                        {ETAPAS.map((e) => (
                          <span key={e.chave} className="flex flex-col">
                            <span className={`text-body leading-5 font-bold ${v[e.chave] === 0 ? "text-ink-muted" : ""}`}>
                              {v[e.chave]}
                            </span>
                            <span className="flex items-center gap-1 text-[12px] leading-4 text-ink-muted">
                              <span className={`size-2 shrink-0 rounded-pill ${e.cor}`} />
                              {e.curto}
                            </span>
                            {e.chave === "novos" && v.esperam > 0 && (
                              <span className="text-[12px] leading-4 font-bold text-terra-text">
                                {v.esperam === 1 ? "1 espera" : `${v.esperam} esperam`}
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
