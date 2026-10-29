import {
  CalendarClock,
  ChevronDown,
  FileText,
  KanbanSquare,
  Mail,
  MessageCircle,
  Phone,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BotaoConversar } from "@/components/botao-conversar";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import type { EmpresasDosTrabalhos } from "@/lib/servidor/empresas";
import { DesfazerMatch } from "@/components/desfazer-match";
import { SeloVerificado } from "@/components/selo-verificado";
import { Avatar, Selo } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { esperaResposta } from "@/lib/constantes";
import { caminhoConversa } from "@/lib/conversas";
import { formatarLugar, formatarTelefone, linkWhatsApp, tempoRelativo } from "@/lib/formato";
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import { textosDosEstudos } from "@/lib/estudos";
import { textoDoPeriodo } from "@/lib/experiencia";
import { dataDaEntrevista } from "@/lib/recrutamento";
import type { ItemCaixa } from "@/lib/servidor/caixa";
import type { Curriculo } from "@/lib/tipos";
import { AcoesInteressado } from "./acoes";
import { ControlesDaFicha, EntrevistaDaFicha, ResumoDaIA, type EstadoFicha } from "./controles-ficha";
import { EtapaDoCandidato } from "./etapa-candidato";
import { JanelaDoCurriculo } from "./janela-curriculo";
import { DetalheDaAderencia, linhaDaAderencia, NotaAderencia } from "./nota-aderencia";

// A ficha do candidato na caixa de entrada: quem é, a decisão com atalhos, e embaixo
// tudo o que ajuda a decidir e a seguir (recado, entrevista, currículo, respostas, o
// porquê da nota, contato e a etapa com a anotação). Para a ficha não esticar, o
// formulário da entrevista e o porquê da nota começam fechados, e o currículo vem em
// poucas linhas, com o inteiro numa janela ("Ver currículo completo").

const SITUACAO: Record<EstadoFicha, { nome: string; variante: "aviso" | "match" | "contorno" | "neutro" }> = {
  responder: { nome: "Para responder", variante: "aviso" },
  aceita: { nome: "Esperando currículo", variante: "neutro" },
  match: { nome: "Deu match", variante: "match" },
  dispensada: { nome: "Dispensado", variante: "contorno" },
  desfeito: { nome: "Match desfeito", variante: "contorno" },
  moderacao: { nome: "Vaga na moderação", variante: "contorno" },
};

function estadoDe(c: ItemCaixa): EstadoFicha {
  if (c.anuncio_status === "em_analise" || c.anuncio_status === "removido") return "moderacao";
  if (c.status === "match") return "match";
  if (c.aceita) return "aceita";
  if (esperaResposta(c)) return "responder";
  return c.status === "desfeito" ? "desfeito" : "dispensada";
}

function Secao({ titulo, id, children }: { titulo: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={titulo} className="flex scroll-mt-24 flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-label">{titulo}</h3>
      {children}
    </section>
  );
}

