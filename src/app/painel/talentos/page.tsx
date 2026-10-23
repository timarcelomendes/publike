import { ChevronDown, ChevronLeft, ChevronRight, Megaphone, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoConectar } from "@/components/conexoes/botao-conectar";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { BotaoConvidar } from "@/components/painel/botao-convidar";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FiltroVaga } from "@/components/painel/filtro-vaga";
import { CriteriosDaAderencia, NotaAderencia } from "@/components/painel/nota-aderencia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { CartaoTalento } from "@/components/talentos/cartao-talento";
import { Aviso, Avatar, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { calcularAderencia, requisitosDaVaga } from "@/lib/aderencia";
import { MODO_DEMO } from "@/lib/config";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { listarMeusAnuncios, obterAnuncio, obterMeuPerfil, talentosParaVaga } from "@/lib/dados";
import { formatarLugar, formatarNumero, primeiro, tempoRelativo } from "@/lib/formato";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { buscarTalentos } from "@/lib/servidor/talentos";
import { exigirUsuario } from "@/lib/sessao";
import { MAX_PAGINAS_TALENTOS, TALENTOS_POR_PAGINA } from "@/lib/talentos";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Talentos" };

// Talentos: todos os que deixaram as empresas acharem o currículo. Com vaga no ar, do que mais
// combina com ela para o que menos combina, com o Convidar; sem vaga, todos, com o Conectar e o
// convite para publicar. Sem contato e com o nome encurtado: o contato sai só no match (ou na conexão).

export default function Talentos({ searchParams }: PageProps<"/painel/talentos">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/talentos">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/talentos");
  const [sp, anuncios] = await Promise.all([searchParams, listarMeusAnuncios()]);
  const agora = await agoraDaRequisicao();
  const noAr = anuncios.filter(
    (a) => a.tipo === "vaga" && a.status === "ativo" && new Date(a.expira_em).getTime() > agora,
  );

  const cabecalho = (
    <div className="max-w-2xl">
      <h2 className="text-h2">Talentos</h2>
      <p className="mt-1 text-body text-ink-muted">
        Quem tem currículo no Publike e deixou as empresas acharem. Convide quem combina: a pessoa vê a vaga e, se
        curtir, chega na sua caixa de entrada.
      </p>
      <p className="mt-1 text-body-sm text-ink-muted">
        Para procurar por cargo ou habilidade, use a{" "}
        <Link href="/talentos" className="text-label text-ink underline underline-offset-2">
          aba Talentos da busca
        </Link>
        .
      </p>
    </div>
  );
  if (!noAr.length) {
    const pagina = Math.max(1, Math.min(MAX_PAGINAS_TALENTOS, Number(primeiro(sp.pagina)) || 1));
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
          <Megaphone aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <p className="min-w-0 grow basis-64 text-body-sm">
            <span className="text-label">Com uma vaga no ar,</span> você vê o % de quem mais combina com ela e convida
            direto daqui. Sem vaga, toque em Conectar: quando a pessoa aceita, aparecem o contato e a conversa.
          </p>
          <BotaoLink href="/publicar" tamanho="sm">
            Publicar vaga grátis
          </BotaoLink>
        </div>
        <TodosOsTalentos pagina={pagina} />
      </div>
    );
  }

  const pedida = primeiro(sp.vaga);
  const vaga = noAr.find((a) => a.id === pedida) ?? noAr[0];
  const [anuncio, lista] = await Promise.all([obterAnuncio(vaga.id), talentosParaVaga(vaga.id).catch(() => null)]);
  if (!anuncio || !lista) {
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        <Aviso tipo="alerta" titulo="Não deu para carregar os talentos agora">
          Tente de novo em instantes.
        </Aviso>
      </div>
    );
  }
  const requisitos = { ...requisitosDaVaga(anuncio), perguntas: [] };
  const talentos = lista
    .map((t) => ({
      t,
      a: calcularAderencia(
        requisitos,
        {
          curriculo: {
            escolaridade: t.escolaridade,
            experiencias: t.experiencias,
            cursos: t.cursos,
            cnh: t.cnh,
            disponibilidade: t.disponibilidade,
          },
          respostas: {},
          cidade: t.cidade,
          bairro: t.bairro,
        },
        agora,
      ),
    }))
    .sort((x, y) => (y.a.nota ?? -1) - (x.a.nota ?? -1));
  const hoje = new Date(agora).toISOString().slice(0, 7);

  return (
    <div className="flex flex-col gap-5">
      {cabecalho}
      {noAr.length > 1 && (
        <div className="sm:w-96">
          <FiltroVaga
            vagas={noAr.map((v) => ({ id: v.id, titulo: v.titulo, total: v.curtidas_total }))}
            vaga={vaga.id}
            etapa={null}
            caminho="/painel/talentos"
          />
        </div>
      )}
      <p className="text-body-sm text-ink-muted">
        {talentos.length
          ? `${formatarNumero(talentos.length)} ${talentos.length === 1 ? "pessoa" : "pessoas"} para “${anuncio.titulo}”, quem mais combina primeiro.`
          : ""}
      </p>
      {talentos.length === 0 ? (
        <Vazio icone={UserSearch} titulo="Ninguém em Talentos para esta vaga ainda">
          Aparece quem tem currículo e deixou as empresas acharem (quem já curtiu a vaga está nos candidatos). Enquanto
          isso, divulgue o link da vaga.
        </Vazio>
      ) : (
        <ul aria-label="Talentos" className="flex flex-col gap-3">
          {talentos.map(({ t, a }) => {
            const estudo = nomeEscolaridade(t.escolaridade);
            return (
              <li key={t.perfil_id} className="rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
                <div className="flex gap-3">
                  <Avatar nome={t.nome} foto={t.foto} tamanho={48} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-label">{t.nome}</span>
                      {t.titulo && <span className="text-body-sm text-ink-muted">· {t.titulo}</span>}
                      <NotaAderencia a={a} longo />
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {formatarLugar(t.bairro, t.cidade)} · currículo atualizado {tempoRelativo(t.atualizado_em, agora)}
                    </p>
                    <p className="mt-1 text-body-sm">
                      {t.experiencias.length
                        ? t.experiencias
                            .slice(0, 2)
                            .map((e) => [e.cargo, e.onde].filter(Boolean).join(" · "))
                            .join(" / ")
                        : "Primeiro emprego"}
                      {estudo && <span className="text-ink-muted"> · {estudo}</span>}
                      {t.disponibilidade.length > 0 && (
                        <span className="text-ink-muted">
                          {" "}
                          · pode {t.disponibilidade.map(nomeDisponibilidade).join(", ").toLowerCase()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="hidden shrink-0 sm:block">
                    <BotaoConvidar anuncioId={vaga.id} perfilId={t.perfil_id} convidado={t.convidado} />
                  </div>
                </div>
                <div className="mt-3 sm:hidden">
                  <BotaoConvidar anuncioId={vaga.id} perfilId={t.perfil_id} convidado={t.convidado} />
                </div>
                <details className="group mt-3 border-t border-line pt-2">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-label text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                    Ver currículo e o que combina
                    <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 grid gap-4 md:grid-cols-2">
                    <CurriculoResumo
                      curriculo={{
                        escolaridade: t.escolaridade,
                        curso: t.curso,
                        estudos: t.estudos,
                        experiencias: t.experiencias,
                        cursos: t.cursos,
                        cnh: t.cnh,
                        disponibilidade: t.disponibilidade,
                        arquivo: null,
                        atualizado_em: t.atualizado_em,
                        titulo: t.titulo,
                        habilidades: t.habilidades,
                      }}
                      linkPdf={null}
                      hoje={hoje}
                    />
                    <CriteriosDaAderencia a={a} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-body-sm text-ink-muted">
        O telefone e o e-mail só aparecem se a pessoa curtir a vaga e você aceitar. Quem não quiser mais aparecer tira o
        currículo de Talentos quando quiser.
      </p>
    </div>
  );
}

/** Sem vaga no ar: todos os talentos (os do bairro da conta primeiro), em páginas, com o Conectar. */
async function TodosOsTalentos({ pagina }: { pagina: number }) {
  const perfil = await obterMeuPerfil().catch(() => null);
  const resultado = await buscarTalentos({ texto: "", cidade: null, bairro: perfil?.bairro || null, pagina });
  if (!resultado) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os talentos agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const { lista, total } = resultado;
  if (lista.length === 0) {
    return pagina > 1 ? (
      <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm">
        Esta página está vazia.{" "}
        <Link href="/painel/talentos" className="font-semibold underline underline-offset-2">
          Ver a primeira
        </Link>
      </p>
    ) : (
      <Vazio icone={UserSearch} titulo="Ninguém em Talentos ainda">
        Quem procura trabalho e salva o currículo aparece aqui. Enquanto isso, publique sua vaga: quem procura vê.
      </Vazio>
    );
  }
  const paginas = Math.min(Math.ceil(total / TALENTOS_POR_PAGINA), MAX_PAGINAS_TALENTOS);
  const estados = await estadosDeConexao(lista.map((t) => t.perfil_id));
  const href = (n: number) => (n > 1 ? `/painel/talentos?pagina=${n}` : "/painel/talentos");
  return (
    <>
      <p className="text-body-sm text-ink-muted">
        {formatarNumero(total)} {total === 1 ? "talento" : "talentos"}
        {perfil?.bairro ? `. Quem mora no ${perfil.bairro} vem primeiro.` : "."}
      </p>
      <ul aria-label="Talentos" className="grid gap-4 sm:grid-cols-2">
        {lista.map((t) => (
          <li key={t.perfil_id}>
            <CartaoTalento
              t={t}
              acao={
                <BotaoConectar
                  outroId={t.perfil_id}
                  outroNome={t.nome}
                  estado={estados.get(t.perfil_id) ?? null}
                  logado
                  voltar={href(pagina)}
                  para="talento"
                  jeito="cartao"
                />
              }
            />
          </li>
        ))}
      </ul>
      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
          {pagina > 1 ? (
            <BotaoLink href={href(pagina - 1)} tamanho="sm" variante="fantasma">
              <ChevronLeft aria-hidden />
              Anterior
            </BotaoLink>
          ) : (
            <span className="w-24" />
          )}
          <span className="text-body-sm text-ink-muted">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <BotaoLink href={href(pagina + 1)} tamanho="sm" variante="fantasma">
              Próxima
              <ChevronRight aria-hidden />
            </BotaoLink>
          ) : (
            <span className="w-24" />
          )}
        </nav>
      )}
    </>
  );
}
