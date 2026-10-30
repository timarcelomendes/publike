import { ArrowLeft, Download, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BotaoConectar } from "@/components/conexoes/botao-conectar";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FichaCandidato } from "@/components/painel/ficha-candidato";
import { RegistrarVisitaPerfil } from "@/components/visitas/registrar-visita";
import { FiltroVaga } from "@/components/painel/filtro-vaga";
import { classesChip } from "@/components/painel/fluxo";
import { CaminhoDasEtapas } from "@/components/painel/caminho-etapas";
import { ItemDaLista } from "@/components/painel/item-caixa";
import { OrdemDaCaixa } from "@/components/painel/ordem-caixa";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { esperaResposta } from "@/lib/constantes";
import { ajudaDaIADisponivel, obterAnuncio } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { anunciosComContatoDireto } from "@/lib/servidor/contato-direto";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { empresasDosTrabalhos } from "@/lib/servidor/empresas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import {
  ABA_ANTIGA,
  ABAS,
  abaDe,
  montarCaixa,
  naAba,
  ORDENS,
  ordenar,
  type Aba,
  type ItemCaixa,
  type Ordem,
} from "@/lib/servidor/caixa";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Candidatos" };

/** A linha embaixo do número de cada etapa, quando ninguém ali espera você. */
const AJUDA_DA_ETAPA: Record<Aba, string> = {
  novos: "Curtiram a vaga",
  analise: "Você está olhando",
  entrevista: "Com ou sem data",
  contratados: "Fim do caminho",
  nao_seguiu: "",
};

// Candidatos, numa página só (claude/plano-painel-simples.md, parte 2): as etapas no alto (Novos, Em análise,
// Entrevista, Contratados, Não seguiu), a lista à esquerda e a ficha de quem está aberto à direita, com a
// decisão e os atalhos de teclado. Vaga, Ordem, Planilha e Triagem rápida em cima. No celular, a lista e a
// ficha viram duas telas. As mensagens novas ficam nas Mensagens; a antiga "Lista e planilha" e a página de
// Contratados (fora da agência) trazem para cá.