/** O currículo em poucas linhas, para decidir; o inteiro abre na janela ("Ver currículo completo"). */
function ResumoDoCurriculo({ curriculo }: { curriculo: Curriculo }) {
  const ultimo = curriculo.experiencias[0];
  const outros = curriculo.experiencias.length - 1;
  const habilidades = curriculo.habilidades ?? [];
  const linhas: [string, string][] = [];
  if (curriculo.titulo) linhas.push(["O que faz", curriculo.titulo]);
  const estudo = textosDosEstudos(curriculo)[0];
  if (estudo) linhas.push(["Estudos", estudo]);
  linhas.push([
    "Último trabalho",
    ultimo
      ? [
          [ultimo.cargo, ultimo.onde].filter(Boolean).join(" · "),
          textoDoPeriodo(ultimo),
          outros > 0 ? `e mais ${outros} ${outros === 1 ? "trabalho" : "trabalhos"}` : "",
        ]
          .filter(Boolean)
          .join(", ")
      : "Primeiro emprego",
  ]);
  if (habilidades.length)
    linhas.push([
      "Habilidades",
      habilidades.slice(0, 5).join(", ") + (habilidades.length > 5 ? ` e mais ${habilidades.length - 5}` : ""),
    ]);
  return (
    <dl className="grid gap-x-4 gap-y-1 text-body-sm sm:grid-cols-[auto_1fr]">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="text-ink-muted">{rotulo}</dt>
          <dd className="mb-1 sm:mb-0">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Uma seção que começa fechada (o porquê da nota): o título e a conta numa linha; tocar abre o resto. */
function SecaoFechada({ titulo, linha, children }: { titulo: string; linha: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="text-label">{titulo}</span>
          <span className="text-body-sm text-ink-muted"> · {linha}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pt-1 pb-1">{children}</div>
    </details>
  );
}

export function FichaCandidato({
  c,
  agora,
  anterior,
  proximo,
  depois,
  comIA = false,
  conectar = null,
  direto = false,
  empresas,
}: {
  c: ItemCaixa;
  /** as empresas do currículo com conta no Publike (o logo e o link) */
  empresas?: EmpresasDosTrabalhos;
  /** a vaga tem contato direto: o match saiu na hora, sem aceite (a mensagem leva o link da vaga) */
  direto?: boolean;
  /** o botão Conectar com a pessoa (conexão sem vaga, que fica depois da vaga acabar) */
  conectar?: ReactNode;
  /** a ajuda da IA está ligada (resumo do currículo) */
  comIA?: boolean;
  agora: number;
  anterior: string | null;
  proximo: string | null;
  depois: string;
}) {
  const estado = estadoDe(c);
  const situacao = SITUACAO[estado];
  const primeiro = c.nome.split(" ")[0];
  const match = estado === "match";
  const encerrado = estado === "dispensada" || estado === "desfeito";
  const conversa = match ? caminhoConversa(c.perfil_id) : null;
  const hoje = new Date(agora).toISOString().slice(0, 7);

  return (
    <article
      aria-label={`Ficha de ${c.nome}`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-6"
    >
      <header className="flex gap-3 sm:gap-4">
        <Avatar nome={c.nome} foto={c.foto} tamanho={56} />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-h3 sm:text-h2">
            <Link href={`/perfil/${c.perfil_id}`} className="break-words underline-offset-4 hover:underline">
              {c.nome}
            </Link>
            {c.verificado && <SeloVerificado />}
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-muted">
            <Link
              href={`/painel/anuncio/${c.anuncio_id}/quadro?candidato=${c.perfil_id}`}
              className="text-ink underline underline-offset-2"
            >
              {c.anuncio_titulo}
            </Link>
            {" · "}
            {formatarLugar(c.bairro, c.cidade)} · curtiu {tempoRelativo(c.curtido_em, agora)}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {c.aderencia && !encerrado && <NotaAderencia a={c.aderencia} longo />}
            <Selo variante={situacao.variante}>{situacao.nome}</Selo>
            {c.entrevista && (
              <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold">
                <CalendarClock aria-hidden className="size-4 text-ink-muted" />
                Entrevista {dataDaEntrevista(c.entrevista.quando)}
              </span>
            )}
          </p>
        </div>
      </header>
      {/* o Conectar fica com os outros botões (no match, junto do Conversar), e o nome tem a largura toda */}
      {conectar && !match && <div>{conectar}</div>}

      {estado === "moderacao" ? (
        <p className="flex items-start gap-2 rounded-md bg-surface-300 px-3 py-2 text-body-sm text-ink-muted">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Esta vaga está com a moderação: dá para responder depois que ela for liberada.
        </p>
      ) : (
        <ControlesDaFicha
          anuncioId={c.anuncio_id}
          perfilId={c.perfil_id}
          nome={c.nome}
          estado={estado}
          semCurriculo={c.semCurriculo}
          anterior={anterior}
          proximo={proximo}
          depois={depois}
          conversa={conversa}
        />
      )}

      {match && (
        <div className="flex flex-wrap items-center gap-2">
          <BotaoConversar outroId={c.perfil_id} naoLidas={c.naoLidas} />
          {c.whatsapp && (
            <a
              href={linkWhatsApp(
                c.whatsapp,
                // o link: a curtida aceita (para a pessoa) ou, no contato direto, a vaga
                mensagemComLink(
                  `Olá, ${primeiro}! Vi que você curtiu “${c.anuncio_titulo}” no Publike. Vamos conversar?`,
                  linkDoMatch({ anuncioId: c.anuncio_id, perfilId: c.perfil_id, para: "quem_curtiu", direto }),
                ),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={classesBotao("sucesso", "sm")}
            >
              <MessageCircle aria-hidden />
              WhatsApp
            </a>
          )}
          {conectar}
        </div>
      )}
      {estado === "aceita" && (
        <AcoesInteressado
          anuncioId={c.anuncio_id}
          perfilId={c.perfil_id}
          status={c.status}
          semCurriculo={c.semCurriculo ?? primeiro}
          aceita
          compacto
        />
      )}

      {c.mensagem && (
        <Secao titulo={`Recado de ${primeiro}`}>
          <p className="rounded-md bg-surface-300 px-3 py-2 text-body">“{c.mensagem}”</p>
        </Secao>
      )}

      {match && (
        <Secao titulo="Entrevista" id="entrevista">
          <EntrevistaDaFicha
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            nome={c.nome}
            vaga={c.anuncio_titulo}
            entrevista={c.entrevista}
            endereco={c.endereco}
          />
        </Secao>
      )}

      {c.curriculo && (comIA || c.resumo) && (
        <Secao titulo="Resumo da IA">
          <ResumoDaIA anuncioId={c.anuncio_id} perfilId={c.perfil_id} inicial={c.resumo} />
        </Secao>
      )}

      <Secao titulo="Currículo">
        {c.curriculo ? (
          <div className="flex flex-col gap-3">
            <ResumoDoCurriculo curriculo={c.curriculo} />
            <JanelaDoCurriculo nome={primeiro}>
              <CurriculoResumo curriculo={c.curriculo} linkPdf={c.curriculo.link_pdf} hoje={hoje} empresas={empresas} />
            </JanelaDoCurriculo>
          </div>
        ) : c.curriculoFalhou ? (
          <p className="text-body-sm text-ink-muted">
            Não deu para abrir o currículo agora. Tente de novo em instantes.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-body-sm text-ink-muted">
            <FileText aria-hidden className="mt-0.5 size-4 shrink-0" />
            {primeiro} ainda não mandou currículo{c.pedeCurriculo ? ", que esta vaga pede." : "."}
          </p>
        )}
      </Secao>

      {c.respostas.length > 0 && (
        <Secao titulo="Respostas às perguntas da vaga">
          <dl className="flex flex-col gap-2 text-body-sm">
            {c.respostas.map((r) => (
              <div key={r.pergunta}>
                <dt className="text-ink-muted">{r.pergunta}</dt>
                <dd className={r.resposta ? "font-semibold" : "text-ink-muted italic"}>
                  {r.resposta || "Não respondeu"}
                </dd>
              </div>
            ))}
          </dl>
        </Secao>
      )}

      {c.aderencia && (
        <SecaoFechada
          titulo={
            c.aderencia.eliminado
              ? "Aderência à vaga: eliminado"
              : c.aderencia.nota !== null
                ? `Aderência à vaga: ${c.aderencia.nota}%`
                : "Aderência à vaga"
          }
          linha={linhaDaAderencia(c.aderencia)}
        >
          <DetalheDaAderencia a={c.aderencia} editarVaga={`/painel/anuncio/${c.anuncio_id}/editar`} />
        </SecaoFechada>
      )}

      {match && (c.whatsapp || c.email) && (
        <Secao titulo="Contato">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-body-sm">
            {c.whatsapp && (
              <a
                href={`tel:+${c.whatsapp}`}
                className="inline-flex min-h-10 items-center gap-1.5 underline-offset-2 hover:underline"
              >
                <Phone aria-hidden className="size-4 text-ink-muted" />
                {formatarTelefone(c.whatsapp)}
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="inline-flex min-h-10 items-center gap-1.5 break-all underline-offset-2 hover:underline"
              >
                <Mail aria-hidden className="size-4 shrink-0 text-ink-muted" />
                {c.email}
              </a>
            )}
          </div>
        </Secao>
      )}

      {!encerrado && estado !== "moderacao" && (
        <Secao titulo="Etapa e anotação">
          <EtapaDoCandidato
            tipo="vaga"
            status={c.status}
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            etapa={c.etapa}
            nota={c.nota}
          />
        </Secao>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
        <Link
          href={`/painel/anuncio/${c.anuncio_id}/quadro?candidato=${c.perfil_id}`}
          className="inline-flex min-h-10 items-center gap-1.5 text-label underline-offset-2 hover:underline"
        >
          <KanbanSquare aria-hidden className="size-4 text-ink-muted" />
          Abrir no quadro da vaga
        </Link>
        {match && <DesfazerMatch anuncioId={c.anuncio_id} perfilId={c.perfil_id} outroNome={c.nome} autorDaVaga />}
      </div>
    </article>
  );
}
