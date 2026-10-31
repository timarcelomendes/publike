"use client";

import {
  CalendarClock,
  ClipboardCheck,
  ExternalLink,
  GripVertical,
  MessageCircle,
  MessagesSquare,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type DragEvent,
  type ReactNode,
} from "react";
import { chamarAcao } from "@/lib/acao-segura";
import type { Aderencia } from "@/lib/aderencia";
import { adicionarFinalistas, tirarFinalista } from "@/lib/acoes/finalistas";
import type { Colocacao } from "@/lib/colocacoes";
import { SITE_URL } from "@/lib/config";
import { moverCandidatos } from "@/lib/acoes/recrutamento";
import { ETAPAS_CANDIDATO, type EtapaCandidato } from "@/lib/constantes";
import { caminhoConversa } from "@/lib/conversas";
import { DECISOES_CLIENTE, type RespostaCliente } from "@/lib/finalistas";
import { formatarLugar, linkWhatsApp, tempoRelativo } from "@/lib/formato";
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import { COLUNAS_QUADRO, dataDaEntrevista, SITUACOES_ENTREVISTA, type ModeloMensagem } from "@/lib/recrutamento";
import { NOME_FAIXA, type FaixaDoTeste } from "@/lib/testes";
import type { TriagemNoCartao } from "@/lib/servidor/copiloto";
import { CaminhoDoAceite } from "../caminho-curtida";
import { FormColocacao, SeloDaColocacao } from "./colocacao";
import { DetalheDaAderencia, NotaAderencia } from "./nota-aderencia";
import { Avatar, Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { CompositorMensagem, EntrevistaMarcada, FormEntrevista } from "./recrutamento";

// Quadro de candidatos de uma vaga (como um Kanban): uma coluna por etapa, os mais
// aderentes em cima. Arraste o cartão para outra coluna (ou use "Mover para"), marque
// vários para mover ou mandar mensagem de uma vez, e abra o cartão para ver a nota,
// as respostas, marcar entrevista e conversar.

export type CartaoQuadro = {
  perfil_id: string;
  nome: string;
  foto: string | null;
  cidade: string;
  bairro: string | null;
  status: string;
  curtido_em: string;
  mensagem: string | null;
  whatsapp: string | null;
  email: string | null;
  coluna: EtapaCandidato;
  anotacao: string | null;
  aderencia: Aderencia;
  respostas: { pergunta: string; resposta: string }[];
  entrevista: {
    id: string;
    quando: string;
    formato: string;
    local: string | null;
    obs: string | null;
    situacao: string;
  } | null;
  temCurriculo: boolean;
  /** a vaga pede currículo e a pessoa ainda não mandou */
  semCurriculo: boolean;
  /** você aceitou e a vaga espera o currículo para dar match */
  aceita: boolean;
  /** está nos finalistas para o cliente (com a resposta dele) */
  finalista: RespostaCliente | null;
  /** agência: a colocação de quem foi contratado (o começo, a taxa e a garantia) */
  colocacao: Colocacao | null;
  /** "Ordenar pelo Copiloto": a posição no ranking da vaga (só quando a vaga já foi lida) */
  copiloto?: number | null;
  /** o Teste Prático: o resultado numa palavra de cada teste feito (migração 20261225120000) */
  testes?: { titulo: string; faixa: FaixaDoTeste }[];
  /** a Triagem com IA já leu o currículo com os critérios de agora (migração 20261227120000) */
  triagem?: TriagemNoCartao | null;
};

const COR_FAIXA: Record<FaixaDoTeste, string> = {
  acima: "text-cerrado-text",
  dentro: "text-ink",
  abaixo: "text-ink-muted",
};

export function QuadroCandidatos({
  anuncioId,
  vaga,
  empresa,
  endereco,
  cartoes,
  modelos,
  agora,
  abrir = null,
  agencia = false,
  contatoDireto = false,
}: {
  anuncioId: string;
  vaga: string;
  empresa: string;
  endereco: string;
  cartoes: CartaoQuadro[];
  modelos: ModeloMensagem[];
  agora: number;
  /** a vaga tem contato direto: o match sai na hora, sem aceite (a mensagem leva o link da vaga) */
  contatoDireto?: boolean;
  /** abre já o cartão desta pessoa (vindo de “Abrir no quadro”, na tela Candidatos) */
  abrir?: string | null;
  /** agência: mandar os finalistas ao cliente */
  agencia?: boolean;
}) {
  const [lista, mover] = useOptimistic(cartoes, (atual, m: { ids: string[]; coluna: EtapaCandidato }) =>
    atual.map((c) => (m.ids.includes(c.perfil_id) ? { ...c, coluna: m.coluna } : c)),
  );
  const [pendente, iniciar] = useTransition();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [aberto, setAberto] = useState<string | null>(() =>
    abrir && cartoes.some((c) => c.perfil_id === abrir) ? abrir : null,
  );
  const [mensagemEmMassa, setMensagemEmMassa] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [esconderEliminados, setEsconderEliminados] = useState(false);
  const [sobre, setSobre] = useState<EtapaCandidato | null>(null);

  const visiveis = esconderEliminados ? lista.filter((c) => !c.aderencia.eliminado) : lista;
  const eliminados = lista.filter((c) => c.aderencia.eliminado).length;
  const atual = lista.find((c) => c.perfil_id === aberto) ?? null;

  function moverPara(ids: string[], coluna: EtapaCandidato) {
    const mudam = ids.filter((id) => lista.find((c) => c.perfil_id === id)?.coluna !== coluna);
    if (!mudam.length) return;
    setAviso(null);
    iniciar(async () => {
      mover({ ids: mudam, coluna });
      // sem chegar ao servidor, os cartões voltam para a coluna de antes e o aviso aparece
      const r = await chamarAcao(() => moverCandidatos(anuncioId, mudam, coluna));
      if (!r.ok) setAviso({ ok: false, texto: r.erro });
      else {
        const falhas = r.falhas.map((f) => `${f.perfil}: ${f.erro}`).join(" ");
        setAviso({ ok: !r.falhas.length, texto: [r.mensagem, falhas].filter(Boolean).join(" ") });
        setSelecionados((s) => s.filter((id) => !mudam.includes(id)));
      }
    });
  }

  function enviarAoCliente(ids: string[]) {
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => adicionarFinalistas(anuncioId, ids));
      setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
      if (r.ok) setSelecionados([]);
    });
  }

  function soltar(e: DragEvent, coluna: EtapaCandidato) {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    // arrastou um dos marcados: leva todos os marcados
    moverPara(selecionados.includes(id) ? selecionados : [id], coluna);
  }

  const alternar = (id: string) => setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const perfisSelecionados = lista
    .filter((c) => selecionados.includes(c.perfil_id))
    .map((c) => ({ id: c.perfil_id, nome: c.nome, match: c.status === "match" }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DicaDoQuadro />
        {eliminados > 0 && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-label">
            <input
              type="checkbox"
              checked={esconderEliminados}
              onChange={(e) => setEsconderEliminados(e.target.checked)}
              className="size-5 accent-[var(--pk-ink)]"
            />
            Esconder eliminados ({eliminados})
          </label>
        )}
      </div>
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}

      {/* no celular as colunas rolam de lado, uma de cada vez */}
      <div
        aria-busy={pendente}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
      >
        {COLUNAS_QUADRO.map((col) => {
          const daColuna = visiveis.filter((c) => c.coluna === col.etapa);
          return (
            <section
              key={col.etapa}
              aria-label={`${col.nome}: ${daColuna.length}`}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.etapa);
              }}
              onDragLeave={() => setSobre((s) => (s === col.etapa ? null : s))}
              onDrop={(e) => soltar(e, col.etapa)}
              className={`flex w-[82vw] max-w-80 shrink-0 snap-start flex-col gap-2 rounded-lg border p-2.5 transition-colors sm:w-64 xl:w-auto xl:min-w-[12rem] xl:flex-1 ${
                sobre === col.etapa ? "border-ink bg-surface-300" : "border-line bg-surface-100"
              }`}
            >
              <header className="flex items-baseline justify-between gap-2 px-1 pt-1">
                <h3 className="text-label">{col.nome}</h3>
                <span className="text-body-sm text-ink-muted tabular-nums">{daColuna.length}</span>
              </header>
              <p className="px-1 text-caption text-ink-muted">{col.ajuda}</p>
              <ul className="flex min-h-24 flex-col gap-2">
                {daColuna.map((c) => (
                  <li key={c.perfil_id}>
                    <Cartao
                      c={c}
                      agora={agora}
                      marcado={selecionados.includes(c.perfil_id)}
                      alternar={() => alternar(c.perfil_id)}
                      abrir={() => setAberto(c.perfil_id)}
                      moverPara={(coluna) => moverPara([c.perfil_id], coluna)}
                    />
                  </li>
                ))}
                {daColuna.length === 0 && (
                  <li className="rounded-md border border-dashed border-line px-3 py-6 text-center text-body-sm text-ink-muted">
                    Ninguém aqui
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {selecionados.length > 0 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-raised md:bottom-4">
          <span className="text-label">
            {selecionados.length} {selecionados.length === 1 ? "selecionado" : "selecionados"}
          </span>
          <Seletor
            aria-label="Mover os selecionados para"
            value=""
            onChange={(e) => e.target.value && moverPara(selecionados, e.target.value as EtapaCandidato)}
            className={`${classesEntrada} min-h-10 py-1 text-body-sm`}
            envoltorio="w-48"
          >
            <option value="">Mover para…</option>
            {COLUNAS_QUADRO.map((col) => (
              <option key={col.etapa} value={col.etapa}>
                {col.nome}
              </option>
            ))}
          </Seletor>
          <Botao tamanho="sm" onClick={() => setMensagemEmMassa(true)}>
            <Send aria-hidden />
            Mandar mensagem
          </Botao>
          {agencia && (
            <Botao tamanho="sm" disabled={pendente} onClick={() => enviarAoCliente(selecionados)}>
              <ClipboardCheck aria-hidden />
              Enviar ao cliente
            </Botao>
          )}
          <Botao tamanho="sm" variante="fantasma" onClick={() => setSelecionados([])}>
            Limpar
          </Botao>
        </div>
      )}

      <Gaveta aberta={mensagemEmMassa} fechar={() => setMensagemEmMassa(false)} titulo="Mensagem para os selecionados">
        <CompositorMensagem
          anuncioId={anuncioId}
          perfis={perfisSelecionados}
          vaga={vaga}
          empresa={empresa}
          modelos={modelos}
          aoTerminar={() => {
            setMensagemEmMassa(false);
            setSelecionados([]);
            setAviso({ ok: true, texto: "Mensagem enviada." });
          }}
        />
      </Gaveta>

      <Gaveta aberta={atual !== null} fechar={() => setAberto(null)} titulo={atual?.nome ?? ""}>
        {atual && (
          <DetalheCandidato
            key={atual.perfil_id}
            c={atual}
            anuncioId={anuncioId}
            vaga={vaga}
            empresa={empresa}
            endereco={endereco}
            modelos={modelos}
            agora={agora}
            moverPara={(coluna) => moverPara([atual.perfil_id], coluna)}
            agencia={agencia}
            enviarAoCliente={() => enviarAoCliente([atual.perfil_id])}
            pendente={pendente}
            direto={contatoDireto}
          />
        )}
      </Gaveta>
    </div>
  );
}

