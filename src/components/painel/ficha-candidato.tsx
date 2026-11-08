import {
  CalendarClock,
  ChevronDown,
  FileText,
  KanbanSquare,
  Mail,
  MessagesSquare,
  Phone,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { marcaDeContato } from "@/lib/contato-candidato";
import type { EmpresasDosTrabalhos } from "@/lib/servidor/empresas";
import { DesfazerMatch } from "@/components/desfazer-match";
import { SeloVerificado } from "@/components/selo-verificado";
import { Avatar, Selo } from "@/components/ui/basicos";
import { esperaResposta } from "@/lib/constantes";
import { caminhoConversa } from "@/lib/conversas";
import { formatarLugar, formatarTelefone, linkWhatsApp, tempoRelativo } from "@/lib/formato";
import { textoDoQueFez } from "@/lib/regras";
import { fraseDaEntrevista } from "@/lib/whatsapp";
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import { textosDosEstudos } from "@/lib/estudos";
import { textoDoPeriodo } from "@/lib/experiencia";
import { quandoDaEntrevista } from "@/lib/recrutamento";
import type { ItemCaixa } from "@/lib/servidor/caixa";
import type { Curriculo } from "@/lib/tipos";
import { AcoesInteressado } from "./acoes";
import { Conversa } from "@/components/conversa/conversa";
import type { MensagemConversa } from "@/lib/dados";
import { lerPerguntaDaMensagem, type PerguntaNaMensagem } from "@/lib/perguntas-do-match";
import { DesfazerRegra } from "../automacoes/desfazer-regra";
import { DocumentosNaFicha } from "../proposta/documentos-na-ficha";
import { PropostaNaFicha } from "../proposta/proposta-na-ficha";
import { VideoNaFicha } from "../video/video-na-ficha";
import {
  BotaoAtalhos,
  ControlesDaFicha,
  NavegarFichas,
  EntrevistaDaFicha,
  ResumoDaIA,
  type EstadoFicha,
  type ExtrasDaFicha,
} from "./controles-ficha";
import { EtapaDoCandidato } from "./etapa-candidato";
import { JanelaDoCurriculo } from "./janela-curriculo";
import { DetalheDaAderencia, linhaDaAderencia, NotaAderencia } from "./nota-aderencia";

// A ficha do candidato na caixa de entrada: quem é, a decisão com atalhos, e embaixo
// tudo o que ajuda a decidir e a seguir (recado, entrevista, currículo, respostas, o
// porquê da nota, contato e a etapa com a anotação). Para a ficha não esticar, o
// formulário da entrevista e o porquê da nota começam fechados, e o currículo vem em
// poucas linhas, com o inteiro numa janela ("Ver currículo completo").

const SITUACAO: Record<EstadoFicha, { nome: string; variante: "aviso" | "match" | "contorno" | "neutro" }> = {
  responder: { nome: "Espera você", variante: "aviso" },
  aceita: { nome: "Esperando currículo", variante: "neutro" },
  match: { nome: "Aceito", variante: "match" },
  dispensada: { nome: "Dispensado", variante: "contorno" },
  desfeito: { nome: "Desfez o aceite", variante: "contorno" },
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
/** As respostas às perguntas que o chat fez no match, para ler de relance (a conversa inteira vem logo abaixo). */
function RespostasDoChat({ mensagens, anuncioId }: { mensagens: MensagemConversa[]; anuncioId: string }) {
  const perguntas = mensagens
    .filter((m) => m.automatica && m.anuncio_id === anuncioId)
    .map((m) => lerPerguntaDaMensagem(m.pergunta))
    .filter((p): p is PerguntaNaMensagem => p !== null);
  if (!perguntas.length) return null;
  return (
    <Secao titulo="Respostas no chat">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body-sm">
        {perguntas.map((p) => (
          <Fragment key={p.chave}>
            <dt className="text-ink-muted">{p.rotulo}</dt>
            <dd>
              {p.resposta === null ? <span className="text-ink-muted">Sem resposta ainda</span> : p.opcoes[p.resposta]}
            </dd>
          </Fragment>
        ))}
      </dl>
    </Secao>
  );
}

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
  base = "/painel/caixa",
  extras = null,
  conversa: conversaDaFicha = null,
  euId = null,
}: {
  c: ItemCaixa;
  /** o próximo passo (as folhas de Chamar e de Contratado); sem eles, só Aceitar e Dispensar */
  extras?: ExtrasDaFicha | null;
  /** a conversa com a pessoa (depois do aceite), para escrever ali mesmo */
  conversa?: { conversaId: string; mensagens: MensagemConversa[]; verLida?: boolean } | null;
  euId?: string | null;
  /** a página da mesa (Candidatos ou a vaga): o "Desfazer" volta para ela */
  base?: string;
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
  // aceito e na etapa Contratados: o selo diz Contratado
  const situacao =
    estado === "match" && extras?.aba === "contratados"
      ? { nome: "Contratado", variante: "match" as const }
      : estado === "match" && extras?.aba === "nao_seguiu"
        ? { nome: "Não seguiu", variante: "contorno" as const }
        : SITUACAO[estado];
  const primeiro = c.nome.split(" ")[0];
  const match = estado === "match";
  const encerrado = estado === "dispensada" || estado === "desfeito";
  const conversa = match ? caminhoConversa(c.perfil_id) : null;
  const conversaNaFicha = Boolean(match && conversaDaFicha && euId);
  // com o WhatsApp na linha de ações e a conversa aqui embaixo, as mensagens novas avisam no alto
  const avisarMensagens = conversaNaFicha && Boolean(c.whatsapp) && (c.naoLidas ?? 0) > 0;
  const hoje = new Date(agora).toISOString().slice(0, 7);

  return (
    <article
      aria-label={`Ficha de ${c.nome}`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-6"
    >
      {/* o anterior e o próximo ficam ao lado do nome; o que vem embaixo dele usa a largura toda */}
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 sm:gap-x-4">
        <div className="row-span-3">
          <Avatar nome={c.nome} foto={c.foto} tamanho={56} />
        </div>
        <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 self-center font-display text-h3 sm:text-h2">
          <Link href={`/perfil/${c.perfil_id}`} className="break-words underline-offset-4 hover:underline">
            {c.nome}
          </Link>
          {c.verificado && <SeloVerificado />}
        </h2>
        <NavegarFichas anterior={anterior} proximo={proximo} />
        <p className="col-span-2 col-start-2 mt-0.5 text-body-sm text-ink-muted">
          <Link
            href={`/painel/anuncio/${c.anuncio_id}/quadro?candidato=${c.perfil_id}`}
            className="text-ink underline underline-offset-2"
          >
            {c.anuncio_titulo}
          </Link>
          {" · "}
          {formatarLugar(c.bairro, c.cidade)} · curtiu {tempoRelativo(c.curtido_em, agora)}
        </p>
        <p className="col-span-2 col-start-2 mt-2 flex flex-wrap items-center gap-2">
          {c.aderencia && !encerrado && <NotaAderencia a={c.aderencia} longo />}
          <Selo variante={situacao.variante}>{situacao.nome}</Selo>
          {avisarMensagens && (
            <a
              href="#conversa"
              className="inline-flex items-center gap-1.5 rounded-pill bg-like-soft px-2.5 py-0.5 text-body-sm font-semibold text-like-text underline-offset-2 hover:underline"
            >
              <MessagesSquare aria-hidden className="size-4" />
              {c.naoLidas === 1 ? "1 mensagem nova" : `${c.naoLidas} mensagens novas`}
            </a>
          )}
          {c.entrevista && (
            <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold">
              <CalendarClock aria-hidden className="size-4 text-ink-muted" />
              Entrevista {quandoDaEntrevista(c.entrevista)}
            </span>
          )}
        </p>
      </header>

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
          base={base}
          extras={extras}
          contato={
            match
              ? {
                  whatsapp: c.whatsapp
                    ? linkWhatsApp(
                        c.whatsapp,
                        // o link: a curtida aceita (para a pessoa) ou, no contato direto, a vaga
                        mensagemComLink(
                          // com entrevista marcada, o WhatsApp já leva o dia, a hora e o lugar
                          c.entrevista
                            ? `Olá, ${primeiro}! Sobre a vaga de ${c.anuncio_titulo}: sua entrevista ficou para ${fraseDaEntrevista(c.entrevista)}. Pode confirmar por aqui?`
                            : `Olá, ${primeiro}! Vi que você curtiu “${c.anuncio_titulo}” no Publike. Vamos conversar?`,
                          linkDoMatch({ anuncioId: c.anuncio_id, perfilId: c.perfil_id, para: "quem_curtiu", direto }),
                        ),
                      )
                    : null,
                  naoLidas: c.naoLidas ?? 0,
                  conversaNaFicha: conversaNaFicha,
                }
              : null
          }
        />
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

      {match && (!extras || c.entrevista) && (
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

      {match && conversaDaFicha && euId && (
        <RespostasDoChat mensagens={conversaDaFicha.mensagens} anuncioId={c.anuncio_id} />
      )}

      {match && conversaDaFicha && euId && (
        <Secao titulo={`Conversa com ${primeiro}`} id="conversa">
          <div className="flex h-96 flex-col overflow-hidden rounded-md border border-line">
            <Conversa
              outroId={c.perfil_id}
              conversaId={conversaDaFicha.conversaId}
              euId={euId}
              outroNome={c.nome}
              iniciais={conversaDaFicha.mensagens}
              compacto
              verLida={conversaDaFicha.verLida}
            />
          </div>
        </Secao>
      )}

      {extras?.video.atual && (
        <Secao titulo="Entrevista em vídeo">
          <VideoNaFicha
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            nome={c.nome}
            video={extras.video.atual}
            liberado={extras.video.liberado}
            agora={agora}
          />
        </Secao>
      )}

      {extras?.proposta && extras.aba !== "contratados" && (
        <Secao titulo="Proposta">
          <PropostaNaFicha
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            nome={c.nome}
            endereco={c.endereco}
            proposta={extras.proposta}
          />
        </Secao>
      )}

      {/* em Contratados, a proposta sai da ficha; os documentos da admissão ficam (migração 20270312120000) */}
      {extras?.aba === "contratados" && extras.proposta?.situacao === "aceita" && extras.proposta.docs && (
        <Secao titulo="Documentos da admissão">
          <DocumentosNaFicha
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            nome={c.nome.split(" ")[0]}
            docs={extras.proposta.docs}
          />
        </Secao>
      )}

      {extras?.regras && extras.regras.length > 0 && (
        <Secao titulo="O que as suas regras fizeram">
          <ul className="flex flex-col gap-2">
            {extras.regras.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 text-body-sm">
                <p className="min-w-0">
                  <span className="text-label">“{f.regra}”</span>: {primeiro} {textoDoQueFez(f.feitas)}
                  <span className="text-ink-muted">
                    {" "}
                    · {tempoRelativo(f.feito_em, extras.agora)}
                    {f.desfeito_em ? " · desfeito" : ""}
                  </span>
                </p>
                {!f.desfeito_em && <DesfazerRegra feita={f.id} nome={primeiro} />}
              </li>
            ))}
          </ul>
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
                {...marcaDeContato(c.anuncio_id, c.perfil_id, "telefone")}
              >
                <Phone aria-hidden className="size-4 text-ink-muted" />
                {formatarTelefone(c.whatsapp)}
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="inline-flex min-h-10 items-center gap-1.5 break-all underline-offset-2 hover:underline"
                {...marcaDeContato(c.anuncio_id, c.perfil_id, "email")}
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
        {conectar}
        <BotaoAtalhos extras={Boolean(extras)} />
      </div>
    </article>
  );
}