export default function CaixaDeEntrada({ searchParams }: PageProps<"/painel/caixa">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/caixa">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/caixa");
  const sp = await searchParams;
  // a antiga aba "Mensagens novas": as conversas ficam nas Mensagens
  if (primeiro(sp.aba) === "mensagens") redirect("/painel/conversas");
  const agora = await agoraDaRequisicao();
  const [itens, comIA] = await Promise.all([montarCaixa(agora), ajudaDaIADisponivel()]);

  // o aviso da curtida de um serviço (a Caixa é só das vagas) abre o próprio anúncio
  const pedidoDoAviso = primeiro(sp.c);
  if (pedidoDoAviso && itens && !itens.some((c) => c.chave === pedidoDoAviso)) {
    const anuncioId = pedidoDoAviso.split(":")[0];
    const anuncio = UUID.test(anuncioId) ? await obterAnuncio(anuncioId) : null;
    if (anuncio && anuncio.tipo === "servico" && anuncio.autor_id === usuario.id)
      redirect(`/painel/anuncio/${anuncioId}`);
  }

  if (!itens) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar a caixa de entrada agora">
        Tente de novo em instantes. Enquanto isso, cada vaga mostra quem curtiu em “Minhas vagas”.
      </Aviso>
    );
  }
  if (itens.length === 0) {
    return (
      <Vazio
        icone={Users}
        titulo="Ninguém curtiu suas vagas ainda"
        acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
      >
        Quem curtir qualquer vaga sua chega aqui, numa caixa de entrada só: você aceita ou dispensa com um toque, marca
        a entrevista e conversa, tudo na ficha da pessoa.
      </Vazio>
    );
  }

  // filtros: a vaga e a aba
  const vagas = new Map<string, { id: string; titulo: string; total: number }>();
  for (const c of itens) {
    const v = vagas.get(c.anuncio_id) ?? { id: c.anuncio_id, titulo: c.anuncio_titulo, total: 0 };
    v.total++;
    vagas.set(c.anuncio_id, v);
  }
  const pedidaVaga = primeiro(sp.vaga);
  const vaga = pedidaVaga && UUID.test(pedidaVaga) && vagas.has(pedidaVaga) ? pedidaVaga : null;
  const daVaga = vaga ? itens.filter((c) => c.anuncio_id === vaga) : itens;
  const contagem = new Map(ABAS.map((a) => [a.valor, daVaga.filter(naAba[a.valor]).length]));
  // quem espera a sua resposta, em cada etapa (a marca "espera você")
  const esperam = new Map(
    ABAS.map((a) => [a.valor, daVaga.filter((c) => naAba[a.valor](c) && esperaResposta(c)).length]),
  );
  const pedidaAba = primeiro(sp.aba) ?? "";
  const valida = ABAS.some((a) => a.valor === pedidaAba) ? (pedidaAba as Aba) : (ABA_ANTIGA[pedidaAba] ?? null);
  // sem etapa pedida: a primeira em que alguém espera você; senão, a primeira com gente
  // um link para uma pessoa (aviso, Hoje, quadro), sem a etapa: abre a etapa em que ela está
  const daPessoa = !ABAS.some((a) => a.valor === pedidaAba) ? daVaga.find((c) => c.chave === primeiro(sp.c)) : null;
  const aba: Aba =
    (daPessoa ? abaDe(daPessoa) : null) ??
    valida ??
    ABAS.find((a) => esperam.get(a.valor))?.valor ??
    ABAS.find((a) => contagem.get(a.valor))?.valor ??
    "novos";
  const pedidaOrdem = primeiro(sp.ordem) ?? "";
  const ordem: Ordem = ORDENS.some((o) => o.valor === pedidaOrdem) ? (pedidaOrdem as Ordem) : "";
  const lista = ordenar(aba, daVaga.filter(naAba[aba]), ordem);

  // quem está aberto: o pedido (mesmo fora da aba, depois de um "desfazer") ou o primeiro
  const pedido = primeiro(sp.c);
  const escolhido = Boolean(pedido && itens.some((c) => c.chave === pedido));
  const aberto: ItemCaixa | null = escolhido ? (itens.find((c) => c.chave === pedido) ?? null) : (lista[0] ?? null);
  const posicao = aberto ? lista.findIndex((c) => c.chave === aberto.chave) : -1;

  const href = (mudar: { aba?: Aba; c?: string | null }) => {
    const q = new URLSearchParams();
    q.set("aba", mudar.aba ?? aba);
    if (vaga) q.set("vaga", vaga);
    if (ordem) q.set("ordem", ordem);
    if (mudar.c) q.set("c", mudar.c);
    return `/painel/caixa?${q}`;
  };
  const anterior = posicao > 0 ? href({ c: lista[posicao - 1].chave }) : null;
  const proximo = posicao >= 0 && posicao < lista.length - 1 ? href({ c: lista[posicao + 1].chave }) : null;
  // depois de responder, abre o próximo que ainda espera (ou o anterior, se era o último)
  const seguinte = posicao >= 0 ? (lista[posicao + 1] ?? lista[posicao - 1] ?? null) : (lista[0] ?? null);
  const depois = href({ c: seguinte && seguinte.chave !== aberto?.chave ? seguinte.chave : null });
  const paraResponder = daVaga.filter(esperaResposta).length;
  const planilha = `/painel/candidatos/planilha${vaga ? `?vaga=${vaga}` : ""}`;
  // a conexão com quem está aberto (fica depois da vaga acabar)
  const conexao = aberto ? ((await estadosDeConexao([aberto.perfil_id])).get(aberto.perfil_id) ?? null) : null;
  // contato direto: o match saiu na hora (sem aceite); a mensagem do WhatsApp leva o link da vaga
  const direto = aberto ? (await anunciosComContatoDireto([aberto.anuncio_id])).has(aberto.anuncio_id) : false;
  // as empresas do currículo com conta no Publike: o logo e o link
  const empresas = aberto?.curriculo
    ? await empresasDosTrabalhos(await criarClienteServidor(), aberto.curriculo.experiencias)
    : {};

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-h2">Candidatos</h2>
          <p className="mt-1 text-body text-ink-muted">
            <Selo variante="novo">Novo</Selo> Quem curtiu suas vagas, por etapa. Abra a ficha, decida e siga para o
            próximo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {paraResponder > 0 && (
            <BotaoLink href={`/painel/caixa/triagem${vaga ? `?vaga=${vaga}` : ""}`} variante="primario" tamanho="sm">
              <Zap aria-hidden />
              Triagem rápida ({paraResponder})
            </BotaoLink>
          )}
          <a href={planilha} className={classesBotao("secundario", "sm")}>
            <Download aria-hidden />
            Baixar planilha
          </a>
        </div>
      </div>

      {/* o caminho do candidato, numerado como o passo a passo do Publicar (Novos → Em análise → Entrevista →
          Contratados); o "Não seguiu" fica à parte, na linha da Vaga e da Ordem */}
      <CaminhoDasEtapas
        etapas={ABAS.filter((a) => a.valor !== "nao_seguiu").map((a) => ({
          valor: a.valor,
          nome: a.nome,
          numero: contagem.get(a.valor) ?? 0,
          espera: esperam.get(a.valor) ?? 0,
          ajuda: AJUDA_DA_ETAPA[a.valor],
          href: href({ aba: a.valor }),
          ativa: a.valor === aba,
        }))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href({ aba: "nao_seguiu" })}
          scroll={false}
          aria-current={aba === "nao_seguiu" ? "page" : undefined}
          className={classesChip(aba === "nao_seguiu", false, !(contagem.get("nao_seguiu") ?? 0))}
        >
          Não seguiu
          {(contagem.get("nao_seguiu") ?? 0) > 0 && (
            <span className={aba === "nao_seguiu" ? "text-surface-100/80" : "text-ink-muted"}>
              {contagem.get("nao_seguiu")}
            </span>
          )}
        </Link>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {vagas.size > 1 && (
            <FiltroVaga
              compacto
              vagas={[...vagas.values()]}
              vaga={vaga}
              etapa={null}
              caminho="/painel/caixa"
              aba={aba}
            />
          )}
          {lista.length > 1 && <OrdemDaCaixa ordens={ORDENS} ordem={ordem} base={href({})} />}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <div className={escolhido ? "hidden lg:block" : ""}>
          {lista.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface-200 px-4 py-6 text-body-sm text-ink-muted">
              {ABAS.find((a) => a.valor === aba)?.vazio}
            </p>
          ) : (
            <ul
              aria-label="Lista da caixa de entrada"
              className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto"
            >
              {lista.map((c) => (
                <ItemDaLista key={c.chave} c={c} agora={agora} href={href({ c: c.chave })} aberto={c === aberto} />
              ))}
            </ul>
          )}
        </div>

        <div className={escolhido ? "flex flex-col gap-3" : "hidden lg:flex lg:flex-col lg:gap-3"}>
          {escolhido && (
            <Link
              href={href({ c: null })}
              scroll={false}
              className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink lg:hidden"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Voltar à lista
            </Link>
          )}
          {aberto && (
            // a empresa abriu a candidatura: a pessoa fica sabendo (só quando a ficha aparece na tela)
            <RegistrarVisitaPerfil
              key={aberto.chave}
              perfilId={aberto.perfil_id}
              onde="candidatura"
              anuncioId={aberto.anuncio_id}
            />
          )}
          {aberto ? (
            <FichaCandidato
              c={aberto}
              empresas={empresas}
              direto={direto}
              agora={agora}
              anterior={anterior}
              proximo={proximo}
              depois={depois}
              comIA={comIA}
              conectar={
                <BotaoConectar
                  key={aberto.perfil_id}
                  outroId={aberto.perfil_id}
                  outroNome={aberto.nome}
                  estado={conexao}
                  logado
                  voltar={href({ c: aberto.chave })}
                  para="talento"
                  jeito="cartao"
                />
              }
            />
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-10 text-center text-body-sm text-ink-muted">
              Nada aberto. Escolha alguém de outra etapa.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