function Cartao({
  c,
  agora,
  marcado,
  alternar,
  abrir,
  moverPara,
}: {
  c: CartaoQuadro;
  agora: number;
  marcado: boolean;
  alternar: () => void;
  abrir: () => void;
  moverPara: (coluna: EtapaCandidato) => void;
}) {
  const e = c.entrevista;
  const entrevistaAberta = e && ["marcada", "confirmada", "remarcar"].includes(e.situacao);
  return (
    <article
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/plain", c.perfil_id);
        ev.dataTransfer.effectAllowed = "move";
      }}
      className={`group flex flex-col gap-2 rounded-md border bg-surface-200 p-2.5 shadow-card ${
        marcado ? "border-ink ring-1 ring-ink" : "border-line"
      } ${c.aderencia.eliminado ? "opacity-75" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <input
          type="checkbox"
          checked={marcado}
          onChange={alternar}
          aria-label={`Selecionar ${c.nome}`}
          className="size-5 shrink-0 accent-[var(--pk-ink)]"
        />
        <span className="flex items-center gap-1">
          <NotaAderencia a={c.aderencia} />
          <GripVertical aria-hidden className="hidden size-4 shrink-0 cursor-grab text-ink-muted sm:block" />
        </span>
      </div>
      <div className="flex items-start gap-2">
        <Avatar nome={c.nome} foto={c.foto} tamanho={32} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={abrir}
            className="line-clamp-2 block w-full text-left text-label break-words underline-offset-2 hover:underline"
          >
            {c.nome}
          </button>
          <p className="text-caption text-ink-muted">
            {formatarLugar(c.bairro, c.cidade)} · {tempoRelativo(c.curtido_em, agora)}
          </p>
          {c.copiloto != null && (
            <p className="mt-0.5 flex items-center gap-1 text-caption font-semibold text-terra-text">
              <Sparkles aria-hidden className="size-3.5" />
              {c.copiloto}º na triagem
            </p>
          )}
          {c.triagem && (
            <p
              className={`mt-0.5 flex items-center gap-1 text-caption font-semibold ${
                c.triagem.obrigatoriosOk ? "text-cerrado-text" : c.triagem.grupo === 2 ? "text-ink-muted" : "text-ink"
              }`}
            >
              <Sparkles aria-hidden className="size-3.5" />
              {c.triagem.obrigatoriosOk
                ? "Triagem: atende os obrigatórios"
                : `Triagem: atende ${c.triagem.atende} de ${c.triagem.total}`}
            </p>
          )}
          {(c.testes ?? []).map((t, _, todos) => (
            <p
              key={t.titulo}
              className={`mt-0.5 flex items-center gap-1 text-caption font-semibold ${COR_FAIXA[t.faixa]}`}
            >
              <ClipboardCheck aria-hidden className="size-3.5" />
              {todos.length === 1 ? "Teste" : t.titulo}: {NOME_FAIXA[t.faixa].toLowerCase()}
            </p>
          ))}
        </div>
      </div>
      {(c.status === "pendente" || entrevistaAberta || c.status === "desfeito" || c.finalista || c.colocacao) && (
        <div className="flex flex-wrap gap-1.5">
          {c.status === "pendente" &&
            (c.aceita ? <Selo>Esperando currículo</Selo> : <Selo variante="aviso">Espera você</Selo>)}
          {c.status === "desfeito" && <Selo variante="contorno">Match desfeito</Selo>}
          {entrevistaAberta && e && (
            <Selo variante={SITUACOES_ENTREVISTA[e.situacao]?.tom ?? "aviso"}>
              <CalendarClock aria-hidden />
              {dataDaEntrevista(e.quando)}
            </Selo>
          )}
          {c.finalista && <SeloDoCliente r={c.finalista} />}
          {c.colocacao && <SeloDaColocacao c={c.colocacao} agora={agora} />}
        </div>
      )}
      <Seletor
        aria-label={`Mover ${c.nome} para`}
        value=""
        onChange={(ev) => ev.target.value && moverPara(ev.target.value as EtapaCandidato)}
        className={`${classesEntrada} min-h-9 py-1 text-body-sm`}
      >
        <option value="">Mover para…</option>
        {COLUNAS_QUADRO.filter((col) => col.etapa !== c.coluna).map((col) => (
          <option key={col.etapa} value={col.etapa}>
            {col.nome}
          </option>
        ))}
      </Seletor>
    </article>
  );
}

function DetalheCandidato({
  c,
  anuncioId,
  vaga,
  empresa,
  endereco,
  modelos,
  agora,
  moverPara,
  agencia,
  enviarAoCliente,
  pendente,
  direto,
}: {
  c: CartaoQuadro;
  /** contato direto: o match saiu na hora, sem aceite */
  direto: boolean;
  anuncioId: string;
  vaga: string;
  empresa: string;
  endereco: string;
  modelos: ModeloMensagem[];
  agora: number;
  moverPara: (coluna: EtapaCandidato) => void;
  agencia: boolean;
  enviarAoCliente: () => void;
  pendente: boolean;
}) {
  const [marcando, setMarcando] = useState(false);
  const [marcou, setMarcou] = useState(false);
  const match = c.status === "match";
  const primeiro = c.nome.split(" ")[0];
  const e = c.entrevista;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar nome={c.nome} foto={c.foto} tamanho={56} />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-ink-muted">
            {formatarLugar(c.bairro, c.cidade)} · curtiu {tempoRelativo(c.curtido_em, agora)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <NotaAderencia a={c.aderencia} />
            <Selo variante="contorno">{ETAPAS_CANDIDATO[c.coluna].nome}</Selo>
            {c.status === "pendente" &&
              (c.aceita ? <Selo>Esperando currículo</Selo> : <Selo variante="aviso">Espera você</Selo>)}
            {match && <Selo variante="match">Deu match</Selo>}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/perfil/${c.perfil_id}`}
          target="_blank"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
        >
          <ExternalLink aria-hidden className="size-4" />
          Perfil
        </Link>
        <Link
          href={`/painel/caixa?c=${anuncioId}:${c.perfil_id}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
        >
          {c.temCurriculo ? "Currículo e anotações" : "Anotações"}
        </Link>
        {match && (
          <Link
            href={caminhoConversa(c.perfil_id)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
          >
            <MessagesSquare aria-hidden className="size-4" />
            Conversa
          </Link>
        )}
        {match && c.whatsapp && (
          <a
            href={linkWhatsApp(
              c.whatsapp,
              // o link: a curtida aceita (para a pessoa) ou, no contato direto, a vaga
              mensagemComLink(
                `Olá, ${primeiro}! Aqui é da ${empresa}, sobre a vaga de ${vaga} no Publike.`,
                linkDoMatch({ anuncioId, perfilId: c.perfil_id, para: "quem_curtiu", direto }),
              ),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-cerrado px-3 text-label text-on-cerrado hover:brightness-110"
          >
            <MessageCircle aria-hidden className="size-4" />
            WhatsApp
          </a>
        )}
      </div>

      {c.status === "pendente" && c.semCurriculo && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
          <CaminhoDoAceite nome={primeiro} aceita={c.aceita} />
          <p className="text-body-sm text-ink-muted">
            {c.aceita
              ? `Quando ${primeiro} mandar, dá match e a entrevista pode ser marcada.`
              : `Esta vaga pede currículo e ${primeiro} ainda não mandou. Movendo para Entrevista ou Contratado, ${primeiro} recebe o seu aceite e o pedido do currículo.`}
          </p>
        </div>
      )}

      <Secao titulo="Mover para">
        <div className="flex flex-wrap gap-2">
          {COLUNAS_QUADRO.filter((col) => col.etapa !== c.coluna).map((col) => (
            <Botao key={col.etapa} tamanho="sm" onClick={() => moverPara(col.etapa)}>
              {col.nome}
            </Botao>
          ))}
        </div>
      </Secao>

      {agencia && c.status === "match" && (c.coluna === "contratado" || c.colocacao) && (
        <Secao titulo="Colocação">
          <FormColocacao anuncioId={anuncioId} perfilId={c.perfil_id} nome={c.nome} atual={c.colocacao} agora={agora} />
        </Secao>
      )}

      {agencia && (
        <Secao titulo="Cliente">
          <ClienteDoCandidato
            c={c}
            anuncioId={anuncioId}
            agora={agora}
            enviarAoCliente={enviarAoCliente}
            pendente={pendente}
          />
        </Secao>
      )}

      <Secao titulo="Aderência à vaga">
        <DetalheDaAderencia a={c.aderencia} editarVaga={`/painel/anuncio/${anuncioId}/editar`} />
      </Secao>

      {(c.respostas.length > 0 || c.mensagem) && (
        <Secao titulo="O que respondeu">
          {c.mensagem && (
            <blockquote className="mb-2 rounded-md bg-surface-300 p-3 text-body-sm">“{c.mensagem}”</blockquote>
          )}
          <dl className="flex flex-col gap-1.5 text-body-sm">
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

      <Secao titulo="Entrevista">
        {c.aceita ? (
          <p className="text-body-sm text-ink-muted">Dá para marcar assim que der match, quando o currículo chegar.</p>
        ) : e && !marcando ? (
          <>
            {marcou && (
              <p role="status" className="text-body-sm text-cerrado-text">
                Entrevista marcada. O candidato recebeu o aviso e a mensagem na conversa.
              </p>
            )}
            <EntrevistaMarcada
              entrevista={e}
              aoRemarcar={() => (setMarcou(false), setMarcando(true))}
              agenda={{
                vaga,
                candidato: c.nome,
                url: `${SITE_URL}/painel/anuncio/${anuncioId}/quadro?candidato=${c.perfil_id}`,
              }}
            />
          </>
        ) : (
          <FormEntrevista
            anuncioId={anuncioId}
            perfilId={c.perfil_id}
            nome={c.nome}
            atual={e && ["marcada", "confirmada", "remarcar"].includes(e.situacao) ? e : null}
            endereco={endereco}
            aoTerminar={() => {
              setMarcando(false);
              setMarcou(true);
            }}
          />
        )}
      </Secao>

      <Secao titulo="Mensagem">
        {c.aceita ? (
          <p className="text-body-sm text-ink-muted">A conversa abre com o match, assim que o currículo chegar.</p>
        ) : (
          <CompositorMensagem
            anuncioId={anuncioId}
            perfis={[{ id: c.perfil_id, nome: c.nome, match }]}
            vaga={vaga}
            empresa={empresa}
            modelos={modelos}
          />
        )}
      </Secao>
    </div>
  );
}

/** No cartão: o candidato está com o cliente, e o que ele respondeu. */
function SeloDoCliente({ r }: { r: RespostaCliente }) {
  if (!r.decisao) return <Selo variante="contorno">Com o cliente</Selo>;
  return (
    <Selo variante={DECISOES_CLIENTE[r.decisao].selo} title={r.comentario ?? undefined}>
      Cliente: {DECISOES_CLIENTE[r.decisao].nome.toLowerCase()}
    </Selo>
  );
}

/** Na gaveta (agência): mandar ao cliente, ou o que o cliente respondeu. */
function ClienteDoCandidato({
  c,
  anuncioId,
  agora,
  enviarAoCliente,
  pendente,
}: {
  c: CartaoQuadro;
  anuncioId: string;
  agora: number;
  enviarAoCliente: () => void;
  pendente: boolean;
}) {
  const [tirando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = c.nome.split(" ")[0];
  const f = c.finalista;
  const lista = (
    <Link
      href={`/painel/anuncio/${anuncioId}/finalistas#finalista-${c.perfil_id}`}
      className="underline underline-offset-2"
    >
      Ver os finalistas e o parecer
    </Link>
  );
  if (!f) {
    if (c.status !== "match") {
      return <p className="text-body-sm text-ink-muted">Depois do match, dá para mandar {primeiro} ao cliente.</p>;
    }
    return (
      <div className="flex flex-col items-start gap-2">
        <Botao tamanho="sm" disabled={pendente} onClick={enviarAoCliente}>
          <UserPlus aria-hidden />
          Pôr nos finalistas
        </Botao>
        <p className="text-body-sm text-ink-muted">
          O cliente vê o currículo (sem contato) e o seu parecer, e responde pelo link. {lista}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-body-sm">
      <p className="flex flex-wrap items-center gap-2">
        <SeloDoCliente r={f} />
        {f.decidido_em && (
          <span className="text-ink-muted">
            {f.quem ? `${f.quem}, ` : ""}
            {tempoRelativo(f.decidido_em, agora)}
          </span>
        )}
      </p>
      {f.comentario && <blockquote className="rounded-md bg-surface-300 p-3">“{f.comentario}”</blockquote>}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {lista}
        <button
          type="button"
          disabled={tirando}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => tirarFinalista(anuncioId, c.perfil_id));
              if (!r.ok) setErro(r.erro);
            })
          }
          className="text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60"
        >
          Tirar da lista
        </button>
      </p>
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-label">{titulo}</h3>
      {children}
    </section>
  );
}

