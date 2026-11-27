"use client";

import {
  CalendarPlus,
  Check,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  aprovarNaAgenda,
  criarAgenda,
  encerrarAgenda,
  maisHorarios,
  resultadoDaEntrevista,
  tirarDaAgenda,
  tirarHorario,
} from "@/lib/acoes/admin-entrevistas";
import { FORMATOS_DA_AGENDA } from "@/lib/agenda-horarios";
import { Botao } from "../ui/botao";
import { SeletorDeHorarios, useEscolhaDeHorarios } from "./seletor-de-horarios";
import { Campo, classesEntrada, Seletor } from "../ui/campo";

// A agenda de entrevistas pelo WhatsApp (migrações 20271013120000 e 20271014120000): as partes que mexem nela, no
// Admin › Entrevistas (a equipe) e no painel da vaga (a conta dona). As páginas leem do banco; daqui saem as ações.

const DURACOES = [20, 30, 45, 60];

function Erro({ texto }: { texto: string | null }) {
  return texto ? (
    <p role="alert" className="text-body-sm text-danger">
      {texto}
    </p>
  ) : null;
}

function Ok({ texto }: { texto: string | null }) {
  return texto ? (
    <p role="status" className="text-body-sm text-cerrado-text">
      {texto}
    </p>
  ) : null;
}

export function FormNovaAgenda({
  anuncio,
  localPadrao,
  noPainel = false,
  aoVivo = true,
  agora,
}: {
  anuncio: string;
  localPadrao: string;
  /** no painel da vaga (a conta dona): depois de criar, volta para a agenda da vaga */
  noPainel?: boolean;
  /** a conta tem a entrevista ao vivo pelo Publike (o limite do mês) */
  aoVivo?: boolean;
  /** a hora da requisição (os dias do seletor) */
  agora: number;
}) {
  const router = useRouter();
  const [duracao, setDuracao] = useState(30);
  const escolha = useEscolhaDeHorarios(agora, duracao);
  const [formato, setFormato] = useState<string>("presencial");
  const [local, setLocal] = useState(localPadrao);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setSalvando(true);
    setErro(null);
    const r = await chamarAcao(() =>
      criarAgenda({
        anuncio,
        horarios: escolha.horarios,
        duracao,
        formato,
        local: formato === "publike" || formato === "telefone" ? "" : local,
        obs,
      }),
    );
    setSalvando(false);
    if (r.ok && "id" in r)
      router.push(
        noPainel
          ? `/painel/anuncio/${anuncio}/agenda`
          : `/admin/entrevistas?agenda=${r.id}`,
      );
    else if (!r.ok) setErro(r.erro);
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Cada entrevista dura" nome="duracao">
          <Seletor
            id="duracao"
            value={duracao}
            onChange={(e) => setDuracao(Number(e.target.value))}
            className={classesEntrada}
          >
            {DURACOES.map((d) => (
              <option key={d} value={d}>
                {d} minutos
              </option>
            ))}
          </Seletor>
        </Campo>
        <Campo rotulo="Como vai ser" nome="formato">
          <Seletor
            id="formato"
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            className={classesEntrada}
          >
            {FORMATOS_DA_AGENDA.filter(
              (f) => aoVivo || f.valor !== "publike",
            ).map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.nome}
              </option>
            ))}
          </Seletor>
        </Campo>
      </div>
      <SeletorDeHorarios escolha={escolha} noPainel={noPainel} />
      {(formato === "presencial" || formato === "video") && (
        <Campo
          rotulo={
            formato === "presencial"
              ? "Endereço da entrevista"
              : "Link da chamada"
          }
          nome="local"
          ajuda={
            formato === "presencial"
              ? "Vai na confirmação para o candidato."
              : "Começa com https://"
          }
        >
          <input
            id="local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className={classesEntrada}
          />
        </Campo>
      )}
      {formato === "telefone" && (
        <p className="text-body-sm text-ink-muted">
          A empresa liga para o número do candidato na hora marcada. O número
          aparece no painel dela depois do aceite.
        </p>
      )}
      {formato === "publike" && (
        <p className="text-body-sm text-ink-muted">
          A sala abre 10 minutos antes. Conta no limite de entrevistas ao vivo
          do mês da empresa.
        </p>
      )}
      <Campo
        rotulo="Recado para o candidato"
        nome="obs"
        opcional
        ajuda="Ex.: procurar a Joana na recepção."
      >
        <input
          id="obs"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          className={classesEntrada}
          maxLength={500}
        />
      </Campo>
      <Erro texto={erro} />
      <div>
        <Botao
          type="submit"
          variante="primario"
          disabled={salvando || escolha.horarios.length === 0}
        >
          <CalendarPlus aria-hidden />
          {salvando
            ? "Criando…"
            : escolha.horarios.length
              ? `Criar a agenda com ${escolha.horarios.length === 1 ? "1 horário" : `${escolha.horarios.length} horários`}`
              : "Criar a agenda"}
        </Botao>
      </div>
    </form>
  );
}

