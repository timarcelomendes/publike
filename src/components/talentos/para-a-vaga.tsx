import { ChevronDown, ChevronLeft, ChevronRight, Link2, Sparkles, UserSearch } from "lucide-react";
import Link from "next/link";
import { calcularAderencia, requisitosDaVaga } from "@/lib/aderencia";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { copilotoLiberado, obterAnuncio, talentosParaVaga } from "@/lib/dados";
import { formatarLugar, plural, tempoRelativo } from "@/lib/formato";
import { MAX_PAGINAS_TALENTOS, TALENTOS_POR_PAGINA } from "@/lib/talentos";
import { CurriculoResumo } from "../curriculo-resumo";
import { SeloCortesia } from "../selo-cortesia";
import { BotaoConvidar } from "../painel/botao-convidar";
import { CriteriosDaAderencia, NotaAderencia } from "../painel/nota-aderencia";
import { Aviso, Avatar, Vazio } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";

/**
 * "Para a sua vaga", na aba Talentos de quem tem vaga no ar: quem deixou as empresas acharem o currículo,
 * de quem mais combina com a vaga para quem menos combina (a mesma nota dos candidatos), com o Convidar e,
 * ao abrir, o currículo e o porquê da nota. Quem já curtiu a vaga não aparece (está nos candidatos). Sem o
 * contato e com o nome encurtado: o contato sai só no match.
 */
export async function ParaAVaga({
  vaga,
  pagina,
  href,
  agora,
}: {
  vaga: { id: string; titulo: string };
  pagina: number;
  /** o endereço de cada página desta lista */
  href: (pagina: number) => string;
  agora: number;
}) {
  const [anuncio, lista, copiloto] = await Promise.all([
    obterAnuncio(vaga.id),
    talentosParaVaga(vaga.id).catch(() => null),
    copilotoLiberado(),
  ]);
  if (!anuncio || !lista) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os talentos agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const requisitos = { ...requisitosDaVaga(anuncio), perguntas: [] };
  const todos = lista
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
            estudos: t.estudos,
            titulo: t.titulo,
            habilidades: t.habilidades,
          },
          respostas: {},
          cidade: t.cidade,
          bairro: t.bairro,
        },
        agora,
      ),
    }))
    .sort((x, y) => (y.a.nota ?? -1) - (x.a.nota ?? -1));

  if (todos.length === 0) {
    return (
      <Vazio
        icone={UserSearch}
        titulo="Ninguém em Talentos para esta vaga ainda"
        acao={
          <BotaoLink href="/painel/links" tamanho="sm">
            <Link2 aria-hidden />
            Links para divulgar
          </BotaoLink>
        }
      >
        Aparece quem tem currículo e deixou as empresas acharem (quem já curtiu a vaga está nos candidatos). Enquanto
        isso, divulgue o link da vaga.
      </Vazio>
    );
  }

  const paginas = Math.min(Math.ceil(todos.length / TALENTOS_POR_PAGINA), MAX_PAGINAS_TALENTOS);
  const aqui = Math.min(pagina, paginas);
  const talentos = todos.slice((aqui - 1) * TALENTOS_POR_PAGINA, aqui * TALENTOS_POR_PAGINA);
  const hoje = new Date(agora).toISOString().slice(0, 7);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-h3">
          {plural(todos.length, "pessoa", "pessoas")} para “{vaga.titulo}”
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Quem mais combina com a vaga vem primeiro. Convide: a pessoa vê a vaga e, se curtir, chega na sua caixa de
          entrada.
        </p>
      </div>
      {copiloto && (
        <Link
          href={`/painel/anuncio/${vaga.id}/copiloto`}
          className="flex items-center gap-3 rounded-lg border border-terra/40 bg-terra-soft p-3 text-body-sm hover:border-terra"
        >
          <Sparkles aria-hidden className="size-5 shrink-0 text-terra-text" />
          <span className="min-w-0 flex-1">
            <b className="font-semibold">Copiloto:</b> a IA lê estes currículos contra os critérios da vaga e mostra o
            trecho que comprova. <SeloCortesia curto className="align-middle" />
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-terra-text" />
        </Link>
      )}
      <ul aria-label={`Talentos para ${vaga.titulo}`} className="flex flex-col gap-3">
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
      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
          {aqui > 1 ? (
            <BotaoLink href={href(aqui - 1)} tamanho="sm" variante="fantasma">
              <ChevronLeft aria-hidden />
              Anterior
            </BotaoLink>
          ) : (
            <span className="w-24" />
          )}
          <span className="text-body-sm text-ink-muted">
            Página {aqui} de {paginas}
          </span>
          {aqui < paginas ? (
            <BotaoLink href={href(aqui + 1)} tamanho="sm" variante="fantasma">
              Próxima
              <ChevronRight aria-hidden />
            </BotaoLink>
          ) : (
            <span className="w-24" />
          )}
        </nav>
      )}
      <p className="text-body-sm text-ink-muted">
        O telefone e o e-mail só aparecem se a pessoa curtir a vaga e você aceitar. Quem não quiser mais aparecer tira o
        currículo de Talentos quando quiser.
      </p>
    </div>
  );
}