/** Painel que abre do lado (computador) ou de baixo (celular). */
function Gaveta({
  aberta,
  fechar,
  titulo,
  children,
}: {
  aberta: boolean;
  fechar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);
  const id = useMemo(() => `gaveta-${titulo.replace(/\W+/g, "-").toLowerCase()}`, [titulo]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={fechar}
      onClick={(e) => e.target === e.currentTarget && fechar()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:mt-0 sm:mr-0 sm:ml-auto sm:h-dvh sm:max-h-dvh sm:w-[34rem] sm:rounded-none sm:rounded-l-lg"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-200 px-5 py-3">
        <h2 id={id} className="truncate text-h3">
          {titulo}
        </h2>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{aberta && children}</div>
    </dialog>
  );
}

const DICA_VISTA = "publike_dica_quadro";

/**
 * Como o quadro funciona, numa dica que aparece uma vez (claude/plano-painel-simples.md, parte 3): "Entendi" a
 * esconde neste aparelho. Sem o armazenamento do navegador, ela aparece sempre (fecha até recarregar).
 */
function DicaDoQuadro() {
  // a dica já vista vem do aparelho; no servidor, escondida (aparece na tela, se for a primeira vez)
  const vista = useSyncExternalStore(ouvirArmazenamento, lerDicaVista, () => true);
  const [fechada, setFechada] = useState(false);
  if (vista || fechada) return null;
  return (
    <div
      role="note"
      className="flex w-full flex-col gap-2 rounded-md border border-line bg-surface-200 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
    >
      <p className="flex-1 text-body-sm text-ink-muted">
        <span className="font-semibold text-ink">Dica:</span> arraste o cartão para outra coluna ou use “Mover para”. Ir
        para Entrevista ou Contratado dá o match (o contato aparece para os dois); “Não seguiu” dispensa quem ainda
        esperava resposta. Se a vaga pede currículo e a pessoa ainda não mandou, ela recebe o pedido e o match sai
        quando ele chegar.
      </p>
      <button
        type="button"
        onClick={() => {
          setFechada(true);
          try {
            localStorage.setItem(DICA_VISTA, "1");
          } catch {}
        }}
        className="inline-flex min-h-10 shrink-0 items-center self-start rounded-md border border-line-strong px-3.5 text-label hover:bg-surface-300"
      >
        Entendi
      </button>
    </div>
  );
}

function ouvirArmazenamento(avisar: () => void) {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}

function lerDicaVista() {
  try {
    return Boolean(localStorage.getItem(DICA_VISTA));
  } catch {
    return false;
  }
}
