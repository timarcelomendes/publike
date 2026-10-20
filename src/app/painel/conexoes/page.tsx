import { Clock, Handshake, MessageCircle, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { DesfazerConexao, ResponderConexao } from "@/components/conexoes/acoes-conexao";
import { linkDoOutro, QuemConexao } from "@/components/conexoes/quem";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { caminhoConexao, pedirDeNovoEm, type Conexao } from "@/lib/conexoes";
import { meuCurriculoNaVitrine, obterMeuPerfil } from "@/lib/dados";
import { formatarDataCurta, tempoRelativo } from "@/lib/formato";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Conexões", robots: { index: false } };

// As conexões entre talentos e empresas, sem vaga: os pedidos para responder, as conexões (com o
// contato e a conversa), os pedidos que fiz e os que não foram aceitos.

export default function Conexoes() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-h3">
        {titulo}
      </h3>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
        {children}
      </ul>
    </section>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/conexoes");
  const [lista, perfil, agora] = await Promise.all([
    minhasConexoes(),
    obterMeuPerfil().catch(() => null),
    agoraDaRequisicao(),
  ]);
  if (!lista) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar as conexões agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  const recebidos = lista.filter((c) => c.status === "pendente" && !c.pedi);
  const conexoes = lista.filter((c) => c.status === "aceita");
  const enviados = lista.filter((c) => c.status === "pendente" && c.pedi);
  const naoAceitos = lista.filter((c) => c.status === "recusada");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-h2">Conexões</h2>
        <p className="mt-1 text-body text-ink-muted">
          {empresa
            ? "Gente da aba Talentos com quem você quer conversar, mesmo sem vaga aberta. Quando a pessoa aceita, aparecem o WhatsApp e o e-mail e vocês conversam por aqui."
            : "Empresas, comércios e agências com quem você quer conversar, mesmo sem vaga aberta. Quando o outro lado aceita, aparecem os contatos e vocês conversam por aqui."}
        </p>
      </div>

      {lista.length === 0 && (empresa ? <VazioEmpresa /> : <VazioTalento />)}

      {recebidos.length > 0 && (
        <Secao id="recebidos" titulo="Pedidos para você">
          {recebidos.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <QuemConexao c={c} />
                <span className="text-body-sm text-ink-muted">{tempoRelativo(c.criado_em, agora)}</span>
              </div>
              {c.mensagem && (
                <blockquote className="rounded-md bg-surface-300 px-3 py-2 text-body whitespace-pre-line">
                  {c.mensagem}
                </blockquote>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ResponderConexao id={c.id} />
                <Link href={linkDoOutro(c)} className="text-body-sm underline underline-offset-2 hover:text-ink">
                  {c.outro_tipo === "pessoa" ? "Ver o currículo" : "Ver a página"}
                </Link>
              </div>
            </li>
          ))}
        </Secao>
      )}

      {conexoes.length > 0 && (
        <Secao id="conectados" titulo={conexoes.length === 1 ? "Sua conexão" : "Suas conexões"}>
          {conexoes.map((c) => (
            <li key={c.id}>
              <Link href={caminhoConexao(c.outro_id)} className="flex gap-3 p-4 transition-colors hover:bg-surface-300">
                <div className="min-w-0 flex-1">
                  <QuemConexao c={c} link={false} />
                  <div className="mt-2 flex items-center gap-2">
                    <MessageCircle aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    <p
                      className={`min-w-0 flex-1 truncate text-body-sm ${c.nao_lidas > 0 ? "font-semibold text-ink" : "text-ink-muted"}`}
                    >
                      {c.ultima_texto
                        ? `${c.ultima_minha ? "Você: " : ""}${c.ultima_texto}`
                        : "Conectados! Mande a primeira mensagem."}
                    </p>
                    {c.nao_lidas > 0 && (
                      <span className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-on-like">
                        {c.nao_lidas}
                        <span className="sr-only"> {c.nao_lidas === 1 ? "mensagem nova" : "mensagens novas"}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </Secao>
      )}

      {enviados.length > 0 && (
        <Secao id="enviados" titulo="Pedidos que você fez">
          {enviados.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <QuemConexao c={c} />
              <div className="flex flex-col items-end gap-1">
                <span className="inline-flex items-center gap-1.5 text-body-sm text-ink-muted">
                  <Clock aria-hidden className="size-4" />
                  Esperando resposta · {tempoRelativo(c.criado_em, agora)}
                </span>
                <DesfazerConexao id={c.id} rotulo="Cancelar pedido" />
              </div>
            </li>
          ))}
        </Secao>
      )}

      {naoAceitos.length > 0 && <NaoAceitos lista={naoAceitos} />}
    </div>
  );
}

function NaoAceitos({ lista }: { lista: Conexao[] }) {
  return (
    <Secao id="nao-aceitos" titulo="Não aceitos">
      {lista.map((c) => {
        const de = pedirDeNovoEm(c.respondida_em);
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <QuemConexao c={c} tamanho={40} />
            <span className="text-body-sm text-ink-muted">
              {de ? `Dá para pedir de novo a partir de ${formatarDataCurta(de)}` : "Não aceitou"}
            </span>
          </li>
        );
      })}
    </Secao>
  );
}

function VazioEmpresa() {
  return (
    <Vazio icone={Handshake} titulo="Nenhuma conexão ainda" acao={<BotaoLink href="/talentos">Ver talentos</BotaoLink>}>
      Na aba Talentos, toque em Conectar em quem combina com a sua empresa. Não precisa ter vaga aberta: quando a pessoa
      aceita, vocês conversam por aqui.
    </Vazio>
  );
}

async function VazioTalento() {
  const naAba = await meuCurriculoNaVitrine().catch(() => false);
  return (
    <Vazio
      icone={UserPlus}
      titulo="Nenhuma conexão ainda"
      acao={
        naAba ? (
          <BotaoLink href="/?tipo=vaga">Ver empresas com vagas</BotaoLink>
        ) : (
          <BotaoLink href="/perfil/curriculo?para=talentos" variante="primario">
            Aparecer na aba Talentos
          </BotaoLink>
        )
      }
    >
      {naAba
        ? "Empresas da região podem pedir conexão com você. Você também pode: na página de uma empresa, comércio ou agência, toque em Conectar."
        : "Apareça na aba Talentos para as empresas da região acharem você e pedirem conexão, mesmo sem vaga aberta. Você também pode pedir, na página de cada empresa."}
    </Vazio>
  );
}
