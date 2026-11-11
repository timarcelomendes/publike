import { Download, List, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { MesaDeCandidatos } from "@/components/painel/mesa-candidatos";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { esperaResposta } from "@/lib/constantes";
import { ajudaDaIADisponivel, obterAnuncio } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { montarCaixa } from "@/lib/servidor/caixa";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Candidatos" };

// Candidatos, numa página só (claude/plano-painel-simples.md, parte 2): as etapas no alto (Novos, Em análise,
// Entrevista, Contratados, Não seguiu), a lista à esquerda e a ficha de quem está aberto à direita, com a
// decisão e os atalhos de teclado. Vaga, Ordem, Lista, Planilha e Triagem rápida em cima. No celular, a lista e a
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

  const paraResponder = itens.filter(esperaResposta).length;
  const pedidaVaga = primeiro(sp.vaga);
  const vaga =
    pedidaVaga && UUID.test(pedidaVaga) && itens.some((c) => c.anuncio_id === pedidaVaga) ? pedidaVaga : null;
  const planilha = `/painel/candidatos/planilha${vaga ? `?vaga=${vaga}` : ""}`;
  // a lista de todos, com os detalhes de cada um (saiu do menu em 11/11/2026: fica aqui, ao lado da planilha)
  const lista = `/painel/candidatos${vaga ? `?vaga=${vaga}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      {/* as ações da página na linha do título, à direita e menores (no celular, "Triagem" e o ícone da planilha):
          o caminho das etapas sobe e a lista aparece mais cedo */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h2">Candidatos</h2>
          <div className="flex shrink-0 items-center gap-2">
            {paraResponder > 0 && (
              <BotaoLink
                href={`/painel/caixa/triagem${vaga ? `?vaga=${vaga}` : ""}`}
                variante="primario"
                tamanho="sm"
                aria-label={`Decidir um por um (${paraResponder})`}
              >
                <Zap aria-hidden />
                <span aria-hidden>
                  <span className="sm:hidden">Um por um</span>
                  <span className="hidden sm:inline">Decidir um por um</span> ({paraResponder})
                </span>
              </BotaoLink>
            )}
            <Link
              href={lista}
              aria-label="Ver todos em lista"
              title="Todos os candidatos numa lista, com os detalhes de cada um"
              className={classesBotao("secundario", "sm", "min-w-10 px-2.5 sm:px-3.5")}
            >
              <List aria-hidden />
              <span aria-hidden className="hidden sm:inline">
                Lista
              </span>
            </Link>
            <a
              href={planilha}
              aria-label="Baixar planilha"
              title="Baixar planilha"
              className={classesBotao("secundario", "sm", "min-w-10 px-2.5 sm:px-3.5")}
            >
              <Download aria-hidden />
              <span aria-hidden className="hidden sm:inline">
                Planilha
              </span>
            </a>
          </div>
        </div>
        <p className={`max-w-2xl text-body text-ink-muted ${primeiro(sp.c) ? "max-lg:hidden" : ""}`}>
          Todos os candidatos, pelo que fazer agora. Abra a ficha, decida e siga para o próximo.
        </p>
      </div>

      <MesaDeCandidatos itens={itens} sp={sp} agora={agora} comIA={comIA} base="/painel/caixa" euId={usuario.id} />
    </div>
  );
}
