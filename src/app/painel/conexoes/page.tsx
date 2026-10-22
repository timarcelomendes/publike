import { Building2, Clock, Handshake, MessageCircle, UserPlus, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DesfazerConexao, ResponderConexao } from "@/components/conexoes/acoes-conexao";
import { linkDoOutro, QuemConexao } from "@/components/conexoes/quem";
import { BotaoConectarCompacto } from "@/components/conexoes/botao-conectar-compacto";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SeloVerificado } from "@/components/selo-verificado";
import { BotaoSeguir } from "@/components/social/botoes";
import { ListaSeguindo } from "@/components/social/lista-seguindo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Aviso, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { caminhoConexao, pedirDeNovoEm, type Conexao } from "@/lib/conexoes";
import { meuCurriculoNaVitrine, obterMeuPerfil } from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { formatarDataCurta, formatarLugar, plural, primeiro, tempoRelativo } from "@/lib/formato";
import { estadosDeConexao, minhasConexoes } from "@/lib/servidor/conexoes";
import { contasPerto, nomeNaLista, oQueE } from "@/lib/servidor/contas-perto";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Conexões", robots: { index: false } };

// A rede da conta, em quatro abas: Pessoas (perto de você, com o Conectar), Empresas (comércios,
// empresas e agências perto, com o Seguir), Seguindo (o que a conta segue e as buscas que avisam) e
// Conectadas (os pedidos para responder, as conexões com o contato e a conversa, os pedidos que fiz
// e os que não foram aceitos).