export type CandidatoDaAgenda = {
  perfil_id: string;
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  status: string;
  desde: string;
  whatsapp: boolean;
  teste: { pontos: number; maximo: number } | null;
};

export function AprovarCandidatos({
  agenda,
  candidatos,
}: {
  agenda: string;
  candidatos: CandidatoDaAgenda[];
}) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(candidatos.filter((c) => c.whatsapp).map((c) => c.perfil_id)),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!candidatos.length)
    return (
      <p className="text-body-sm text-ink-muted">
        Todos os candidatos da vaga já estão na agenda.
      </p>
    );

  function alternar(id: string) {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function aprovar() {
    setSalvando(true);
    setErro(null);
    setOk(null);
    // na ordem da lista (a mais antiga candidatura primeiro)
    const ids = candidatos
      .filter((c) => marcados.has(c.perfil_id))
      .map((c) => c.perfil_id);
    const r = await chamarAcao(() => aprovarNaAgenda(agenda, ids));
    setSalvando(false);
    if (r.ok) setOk(r.mensagem ?? "Pronto.");
    else setErro(r.erro);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {candidatos.map((c) => (
          <li key={c.perfil_id} className="flex items-start gap-3 p-3">
            <input
              id={`cand-${c.perfil_id}`}
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-terra"
              checked={marcados.has(c.perfil_id)}
              disabled={!c.whatsapp}
              onChange={() => alternar(c.perfil_id)}
            />
            <label
              htmlFor={`cand-${c.perfil_id}`}
              className="flex min-w-0 flex-1 flex-col gap-0.5"
            >
              <span className="font-semibold">{c.nome ?? "Sem nome"}</span>
              <span className="text-body-sm text-ink-muted">
                {[c.bairro, c.cidade].filter(Boolean).join(", ") ||
                  "Sem bairro"}
                {" · "}
                {c.status === "match" ? "já aceito" : "esperando resposta"}
                {c.teste
                  ? ` · teste ${c.teste.pontos} de ${c.teste.maximo}`
                  : ""}
                {c.whatsapp
                  ? ""
                  : " · sem aceite do WhatsApp (não dá para chamar)"}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Erro texto={erro} />
      <Ok texto={ok} />
      <div>
        <Botao
          variante="primario"
          disabled={salvando || marcados.size === 0}
          onClick={aprovar}
        >
          <UserCheck aria-hidden />
          {salvando ? "Pondo na fila…" : `Pôr na fila (${marcados.size})`}
        </Botao>
      </div>
    </div>
  );
}

export function AcoesDoConvite({
  convite,
  situacao,
  entrevista,
}: {
  convite: number;
  situacao: string;
  entrevista: string | null;
}) {
  const [fazendo, setFazendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function fazer(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setFazendo(true);
    setErro(null);
    const r = await chamarAcao(acao);
    setFazendo(false);
    if (!r.ok) setErro("erro" in r && r.erro ? r.erro : "Não deu certo.");
  }

  if (situacao === "marcado" && entrevista && entrevista !== "cancelada") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2">
          <Botao
            tamanho="sm"
            variante={entrevista === "realizada" ? "sucesso" : "secundario"}
            disabled={fazendo}
            onClick={() =>
              fazer(() =>
                resultadoDaEntrevista(
                  convite,
                  entrevista === "realizada" ? "confirmada" : "realizada",
                ),
              )
            }
          >
            <Check aria-hidden />
            Veio
          </Botao>
          <Botao
            tamanho="sm"
            variante={entrevista === "faltou" ? "perigo" : "secundario"}
            disabled={fazendo}
            onClick={() =>
              fazer(() =>
                resultadoDaEntrevista(
                  convite,
                  entrevista === "faltou" ? "confirmada" : "faltou",
                ),
              )
            }
          >
            <UserX aria-hidden />
            Faltou
          </Botao>
        </div>
        <Erro texto={erro} />
      </div>
    );
  }
  if (["fila", "sem_whatsapp", "falhou"].includes(situacao)) {
    return (
      <div className="flex flex-col gap-1">
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={fazendo}
          onClick={() => fazer(() => tirarDaAgenda(convite))}
        >
          <X aria-hidden />
          Tirar da fila
        </Botao>
        <Erro texto={erro} />
      </div>
    );
  }
  return null;
}

export function MaisHorarios({
  agenda,
  duracao,
  agora,
}: {
  agenda: string;
  duracao: number;
  agora: number;
}) {
  const [aberto, setAberto] = useState(false);
  const escolha = useEscolhaDeHorarios(agora, duracao);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!aberto)
    return (
      <div>
        <Botao tamanho="sm" onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          Mais horários
        </Botao>
      </div>
    );

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setOk(null);
    const r = await chamarAcao(() =>
      maisHorarios(agenda, escolha.horarios, duracao),
    );
    setSalvando(false);
    if (r.ok) {
      setOk(r.mensagem ?? "Pronto.");
      escolha.limpar();
    } else setErro(r.erro);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-3">
      <SeletorDeHorarios escolha={escolha} dias={21} />
      <Erro texto={erro} />
      <Ok texto={ok} />
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={salvando || escolha.horarios.length === 0}
          onClick={salvar}
        >
          {salvando
            ? "Salvando…"
            : escolha.horarios.length
              ? `Pôr ${escolha.horarios.length === 1 ? "1 horário" : `${escolha.horarios.length} horários`}`
              : "Pôr os horários"}
        </Botao>
        <Botao
          tamanho="sm"
          variante="fantasma"
          onClick={() => setAberto(false)}
        >
          Fechar
        </Botao>
      </div>
    </div>
  );
}

