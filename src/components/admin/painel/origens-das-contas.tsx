import { Secao } from "@/components/admin/ui";
import type { EntradaContas, OrigemContas } from "@/lib/admin/dados";
import { formatarNumero } from "@/lib/formato";
import {
  canalDaOrigem,
  CANAIS,
  ENTRADAS,
  NOME_DA_ENTRADA,
  NOME_DO_CANAL,
  nomeDaOrigem,
  tipoDaEntrada,
  type CanalDaOrigem,
  type TipoDeEntrada,
} from "@/lib/origem";

// O Painel › Quem chega, nas contas novas (claude/plano-organico.md): de onde vieram, por canal (a busca separada do
// direto, as IAs, as redes...), e por onde entraram (o tipo de página e as páginas que mais trouxeram contas).

const pct = (n: number, de: number) => (de > 0 ? `${Math.round((100 * n) / de)}%` : "–");

type Soma = { contas: number; vaga: number; noAr: number };

/** De onde vêm as contas: cada canal com o total e, embaixo, as origens dele (quando há mais de uma). */
export function OrigensDasContas({ origens, dias }: { origens: OrigemContas[]; dias: number }) {
  const total = origens.reduce((s, o) => s + Number(o.contas), 0);
  const porCanal = new Map<CanalDaOrigem, { soma: Soma; linhas: OrigemContas[] }>();
  for (const o of origens) {
    // sem a coluna (o banco antes da migração), "direto" eram todas as sem campanha
    const canal = o.campanha === undefined && o.origem === "direto" ? "sem_registro" : canalDaOrigem(o.origem);
    const g = porCanal.get(canal) ?? { soma: { contas: 0, vaga: 0, noAr: 0 }, linhas: [] };
    g.soma.contas += Number(o.contas);
    g.soma.vaga += Number(o.publicaram_vaga);
    g.soma.noAr += Number(o.anuncios_no_ar);
    g.linhas.push(o);
    porCanal.set(canal, g);
  }
  const canais = CANAIS.filter((c) => porCanal.has(c)).sort((a, b) => {
    // os dois que não dizem o canal ficam no fim; os outros, do maior para o menor
    const fim = (c: CanalDaOrigem) => (c === "direto" ? 1 : c === "sem_registro" ? 2 : 0);
    return fim(a) - fim(b) || porCanal.get(b)!.soma.contas - porCanal.get(a)!.soma.contas;
  });

  return (
    <Secao
      titulo={`De onde vêm as contas (${dias} dias)`}
      descricao={
        <>
          As contas criadas nos últimos {dias} dias. A campanha do link (o utm) vale primeiro; sem ela, de onde a pessoa
          chegou na primeira página (o site que mandou: a busca, uma IA, uma rede, outro site). <strong>Direto</strong> é
          quem chegou sem dizer de onde: digitou o endereço ou abriu de um app que não conta (o WhatsApp, quase sempre).
          As campanhas, uma a uma, ficam em Admin › Campanhas.
        </>
      }
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[32rem] text-body-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th scope="col" className="py-2 pr-2 font-normal">
                Origem
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Contas
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Publicaram vaga
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Anúncios no ar
              </th>
            </tr>
          </thead>
          {canais.map((canal) => {
            const { soma, linhas } = porCanal.get(canal)!;
            const abrir = linhas.length > 1 || (linhas[0] && !["direto", "sem-registro"].includes(linhas[0].origem));
            return (
              <tbody key={canal} className="border-b border-line last:border-0">
                <tr>
                  <th scope="row" className="py-2 pr-2 text-left font-semibold">
                    {NOME_DO_CANAL[canal]}
                  </th>
                  <td className="py-2 text-right">
                    <strong className="font-semibold">{formatarNumero(soma.contas)}</strong>{" "}
                    <span className="text-ink-muted">· {pct(soma.contas, total)}</span>
                  </td>
                  <td className="py-2 text-right">{formatarNumero(soma.vaga)}</td>
                  <td className="py-2 text-right">{formatarNumero(soma.noAr)}</td>
                </tr>
                {abrir &&
                  linhas.map((o) => (
                    <tr key={`${o.origem}|${o.campanha ? "c" : ""}`} className="text-ink-muted">
                      <th scope="row" className="py-1 pr-2 pl-4 text-left font-normal">
                        {nomeDaOrigem(o.origem)}
                      </th>
                      <td className="py-1 text-right">{formatarNumero(Number(o.contas))}</td>
                      <td className="py-1 text-right">{formatarNumero(Number(o.publicaram_vaga))}</td>
                      <td className="py-1 text-right">{formatarNumero(Number(o.anuncios_no_ar))}</td>
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </Secao>
  );
}

// As colunas da tabela por tipo de página: os canais que importam para o orgânico e o resto junto.
const COLUNAS: { nome: string; canais: CanalDaOrigem[] }[] = [
  { nome: "Busca", canais: ["busca"] },
  { nome: "IAs", canais: ["ia"] },
  { nome: "Pagos", canais: ["pago"] },
  { nome: "Direto", canais: ["direto"] },
];
const OUTROS = new Set(CANAIS.filter((c) => !COLUNAS.some((k) => k.canais.includes(c))));

type LinhaDaEntrada = EntradaContas & { titulo?: string };

/** Por onde entraram as contas novas: por tipo de página, com os canais, e as páginas que mais trouxeram contas. */
export function EntradasDasContas({ entradas, dias }: { entradas: LinhaDaEntrada[] | null; dias: number }) {
  const linhas = entradas ?? [];
  const total = linhas.reduce((s, l) => s + Number(l.contas), 0);

  const porTipo = new Map<TipoDeEntrada, { contas: number; vaga: number; canais: Map<CanalDaOrigem, number> }>();
  const porPagina = new Map<string, { titulo?: string; contas: number; vaga: number; canais: Map<CanalDaOrigem, number> }>();
  for (const l of linhas) {
    const n = Number(l.contas);
    const canal = canalDaOrigem(l.origem);
    const tipo = porTipo.get(tipoDaEntrada(l.entrada)) ?? { contas: 0, vaga: 0, canais: new Map() };
    tipo.contas += n;
    tipo.vaga += Number(l.publicaram_vaga);
    tipo.canais.set(canal, (tipo.canais.get(canal) ?? 0) + n);
    porTipo.set(tipoDaEntrada(l.entrada), tipo);
    const pagina = porPagina.get(l.entrada) ?? { titulo: l.titulo, contas: 0, vaga: 0, canais: new Map() };
    pagina.contas += n;
    pagina.vaga += Number(l.publicaram_vaga);
    pagina.canais.set(canal, (pagina.canais.get(canal) ?? 0) + n);
    porPagina.set(l.entrada, pagina);
  }
  const tipos = ENTRADAS.filter((t) => porTipo.has(t)).sort((a, b) => porTipo.get(b)!.contas - porTipo.get(a)!.contas);
  const paginas = [...porPagina].sort((a, b) => b[1].contas - a[1].contas || a[0].localeCompare(b[0])).slice(0, 15);
  const somaDe = (canais: Map<CanalDaOrigem, number>, quais: Iterable<CanalDaOrigem>) =>
    [...quais].reduce((s, c) => s + (canais.get(c) ?? 0), 0);

  return (
    <Secao
      titulo={`Por onde entraram as contas (${dias} dias)`}
      descricao="A primeira página aberta por quem criou a conta nos últimos dias, com o canal de onde veio. Nos links com código (convites, indicação, perfis), só o começo do endereço. Só a contagem, sem saber quem."
    >
      {total === 0 ? (
        <p className="text-body-sm text-ink-muted">
          {entradas === null
            ? "Ainda sem números: a contagem começa quando a migração 20270802120000 roda e o site novo entra no ar."
            : "Ainda sem números: a página de entrada começou a ser guardada em 18/11/2026, nas contas novas a partir daí."}
        </p>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[40rem] text-body-sm tabular-nums">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th scope="col" className="py-2 pr-2 font-normal">
                    Página de entrada
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Contas
                  </th>
                  {COLUNAS.map((k) => (
                    <th key={k.nome} scope="col" className="py-2 pl-3 text-right font-normal">
                      {k.nome}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-right font-normal">
                    Outros
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-normal">
                    Publicaram vaga
                  </th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => {
                  const d = porTipo.get(t)!;
                  return (
                    <tr key={t} className="border-b border-line last:border-0">
                      <th scope="row" className="py-2 pr-2 text-left font-normal">
                        {NOME_DA_ENTRADA[t]}
                      </th>
                      <td className="py-2 text-right">
                        <strong className="font-semibold">{formatarNumero(d.contas)}</strong>{" "}
                        <span className="text-ink-muted">· {pct(d.contas, total)}</span>
                      </td>
                      {COLUNAS.map((k) => (
                        <td key={k.nome} className="py-2 pl-3 text-right">
                          {formatarNumero(somaDe(d.canais, k.canais))}
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right">{formatarNumero(somaDe(d.canais, OUTROS))}</td>
                      <td className="py-2 pl-3 text-right">{formatarNumero(d.vaga)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-body font-semibold">As páginas que mais trouxeram contas</h3>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[32rem] text-body-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th scope="col" className="py-2 pr-2 font-normal">
                      Página
                    </th>
                    <th scope="col" className="py-2 text-right font-normal">
                      Contas
                    </th>
                    <th scope="col" className="py-2 pl-3 font-normal">
                      De onde vieram
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginas.map(([caminho, p]) => (
                    <tr key={caminho} className="border-b border-line last:border-0">
                      <th scope="row" className="max-w-[22rem] py-2 pr-2 text-left font-normal">
                        {caminho.includes("*") ? (
                          <span className="break-words">{caminho}</span>
                        ) : (
                          <a
                            href={caminho}
                            target="_blank"
                            rel="noreferrer"
                            className="break-words underline underline-offset-2"
                          >
                            {p.titulo ? `Vaga: ${p.titulo}` : caminho}
                          </a>
                        )}
                      </th>
                      <td className="py-2 text-right">{formatarNumero(p.contas)}</td>
                      <td className="py-2 pl-3 text-ink-muted">
                        {[...p.canais]
                          .sort((a, b) => b[1] - a[1])
                          .map(([c, n]) => `${NOME_CURTO[c]} ${n}`)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Secao>
  );
}

const NOME_CURTO: Record<CanalDaOrigem, string> = {
  busca: "busca",
  ia: "IA",
  vagas_google: "Google Vagas",
  portais: "portal",
  redes: "rede social",
  whatsapp: "WhatsApp",
  email: "e-mail",
  compartilhamentos: "compartilhado",
  sites: "outro site",
  pago: "pago",
  outros: "outra campanha",
  direto: "direto",
  sem_registro: "sem registro",
};
