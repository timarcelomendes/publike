import type { PortaDeEntrada } from "@/lib/admin/dados";
import { Secao } from "./ui";

// O funil de quem chega sem conta (claude/plano-home-visitante.md, "Como medir"), no painel do admin: nos últimos
// 7 dias, quantas vezes a home de quem não entrou abriu, os toques nela, as contas criadas e quantas delas já
// curtiram ou publicaram. Serve para comparar a semana antes e a depois de cada mudança na home.

const TOQUES = [
  { chave: "curtir", nome: "Tocaram em Curtir" },
  { chave: "publicar", nome: "Tocaram em Publicar" },
  { chave: "curriculo", nome: "Tocaram em Currículo" },
  { chave: "entrar", nome: "Tocaram em Entrar" },
];

// o "entrar num toque" e o convite que acompanha as vagas vistas (claude/plano-visitante-que-entra.md): em todo o
// site, não só na home
const CONVITES = [
  { mostrou: "toque_mostrou", fez: "toque_entrou", nome: "Entrar com o Google num toque", verbo: "entraram" },
  { mostrou: "convite_mostrou", fez: "convite_tocou", nome: "Convite das vagas vistas", verbo: "tocaram" },
];

const pct = (n: number, de: number) => (de > 0 ? `${Math.round((100 * n) / de)}%` : "–");

export function FunilDoVisitante({ funil }: { funil: Map<string, number> }) {
  const n = (k: string) => funil.get(k) ?? 0;
  const home = n("home");
  const contas = n("contas");
  return (
    <Secao
      titulo="Quem chega sem conta (7 dias)"
      descricao="A home de quem não entrou: quantas vezes abriu e os toques nela (só a contagem, sem saber quem). E as contas criadas nesses dias, com quantas já curtiram ou publicaram."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <dl className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <dt className="text-label">Abriram a home</dt>
            <dd className="text-h3 tabular-nums">{home}</dd>
          </div>
          {TOQUES.map((t) => (
            <div key={t.chave} className="flex items-baseline justify-between gap-3">
              <dt className="text-body-sm">{t.nome}</dt>
              <dd className="text-body-sm tabular-nums">
                <strong className="font-semibold">{n(t.chave)}</strong>{" "}
                <span className="text-ink-muted">· {pct(n(t.chave), home)} das aberturas</span>
              </dd>
            </div>
          ))}
        </dl>
        <dl className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <dt className="text-label">Contas criadas</dt>
            <dd className="text-h3 tabular-nums">{contas}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body-sm">Já curtiram ou pediram um serviço</dt>
            <dd className="text-body-sm tabular-nums">
              <strong className="font-semibold">{n("curtiu")}</strong>{" "}
              <span className="text-ink-muted">· {pct(n("curtiu"), contas)}</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body-sm">Já publicaram</dt>
            <dd className="text-body-sm tabular-nums">
              <strong className="font-semibold">{n("publicou")}</strong>{" "}
              <span className="text-ink-muted">· {pct(n("publicou"), contas)}</span>
            </dd>
          </div>
        </dl>
      </div>
      {CONVITES.some((x) => n(x.mostrou) > 0) && (
        <dl className="mt-6 flex flex-col gap-2 border-t border-line pt-4">
          {CONVITES.map((x) => (
            <div key={x.mostrou} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="text-body-sm">{x.nome}</dt>
              <dd className="text-body-sm tabular-nums">
                apareceu <strong className="font-semibold">{n(x.mostrou)}</strong> vezes ·{" "}
                <strong className="font-semibold">{n(x.fez)}</strong> {x.verbo}{" "}
                <span className="text-ink-muted">({pct(n(x.fez), n(x.mostrou))})</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Secao>
  );
}

const NOMES_DAS_PORTAS: Record<string, string> = {
  inicio: "Página inicial",
  vaga: "Página de uma vaga",
  busca: "Vagas por cidade, área, função ou bairro",
  ferramenta: "Ferramentas (currículo, rescisão, seguro)",
  conteudo: "Artigos e notícias",
  entrar: "Página de entrar",
  publicar: "Publicar",
  empresas: "Para empresas",
  outra: "Outras páginas",
};

/**
 * Por onde chegam (claude/plano-visitante-que-entra.md): a primeira página do dia de quem chegou sem conta, por
 * grupo, com quantos ficaram (navegaram mais de 2 minutos ou abriram outra página) e quantos entraram na conta.
 */
export function PortasDeEntrada({ portas }: { portas: PortaDeEntrada[] }) {
  const total = portas.reduce((s, p) => s + p.visitantes, 0);
  return (
    <Secao
      titulo="Por onde chegam (7 dias)"
      descricao="A primeira página de quem chegou sem conta. Ficaram: navegaram mais de 2 minutos ou abriram outra página. Entraram: abriram a conta (nova ou antiga) no mesmo dia. Só a contagem, sem saber quem."
    >
      {total === 0 ? (
        <p className="text-body-sm text-ink-muted">
          Ainda sem números: a contagem por porta começa quando a migração 20270226120000 roda e o site novo entra no ar.
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-body-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th scope="col" className="px-1 py-2 font-normal">Chegou por</th>
                <th scope="col" className="px-1 py-2 text-right font-normal">Visitantes</th>
                <th scope="col" className="px-1 py-2 text-right font-normal">Ficaram</th>
                <th scope="col" className="px-1 py-2 text-right font-normal">Entraram</th>
              </tr>
            </thead>
            <tbody>
              {portas.map((p) => (
                <tr key={p.porta} className="border-b border-line last:border-0">
                  <th scope="row" className="px-1 py-2 text-left font-normal">
                    {NOMES_DAS_PORTAS[p.porta] ?? p.porta}
                  </th>
                  <td className="px-1 py-2 text-right">
                    <strong className="font-semibold">{p.visitantes}</strong>{" "}
                    <span className="text-ink-muted">· {pct(p.visitantes, total)}</span>
                  </td>
                  <td className="px-1 py-2 text-right">
                    {p.ficaram} <span className="text-ink-muted">· {pct(p.ficaram, p.visitantes)}</span>
                  </td>
                  <td className="px-1 py-2 text-right">
                    {p.entraram} <span className="text-ink-muted">· {pct(p.entraram, p.visitantes)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}
