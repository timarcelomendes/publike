import type { Metadata } from "next";
import { NOME_RECURSO, type RecursoPago } from "@/lib/recursos-pagos";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormConfigIA } from "@/components/admin/ia";
import { usoPorFuncionalidade } from "@/lib/admin/custo-ia";
import { abaPedida, SubAbasAdmin } from "@/components/admin/sub-abas";
import { Paginacao, Secao, Situacao } from "@/components/admin/ui";
import { Segmentos } from "@/components/painel/segmentos";
import { CircleDollarSign, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { Selo } from "@/components/ui/basicos";
import {
  configDoSite,
  contasDoCopiloto,
  decisoesDaIA,
  experimentosDosRecursos,
  numerosDoPainel,
  usoDaIA,
} from "@/lib/admin/dados";
import { CATEGORIAS_IA } from "@/lib/admin/textos";
import { primeiro, tempoRelativo } from "@/lib/formato";
import { MODELOS_IA, modeloDaIA, temChave } from "@/lib/ia/openai";
import { MODELOS_TRANSCRICAO } from "@/lib/ia/transcrever";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "IA" };

// Preço por milhão de tokens (entrada / saída), em dólar, em outubro de 2026.
// GPT-6 Luna e Claude Haiku 5.5: US$ 0,10 / 0,50. GPT-6.1 Sol e Claude Sonnet 5.5: US$ 2 / 10 (o Sol
// raciocina antes e gasta mais saída). A busca na internet do Claude custa US$ 10 a cada mil buscas.
const CUSTOS = [
  { tarefa: "Revisar um anúncio", luna: "US$ 0,15 a cada mil anúncios", sol: "cerca de US$ 6 a cada mil anúncios" },
  { tarefa: "Melhorar um texto", luna: "US$ 0,35 a cada mil pedidos", sol: "cerca de US$ 10 a cada mil pedidos" },
  { tarefa: "Resumo do painel", luna: "menos de US$ 0,001 cada", sol: "cerca de US$ 0,01 cada" },
];

// As partes da tela em sub-abas (22/11/2026, Marcelo: "paginar, talvez colocar sub-abas na página de IA")
const ABAS = [
  { id: "configuracoes", nome: "Configurações", icone: SlidersHorizontal },
  { id: "revisoes", nome: "Revisões", icone: ShieldCheck },
  { id: "triagem", nome: "Triagem e testes", icone: Sparkles },
  { id: "custos", nome: "Quanto custa", icone: CircleDollarSign },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/** As revisões: as últimas 200 (o máximo do banco), 20 por página, com o filtro pela decisão. */
const POR_PAGINA = 20;
const DECISOES = [
  { id: "", nome: "Todas" },
  { id: "retido", nome: "Retidas" },
  { id: "aprovado", nome: "Aprovadas" },
  { id: "erro", nome: "Falharam" },
] as const;
type Decisao = (typeof DECISOES)[number]["id"];

export default function IA({ searchParams }: PageProps<"/admin/ia">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const aba = abaPedida(ABAS, primeiro(sp.aba));
        const decisao = primeiro(sp.decisao) ?? "";
        return (
          <Conteudo
            aba={aba}
            decisao={DECISOES.some((d) => d.id === decisao) ? (decisao as Decisao) : ""}
            pagina={Math.max(1, Math.floor(Number(primeiro(sp.pagina)) || 1))}
          />
        );
      })}
    </Suspense>
  );
}

