import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormConfigIA } from "@/components/admin/ia";
import { Secao, Situacao } from "@/components/admin/ui";
import { Selo } from "@/components/ui/basicos";
import { configDoSite, decisoesDaIA, numerosDoPainel } from "@/lib/admin/dados";
import { CATEGORIAS_IA } from "@/lib/admin/textos";
import { tempoRelativo } from "@/lib/formato";
import { iaConfigurada, MODELOS_IA } from "@/lib/ia/openai";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "IA" };

// Preço da OpenAI por milhão de tokens (entrada / saída), em dólar, em outubro de 2026.
// GPT-6 Luna: US$ 0,10 / 0,50. GPT-6.1 Sol: US$ 2 / 10, e ele raciocina antes (gasta mais saída).
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
  const [config, decisoes, numeros, agora] = await Promise.all([
    configDoSite(c),
    decisoesDaIA(c, 40),
    numerosDoPainel(c),
    agoraDaRequisicao(),
  ]);
  const filas = situacaoFilas();
  const chave = iaConfigurada();

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Chave da IA"
        descricao={
          <>
            A IA é da OpenAI. A chave fica só nas variáveis de ambiente do servidor (<code>OPENAI_API_KEY</code>),
            nunca aqui. Crie a chave em platform.openai.com, em API keys, e ponha créditos na conta. O texto dos
            anúncios não fica guardado na OpenAI.
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Situacao ok={chave}>{chave ? "Chave configurada neste servidor." : "Falta OPENAI_API_KEY no .env.local."}</Situacao>
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
        <FormConfigIA config={config} modelos={MODELOS_IA} />
      </Secao>

      <Secao titulo="Quanto custa" descricao="Valores aproximados, cobrados pela OpenAI no cartão da conta de vocês.">
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
