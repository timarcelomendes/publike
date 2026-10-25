import type { Metadata } from "next";
import { Suspense } from "react";
import { BotaoApagarChave, FormNovaChave, GeradorDeChavesVapid, GeradorDeSegredo } from "@/components/admin/chaves";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Numero, Secao, Situacao } from "@/components/admin/ui";
import { listarChavesServidor, pushNoSitePublicado, situacaoDoPush } from "@/lib/admin/dados";
import { formatarDataCurta, tempoRelativo } from "@/lib/formato";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { chavesVapid } from "@/lib/servidor/ambiente";

export const metadata: Metadata = { title: "Chaves" };

export default function Chaves() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [chaves, agora] = await Promise.all([listarChavesServidor(c), agoraDaRequisicao()]);
  const filas = situacaoFilas();

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Chave do servidor"
        descricao={
          <>
            O site publicado usa esta chave para mandar os e-mails e rodar a IA. Ela não abre o admin nem lê os dados das
            pessoas: só pega o que está na fila. A chave secreta do Supabase fica só neste computador.
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Situacao ok>
            Este computador usa a {filas.acesso === "chave do servidor" ? "chave do servidor (PUBLIKE_CHAVE_SERVIDOR)" : "chave secreta do Supabase"}.
          </Situacao>
          <Situacao ok={chaves.length > 0}>
            {chaves.length > 0
              ? `${chaves.length} chave(s) criada(s) para outros lugares.`
              : "Nenhuma chave criada ainda. Crie uma antes de publicar o site."}
          </Situacao>
        </div>
      </Secao>

      {chaves.length > 0 && (
        <Secao titulo="Chaves criadas" descricao="O banco guarda só uma impressão de cada chave, não a chave em si. Perdeu uma? Apague e gere outra.">
          <ul className="flex flex-col divide-y divide-line">
            {chaves.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex flex-col">
                  <span className="text-label">{k.nome}</span>
                  <span className="text-body-sm text-ink-muted">
                    Criada em {formatarDataCurta(k.criada_em)} ·{" "}
                    {k.usada_em ? `usada ${tempoRelativo(k.usada_em, agora)}` : "ainda não usada"}
                  </span>
                </div>
                <BotaoApagarChave id={k.id} nome={k.nome} />
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Gerar uma chave">
        <FormNovaChave />
      </Secao>

      <Secao
        titulo="Gerar um segredo"
        descricao="Para os segredos que o site usa fora do banco, como o CRON_SECRET das tarefas agendadas. O valor nasce aqui no navegador e não fica guardado: copie na hora."
      >
        <GeradorDeSegredo />
      </Secao>

      <Secao
        titulo="Notificações no celular"
        descricao="As chaves que assinam as notificações (Web Push). Sem elas, o sino não mostra o “Ativar notificações”."
      >
        <SituacaoDoPush />
        <GeradorDeChavesVapid ligadas={Boolean(chavesVapid())} />
      </Secao>
    </div>
  );
}

/** Como estão as notificações no site publicado (pergunta ao site) e os números do banco de produção. */
async function SituacaoDoPush() {
  const c = await exigirAdminLocal();
  const [site, numeros, agora] = await Promise.all([pushNoSitePublicado(), situacaoDoPush(c), agoraDaRequisicao()]);
  const local = chavesVapid();
  const nome = site ? new URL(site.endereco).host : "publike.org";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {site ? (
          <Situacao ok={site.ligadas}>
            {site.ligadas
              ? `Ligadas em ${nome}: as chaves estão na Vercel.`
              : `Desligadas em ${nome}: faltam PUBLIKE_VAPID_PUBLICA e PUBLIKE_VAPID_PRIVADA na Vercel (ou o Redeploy depois de criar).`}
          </Situacao>
        ) : (
          <Situacao ok={false}>
            Não deu para perguntar a {nome} agora (o site está fora do ar ou sem o código novo).
          </Situacao>
        )}
        {local && site?.chave && local.publica !== site.chave && (
          <Situacao ok={false}>
            As chaves deste computador são diferentes das da Vercel. As notificações saem com as da Vercel; para testar
            aqui, ponha as mesmas no .env.local.
          </Situacao>
        )}
        {!local && (
          <p className="text-body-sm text-ink-muted">
            Neste computador estão desligadas (faltam no .env.local). Não precisa para o site publicado.
          </p>
        )}
      </div>
      {numeros && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero
            rotulo="Aparelhos ativados"
            valor={numeros.aparelhos}
            detalhe={`${numeros.contas} conta(s), ${numeros.novos_7d} em 7 dias`}
          />
          <Numero
            rotulo="Saíram (24 h)"
            valor={numeros.enviadas_24h}
            detalhe={
              numeros.ultima_enviada ? `a última ${tempoRelativo(numeros.ultima_enviada, agora)}` : "nenhuma ainda"
            }
          />
          <Numero rotulo="Falharam (24 h)" valor={numeros.falhas_24h} alerta={numeros.falhas_24h > 0} />
          <Numero
            rotulo="Na fila"
            valor={numeros.na_fila}
            alerta={Boolean(
              numeros.mais_antiga_na_fila && agora - new Date(numeros.mais_antiga_na_fila).getTime() > 15 * 60_000,
            )}
            detalhe={
              numeros.mais_antiga_na_fila ? `desde ${tempoRelativo(numeros.mais_antiga_na_fila, agora)}` : "vazia"
            }
          />
        </div>
      )}
      {numeros?.ultimo_erro && numeros.ultimo_erro_em && (
        <p className="text-body-sm text-ink-muted">
          Último erro ({tempoRelativo(numeros.ultimo_erro_em, agora)}): {numeros.ultimo_erro}
        </p>
      )}
    </div>
  );
}