export function TirarHorario({
  agenda,
  horario,
}: {
  agenda: string;
  horario: number;
}) {
  const [fazendo, setFazendo] = useState(false);
  return (
    <button
      type="button"
      aria-label="Tirar este horário"
      title="Tirar este horário"
      disabled={fazendo}
      onClick={async () => {
        setFazendo(true);
        await chamarAcao(() => tirarHorario(agenda, horario));
        setFazendo(false);
      }}
      className="rounded-sm p-1 text-ink-muted hover:text-danger disabled:opacity-50"
    >
      <Trash2 aria-hidden className="size-4" />
    </button>
  );
}

export function EncerrarAgenda({ agenda }: { agenda: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [fazendo, setFazendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!confirmar)
    return (
      <Botao
        tamanho="sm"
        variante="fantasma"
        onClick={() => setConfirmar(true)}
      >
        Encerrar a agenda
      </Botao>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm">
        Quem ainda não marcou sai da fila e não recebe mais convite. As
        entrevistas marcadas continuam.
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="perigo"
          disabled={fazendo}
          onClick={async () => {
            setFazendo(true);
            const r = await chamarAcao(() => encerrarAgenda(agenda));
            setFazendo(false);
            if (!r.ok) setErro(r.erro);
          }}
        >
          Encerrar
        </Botao>
        <Botao
          tamanho="sm"
          variante="fantasma"
          onClick={() => setConfirmar(false)}
        >
          Voltar
        </Botao>
      </div>
      <Erro texto={erro} />
    </div>
  );
}