async function Conteudo({ aba, decisao, pagina }: { aba: Aba; decisao: Decisao; pagina: number }) {
  const c = await exigirAdminLocal();
  const nada = Promise.resolve(null);
  const [config, decisoes, numeros, agora, copiloto, experimentos, uso] = await Promise.all([
    configDoSite(c),
    // as retidas dos últimos 7 dias contam na aba em qualquer parte da tela
    decisoesDaIA(c, 200),
    aba === "configuracoes" ? numerosDoPainel(c) : nada,
    agoraDaRequisicao(),
    aba === "triagem" ? contasDoCopiloto(c) : nada,
    aba === "triagem" ? experimentosDosRecursos(c) : nada,
    aba === "configuracoes" ? usoDaIA(c, 30).catch(() => null) : nada,
  ]);
  const filas = situacaoFilas();
  const chaves = { openai: temChave("openai"), claude: temChave("claude") };
  const escolhido = modeloDaIA(config.ia_modelo);
  const retidas7 = decisoes.filter(
    (d) => d.decisao === "retido" && agora - new Date(d.criado_em).getTime() < 7 * 24 * 3600 * 1000,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <SubAbasAdmin
        rotulo="IA"
        base="/admin/ia"
        abas={ABAS.map((a) => (a.id === "revisoes" ? { ...a, alerta: { n: retidas7, leitor: "retidas em 7 dias" } } : a))}
        ativa={aba}
      />
      {aba === "configuracoes" && (
        <>
          <Secao
            titulo="Chaves da IA"
            descricao={
              <>
                A IA pode ser a da OpenAI ou o Claude, da Anthropic. As chaves ficam só nas variáveis de ambiente do
                servidor, nunca aqui: <code>OPENAI_API_KEY</code> (crie em platform.openai.com, em API keys) e{" "}
                <code>ANTHROPIC_API_KEY</code> (crie em platform.claude.com, em API keys). Ponha no <code>.env.local</code>{" "}
                e na Vercel. Nenhuma das duas guarda o texto enviado nos modelos usados aqui.
              </>
            }
          >
            <div className="flex flex-col gap-2">
              <Situacao ok={chaves.openai}>
                {chaves.openai ? "Chave da OpenAI configurada neste servidor." : "Falta OPENAI_API_KEY neste servidor."}
              </Situacao>
              <Situacao ok={chaves.claude}>
                {chaves.claude ? "Chave do Claude configurada neste servidor." : "Falta ANTHROPIC_API_KEY neste servidor."}
              </Situacao>
              <Situacao ok={chaves[escolhido.provedor]}>
                {chaves[escolhido.provedor]
                  ? `O site usa o ${escolhido.nome}.`
                  : `O ${escolhido.nome} está escolhido, mas falta a chave dele${
                      config.ia_reserva !== false && chaves[escolhido.provedor === "claude" ? "openai" : "claude"]
                        ? ": a reserva cobre com a outra IA."
                        : "."
                    }`}
              </Situacao>
              <Situacao ok={Boolean(filas.acesso)}>
                {filas.acesso
                  ? `A fila da IA roda com a ${filas.acesso}.`
                  : "Falta a chave do servidor para o site publicado rodar a fila da IA."}{" "}
                {filas.acesso !== "chave do servidor" && (
                  <Link href="/admin/chaves" className="underline">
                    Ver chaves
                  </Link>
                )}
              </Situacao>
              {numeros && numeros.ia.na_fila > 0 && (
                <p className="text-body-sm text-ink-muted">{numeros.ia.na_fila} anúncio(s) esperando a IA revisar.</p>
              )}
            </div>
          </Secao>

          <Secao titulo="Configurações">
            <FormConfigIA
              config={config}
              modelos={MODELOS_IA}
              transcricao={MODELOS_TRANSCRICAO}
              chaves={chaves}
              uso={usoPorFuncionalidade(uso)}
            />
          </Secao>
        </>
      )}

      {aba === "triagem" && !copiloto && !experimentos && (
        <p className="text-body-sm text-ink-muted">Nenhuma conta com a Triagem com IA nem nos 15 dias grátis.</p>
      )}

      {aba === "triagem" && copiloto && (
        <Secao
          titulo="Triagem com IA"
          descricao="As contas com a Triagem com IA (sem prazo ou nos 15 dias grátis). Para liberar ou tirar, abra a conta em Usuários."
        >
          {copiloto.length ? (
            <ul className="flex flex-col divide-y divide-line text-body-sm">
              {copiloto.map((x) => (
                <li key={x.conta_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/usuarios/${x.conta_id}`} className="text-label underline">
                    {x.nome}
                  </Link>
                  <span className="text-ink-muted">
                    liberado {tempoRelativo(x.liberado_em, agora)} · {x.vagas} {x.vagas === 1 ? "vaga" : "vagas"} ·{" "}
                    {x.leituras_30d} leituras e {x.convites_30d} convites em 30 dias
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-ink-muted">Nenhuma conta liberada ainda.</p>
          )}
        </Secao>
      )}

      {aba === "triagem" && experimentos && (
        <Secao
          titulo="15 dias grátis da Triagem com IA e do Teste Prático"
          descricao="Quem pediu para experimentar. Primeiro, quem tocou em “Quero continuar”: chame essas contas."
        >
          {experimentos.length ? (
            <ul className="flex flex-col divide-y divide-line text-body-sm">
              {experimentos.map((x) => (
                <li key={`${x.conta_id}-${x.recurso}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/usuarios/${x.conta_id}`} className="text-label underline">
                    {x.nome}
                  </Link>
                  <span className="text-ink-muted">
                    {NOME_RECURSO[x.recurso as RecursoPago] ?? x.recurso} · começou {tempoRelativo(x.inicio, agora)} ·{" "}
                    {x.ativo ? "experimentando" : "acabou"}
                    {x.quer_continuar_em ? ` · quer continuar (${tempoRelativo(x.quer_continuar_em, agora)})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-ink-muted">Ninguém pediu os 15 dias grátis ainda.</p>
          )}
        </Secao>
      )}

      {aba === "custos" && (
        <Secao
          titulo="Quanto custa"
          descricao="Valores aproximados. O Claude Haiku 5.5 custa o mesmo que o Luna, e o Sonnet 5.5, o mesmo que o Sol: cada IA cobra na conta dela (no Claude, saem dos créditos)."
        >
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[32rem] text-left text-body-sm">
              <thead className="text-ink-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-5 py-2 font-semibold sm:px-2">Tarefa</th>
                  <th scope="col" className="px-2 py-2 font-semibold">GPT-6 Luna</th>
                  <th scope="col" className="px-2 py-2 font-semibold">GPT-6.1 Sol</th>
                </tr>
              </thead>
              <tbody>
                {CUSTOS.map((c) => (
                  <tr key={c.tarefa} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 sm:px-2">{c.tarefa}</td>
                    <td className="px-2 py-2.5">{c.luna}</td>
                    <td className="px-2 py-2.5">{c.sol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {aba === "revisoes" && <Revisoes decisoes={decisoes} decisao={decisao} pagina={pagina} agora={agora} />}
    </div>
  );
}

function Revisoes({
  decisoes,
  decisao,
  pagina,
  agora,
}: {
  decisoes: Awaited<ReturnType<typeof decisoesDaIA>>;
  decisao: Decisao;
  pagina: number;
  agora: number;
}) {
  const filtradas = decisao ? decisoes.filter((d) => d.decisao === decisao) : decisoes;
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const aqui = Math.min(pagina, paginas);
  const daPagina = filtradas.slice((aqui - 1) * POR_PAGINA, aqui * POR_PAGINA);
  const link = (d: Decisao, p = 1) => {
    const q = new URLSearchParams({ aba: "revisoes" });
    if (d) q.set("decisao", d);
    if (p > 1) q.set("pagina", String(p));
    return `/admin/ia?${q}`;
  };
  return (
    <Secao
      titulo="Revisões"
      descricao={`O que a moderação automática decidiu, das mais novas para as mais antigas (as últimas ${decisoes.length}). Anúncio retido fica em Denúncias até alguém decidir.`}
    >
      <div className="flex flex-col gap-4">
        <Segmentos
          rotulo="Decisão"
          opcoes={DECISOES.map((d) => ({
            nome: d.nome,
            href: link(d.id),
            ativo: d.id === decisao,
            numero: d.id ? decisoes.filter((x) => x.decisao === d.id).length : decisoes.length,
          }))}
        />
        {daPagina.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            {decisoes.length === 0 ? "A IA ainda não revisou nenhum anúncio." : "Nenhuma revisão com essa decisão."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {daPagina.map((d) => (
              <li key={d.id} className="flex flex-col gap-1 py-3 text-body-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Selo variante={d.decisao === "retido" ? "aviso" : d.decisao === "erro" ? "contorno" : "match"}>
                    {d.decisao === "retido" ? "Reteve" : d.decisao === "erro" ? "Falhou" : "Aprovou"}
                  </Selo>
                  <Link href={`/admin/anuncios/${d.anuncio_id}`} className="text-label underline-offset-2 hover:underline">
                    {d.titulo}
                  </Link>
                </span>
                {d.categorias.length > 0 && (
                  <span className="text-ink-muted">{d.categorias.map((cat) => CATEGORIAS_IA[cat] ?? cat).join(", ")}</span>
                )}
                {d.explicacao && <span>{d.explicacao}</span>}
                <span className="text-ink-muted">
                  {tempoRelativo(d.criado_em, agora)}
                  {d.modelo && ` · ${d.modelo}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Paginacao pagina={aqui} total={filtradas.length} porPagina={POR_PAGINA} link={(p) => link(decisao, p)} />
      </div>
    </Secao>
  );
}
