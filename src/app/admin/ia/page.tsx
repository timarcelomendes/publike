import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormConfigIA } from "@/components/admin/ia";
import { Secao, Situacao } from "@/components/admin/ui";
import { Selo } from "@/components/ui/basicos";
import { configDoSite, contasDoCopiloto, decisoesDaIA, numerosDoPainel } from "@/lib/admin/dados";
import { CATEGORIAS_IA } from "@/lib/admin/textos";
import { tempoRelativo } from "@/lib/formato";
import { MODELOS_IA, modeloDaIA, temChave } from "@/lib/ia/openai";
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

export default function IA() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [config, decisoes, numeros, agora, copiloto] = await Promise.all([
    configDoSite(c),
    decisoesDaIA(c, 40),
    numerosDoPainel(c),
    agoraDaRequisicao(),
    contasDoCopiloto(c),
  ]);
  const filas = situacaoFilas();
  const chaves = { openai: temChave("openai"), claude: temChave("claude") };
  const escolhido = modeloDaIA(config.ia_modelo);

  return (
    <div className="flex flex-col gap-6">
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
          {numeros.ia.na_fila > 0 && (
            <p className="text-body-sm text-ink-muted">{numeros.ia.na_fila} anúncio(s) esperando a IA revisar.</p>
          )}
        </div>
      </Secao>

      <Secao titulo="Configurações">
        <FormConfigIA config={config} modelos={MODELOS_IA} chaves={chaves} />
      </Secao>

      {copiloto && (
        <Secao
          titulo="Copiloto (teste)"
          descricao="As contas que veem o Copiloto nas vagas. Para liberar ou tirar, abra a conta em Usuários."
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

      <Secao titulo="Últimas revisões" descricao="O que a moderação automática decidiu. Anúncio retido fica em Denúncias até alguém decidir.">
        {decisoes.length === 0 ? (
          <p className="text-body-sm text-ink-muted">A IA ainda não revisou nenhum anúncio.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {decisoes.map((d) => (
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
      </Secao>
    </div>
  );
}