const ABAS = [
  { valor: "pessoas", nome: "Pessoas" },
  { valor: "empresas", nome: "Empresas" },
  { valor: "seguindo", nome: "Seguindo" },
  { valor: "conectadas", nome: "Conectadas" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

export default function Conexoes({ searchParams }: PageProps<"/painel/conexoes">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
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

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/conexoes">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const pedida = primeiro(sp.aba);
  const escolhida = ABAS.find((a) => a.valor === pedida)?.valor ?? null;
  await exigirUsuario(`/painel/conexoes${escolhida ? `?aba=${escolhida}` : ""}`);
  const [lista, perfil, agora, seguidos] = await Promise.all([
    minhasConexoes(),
    obterMeuPerfil().catch(() => null),
    agoraDaRequisicao(),
    meusSeguidos().catch(() => []),
  ]);
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  // os números das abas: quantas conexões e quantos pedidos esperam resposta; quanto a conta segue
  const conectadas = (lista ?? []).filter((c) => c.status === "aceita").length;
  const paraResponder = (lista ?? []).filter((c) => c.status === "pendente" && !c.pedi).length;
  // sem aba no endereço: com pedido para responder, vai para Conectadas (é onde ele está; com a aba no
  // endereço, responder o pedido não muda a aba); senão, Pessoas
  if (!escolhida && paraResponder > 0) redirect("/painel/conexoes?aba=conectadas");
  const aba: Aba = escolhida ?? "pessoas";
  const numeros: Partial<Record<Aba, number>> = { seguindo: seguidos.length, conectadas };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h2 className="text-h2">Conexões</h2>
        <p className="mt-1 text-body text-ink-muted">
          Pessoas e empresas perto de você. Conecte-se para conversar, mesmo sem vaga aberta (quando o outro lado
          aceita, aparecem o WhatsApp e o e-mail dos dois), e siga as empresas para saber das vagas novas.
        </p>
      </div>
      <nav aria-label="Conexões" className="sem-barra -mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-5">
          {ABAS.map((a) => {
            const atual = a.valor === aba;
            const n = numeros[a.valor];
            const pedidos = a.valor === "conectadas" ? paraResponder : 0;
            return (
              <li key={a.valor} className="shrink-0">
                <Link
                  href={`/painel/conexoes?aba=${a.valor}`}
                  aria-current={atual ? "page" : undefined}
                  className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-[3px] text-label whitespace-nowrap ${
                    atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {a.nome}
                  {n ? <span className="text-body-sm text-ink-muted tabular-nums">{n}</span> : null}
                  {pedidos > 0 && (
                    <span className="min-w-5 rounded-pill bg-like px-1.5 text-center text-caption leading-5 text-on-like">
                      {pedidos}
                      <span className="sr-only">
                        {" "}
                        {pedidos === 1 ? "pedido para responder" : "pedidos para responder"}
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {aba === "pessoas" ? (
        <AbaPessoas empresa={empresa} />
      ) : aba === "empresas" ? (
        <AbaEmpresas seguidos={seguidos} />
      ) : aba === "seguindo" ? (
        <ListaSeguindo voltar="/painel/conexoes?aba=seguindo" />
      ) : lista ? (
        <AbaConectadas lista={lista} empresa={empresa} agora={agora} />
      ) : (
        <Aviso tipo="alerta" titulo="Não deu para carregar as conexões agora">
          Tente de novo em instantes.
        </Aviso>
      )}
    </div>
  );
}

/** Uma linha de conta: a foto, o nome (pessoa: "Maria S.") com o selo, o que é e onde, e a ação à direita. */
function LinhaDeConta({
  c,
  detalhe,
  acao,
}: {
  c: {
    id: string;
    nome: string;
    tipo: string;
    foto: string | null;
    cidade: string;
    bairro: string | null;
    verificado: boolean;
  };
  detalhe: string;
  acao: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 p-4">
      <Link href={`/perfil/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
        <Avatar
          nome={c.nome}
          foto={c.foto}
          tamanho={44}
          forma={c.tipo === "pessoa" ? "redonda" : "quadrada"}
          colorida
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-label">
            <span className="truncate">{nomeNaLista(c)}</span>
            {c.verificado && <SeloVerificado agencia={c.tipo === "agencia"} />}
          </span>
          <span className="block truncate text-body-sm text-ink-muted">{detalhe}</span>
        </span>
      </Link>
      <div className="shrink-0">{acao}</div>
    </li>
  );
}

const LISTA =
  "flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card";

/** Pessoas perto, da mais perto para a mais longe, com o Conectar (ou como está a conexão). */
async function AbaPessoas({ empresa }: { empresa: boolean }) {
  const { contas } = await contasPerto({ quem: "pessoas", quantos: 40 });
  if (!contas.length) {
    return (
      <Vazio icone={UsersRound} titulo="Ninguém por perto ainda">
        Quando mais gente do seu bairro entrar no Publike, aparece aqui.
      </Vazio>
    );
  }
  const estados = await estadosDeConexao(contas.map((c) => c.id));
  return (
    <div className="flex flex-col gap-3">
      {empresa && (
        <p className="text-body-sm text-ink-muted">
          Quem deixou o currículo para as empresas acharem está também em{" "}
          <Link href="/talentos" className="font-semibold text-ink underline underline-offset-2">
            Talentos
          </Link>
          , com o que faz e a experiência.
        </p>
      )}
      <ul aria-label="Pessoas perto de você" className={LISTA}>
        {contas.map((c) => (
          <LinhaDeConta
            key={c.id}
            c={c}
            detalhe={`${oQueE(c.tipo)} · ${formatarLugar(c.bairro, c.cidade)}`}
            acao={
              <BotaoConectarCompacto
                outro={{ id: c.id, nome: c.nome, tipo: c.tipo }}
                estado={estados.get(c.id) ?? null}
                voltar="/painel/conexoes?aba=pessoas"
                jeito="pilula"
              />
            }
          />
        ))}
      </ul>
    </div>
  );
}

/** Comércios, empresas e agências perto, com as vagas no ar e o Seguir (aviso de vaga nova). */
async function AbaEmpresas({ seguidos }: { seguidos: Awaited<ReturnType<typeof meusSeguidos>> }) {
  const { contas } = await contasPerto({ quem: "empresas", quantos: 40 });
  if (!contas.length) {
    return (
      <Vazio icone={Building2} titulo="Nenhuma empresa por perto ainda">
        Quando comércios e empresas do seu bairro entrarem no Publike, aparecem aqui.
      </Vazio>
    );
  }
  // quantas vagas cada uma tem no ar (as que contratam agora vêm com o número)
  const { data: vagas } = await (
    await criarClienteServidor()
  )
    .from("anuncios")
    .select("autor_id")
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .in(
      "autor_id",
      contas.map((c) => c.id),
    );
  const noAr = new Map<string, number>();
  for (const v of vagas ?? []) noAr.set(v.autor_id, (noAr.get(v.autor_id) ?? 0) + 1);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-muted">
        Quem você segue manda um aviso quando sai vaga nova (no máximo 5 por dia).
      </p>
      <ul aria-label="Empresas perto de você" className={LISTA}>
        {contas.map((c) => {
          const n = noAr.get(c.id) ?? 0;
          return (
            <LinhaDeConta
              key={c.id}
              c={c}
              detalhe={`${n ? plural(n, "vaga no ar", "vagas no ar") : oQueE(c.tipo)} · ${formatarLugar(c.bairro, c.cidade)}`}
              acao={
                <BotaoSeguir
                  alvo={{ perfil: c.id }}
                  seguidoId={seguidos.find((s) => s.alvo_perfil === c.id)?.id ?? null}
                  logado
                  voltar="/painel/conexoes?aba=empresas"
                  rotulo="Seguir"
                  rotuloSeguindo="Seguindo"
                />
              }
            />
          );
        })}
      </ul>
    </div>
  );
}

/** As conexões: os pedidos para responder, as conexões (com a conversa), os pedidos feitos e os não aceitos. */
function AbaConectadas({ lista, empresa, agora }: { lista: Conexao[]; empresa: boolean; agora: number }) {
  const recebidos = lista.filter((c) => c.status === "pendente" && !c.pedi);
  const conexoes = lista.filter((c) => c.status === "aceita");
  const enviados = lista.filter((c) => c.status === "pendente" && c.pedi);
  const naoAceitos = lista.filter((c) => c.status === "recusada");

  return (
    <div className="flex flex-col gap-6">
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
                  {c.outro_tipo === "pessoa" && c.outro_na_vitrine
                    ? "Ver o currículo"
                    : c.outro_tipo === "pessoa"
                      ? "Ver o perfil"
                      : "Ver a página"}
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
      Na aba Talentos, toque em Conectar em quem combina com a sua empresa, ou no perfil de qualquer pessoa ou empresa.
      Não precisa ter vaga aberta: quando o outro lado aceita, vocês conversam por aqui.
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
        ? "Empresas e pessoas da região podem pedir conexão com você. Você também pode: no perfil de qualquer pessoa, empresa, comércio ou agência, toque em Conectar."
        : "Apareça na aba Talentos para as empresas da região acharem você, mesmo sem vaga aberta. Você também pode pedir conexão no perfil de qualquer pessoa, empresa, comércio ou agência."}
    </Vazio>
  );
}
