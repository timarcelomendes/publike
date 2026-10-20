"use client";

import { Check, Copy, ExternalLink, LogOut, MessageCircle, UserMinus, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  cancelarConviteEquipe,
  criarConviteEquipe,
  mudarPapelEquipe,
  sairDaEquipe,
  tirarDaEquipe,
} from "@/lib/acoes/equipe";
import { mensagemConviteEquipe, PAPEIS_EQUIPE, type PapelEquipe } from "@/lib/equipe";
import { formatarDataCurta, tempoRelativo } from "@/lib/formato";
import { Avatar, Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";

// A equipe da agência: convidar (o link vai pelo WhatsApp), quem está na equipe (mudar o papel,
// tirar, sair) e os convites esperando resposta.

const pilula =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-100 p-3 transition-colors has-[:checked]:border-ink has-[:checked]:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus";

function LinkParaCopiar({ url, rotulo }: { url: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setFalhou(false);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFalhou(true);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={url}
          aria-label={rotulo}
          onFocus={(e) => e.currentTarget.select()}
          className={`${classesEntrada} font-mono text-body-sm sm:flex-1`}
        />
        <Botao tamanho="sm" onClick={copiar}>
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? "Copiado" : "Copiar"}
        </Botao>
      </div>
      {falhou && <p className="text-body-sm text-danger">Não deu para copiar. Toque no link e copie à mão.</p>}
    </div>
  );
}

function BotaoWhats({ texto, rotulo = "Mandar pelo WhatsApp" }: { texto: string; rotulo?: string }) {
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-cerrado px-3.5 text-label text-on-cerrado hover:brightness-110"
    >
      <MessageCircle aria-hidden className="size-[18px]" />
      {rotulo}
    </a>
  );
}

export function ConvidarParaEquipe({ site, agencia }: { site: string; agencia: string }) {
  const [papel, setPapel] = useState<PapelEquipe>("recrutador");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<{ campo?: string; texto: string } | null>(null);
  const [criado, setCriado] = useState<{ token: string; expira_em: string; nome: string; papel: PapelEquipe } | null>(
    null,
  );
  const [pendente, iniciar] = useTransition();

  function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await criarConviteEquipe(papel, nome);
      if (!r.ok) return setErro({ campo: r.campo, texto: r.erro });
      setCriado({ token: r.token, expira_em: r.expira_em, nome: nome.trim(), papel });
      setNome("");
    });
  }

  if (criado) {
    const url = `${site}/equipe/${criado.token}`;
    const quem = criado.nome.split(" ")[0];
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="flex items-center gap-2 text-label text-cerrado-text">
          <Check aria-hidden className="size-5" />
          Convite {quem ? `para ${quem} ` : ""}pronto ({PAPEIS_EQUIPE[criado.papel].nome.toLowerCase()}). Vale até{" "}
          {formatarDataCurta(criado.expira_em)}.
        </p>
        <p className="text-body-sm text-ink-muted">
          Mande o link para a pessoa. Ela entra com o próprio celular e, ao aceitar, já age pela {agencia}. Cada link
          serve para uma pessoa.
        </p>
        <LinkParaCopiar url={url} rotulo="Link do convite para a equipe (para copiar)" />
        <BotaoWhats texto={mensagemConviteEquipe({ nome: criado.nome || null, agencia, papel: criado.papel, url })} />
        <div>
          <Botao tamanho="sm" onClick={() => setCriado(null)}>
            <UserPlus aria-hidden />
            Convidar outra pessoa
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={criar} noValidate className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">Papel na equipe</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(PAPEIS_EQUIPE) as PapelEquipe[])
            .slice()
            .reverse()
            .map((p) => (
              <label key={p} className={pilula}>
                <input
                  type="radio"
                  name="papel"
                  value={p}
                  checked={papel === p}
                  onChange={() => setPapel(p)}
                  className="mt-1 size-4 accent-[var(--pk-ink)]"
                />
                <span>
                  <span className="block text-label">{PAPEIS_EQUIPE[p].nome}</span>
                  <span className="block text-body-sm text-ink-muted">{PAPEIS_EQUIPE[p].ajuda}</span>
                </span>
              </label>
            ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="equipe-nome" className="text-label">
          Nome da pessoa <span className="font-normal text-ink-muted">(opcional, para você achar o convite)</span>
        </label>
        <input
          id="equipe-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={80}
          autoComplete="off"
          placeholder="Ex.: Bruno"
          aria-invalid={erro?.campo === "nome" ? true : undefined}
          className={`${classesEntrada} sm:max-w-md`}
        />
        {erro?.campo === "nome" && <MensagemErro>{erro.texto}</MensagemErro>}
      </div>
      {erro && erro.campo !== "nome" && (
        <p role="alert" className="text-body-sm text-danger">
          {erro.texto}
        </p>
      )}
      <div>
        <Botao type="submit" variante="primario" disabled={pendente}>
          <UserPlus aria-hidden />
          {pendente ? "Criando…" : "Criar o convite"}
        </Botao>
      </div>
    </form>
  );
}

export type MembroNaTela = {
  membro_id: string;
  nome: string;
  foto: string | null;
  papel: PapelEquipe;
  desde: string;
  ultima_atividade: string | null;
  sou_eu: boolean;
};

export function MembroDaEquipe({
  m,
  podeAdministrar,
  agenciaId,
  agora,
}: {
  m: MembroNaTela;
  podeAdministrar: boolean;
  agenciaId: string;
  agora: number;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const primeiro = m.nome.split(" ")[0];

  function trocarPapel(papel: string) {
    setAviso(null);
    iniciar(async () => {
      const r = await mudarPapelEquipe(m.membro_id, papel);
      setAviso(
        r.ok
          ? { ok: true, texto: `${primeiro} agora é ${PAPEIS_EQUIPE[papel as PapelEquipe].nome.toLowerCase()}.` }
          : { ok: false, texto: r.erro },
      );
    });
  }

  function tirarOuSair() {
    setAviso(null);
    iniciar(async () => {
      const r = m.sou_eu ? await sairDaEquipe(agenciaId) : await tirarDaEquipe(m.membro_id);
      if (!r.ok) return setAviso({ ok: false, texto: r.erro });
      if (m.sou_eu) {
        router.push("/painel");
        router.refresh();
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Avatar nome={m.nome} foto={m.foto} tamanho={40} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-label break-words">
              {m.nome}
              {m.sou_eu && <span className="font-normal text-ink-muted"> (você)</span>}
            </span>
            <Selo variante={m.papel === "admin" ? "neutro" : "contorno"}>{PAPEIS_EQUIPE[m.papel].nome}</Selo>
          </p>
          <p className="text-body-sm text-ink-muted">
            Na equipe desde {formatarDataCurta(m.desde)}
            {m.ultima_atividade ? ` · última atividade ${tempoRelativo(m.ultima_atividade, agora)}` : ""}
          </p>
        </div>
        {podeAdministrar && !m.sou_eu && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`papel-${m.membro_id}`} className="sr-only">
              Papel de {m.nome}
            </label>
            <Seletor
              id={`papel-${m.membro_id}`}
              value={m.papel}
              disabled={pendente}
              onChange={(e) => trocarPapel(e.target.value)}
              className={`${classesEntrada} min-h-10 py-1.5`}
            >
              {(Object.keys(PAPEIS_EQUIPE) as PapelEquipe[]).map((p) => (
                <option key={p} value={p}>
                  {PAPEIS_EQUIPE[p].nome}
                </option>
              ))}
            </Seletor>
          </div>
        )}
        {(podeAdministrar || m.sou_eu) &&
          (confirmar ? (
            <span className="flex flex-wrap items-center gap-2 text-body-sm">
              {m.sou_eu ? "Você deixa de agir pela agência." : `${primeiro} deixa de agir pela agência.`}
              <Botao tamanho="sm" variante="perigo" disabled={pendente} onClick={tirarOuSair}>
                {pendente ? "Saindo…" : m.sou_eu ? "Sair da equipe" : "Tirar da equipe"}
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
                Voltar
              </Botao>
            </span>
          ) : (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
              {m.sou_eu ? <LogOut aria-hidden /> : <UserMinus aria-hidden />}
              {m.sou_eu ? "Sair" : "Tirar"}
            </Botao>
          ))}
      </div>
      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
        >
          {aviso.texto}
        </p>
      )}
    </li>
  );
}

export type ConviteNaTela = { id: string; token: string; nome: string | null; papel: PapelEquipe; expira_em: string };

export function ConviteDaEquipe({ c, site, agencia }: { c: ConviteNaTela; site: string; agencia: string }) {
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const url = `${site}/equipe/${c.token}`;
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-label break-words">{c.nome ?? "Convite sem nome"}</span>
            <Selo variante="aviso">{PAPEIS_EQUIPE[c.papel].nome}</Selo>
          </p>
          <p className="text-body-sm text-ink-muted">Esperando resposta · vale até {formatarDataCurta(c.expira_em)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
            <ExternalLink aria-hidden />
            {aberto ? "Fechar o link" : "Ver o link"}
          </Botao>
          {confirmar ? (
            <span className="flex flex-wrap items-center gap-2 text-body-sm">
              O link para de abrir.
              <Botao
                tamanho="sm"
                variante="perigo"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await cancelarConviteEquipe(c.id);
                    if (!r.ok) setErro(r.erro);
                    setConfirmar(false);
                  })
                }
              >
                {pendente ? "Cancelando…" : "Cancelar o convite"}
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
                Voltar
              </Botao>
            </span>
          ) : (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
              <X aria-hidden />
              Cancelar
            </Botao>
          )}
        </div>
      </div>
      {aberto && (
        <div className="flex flex-col gap-2">
          <LinkParaCopiar url={url} rotulo={`Link do convite${c.nome ? ` de ${c.nome}` : ""} (para copiar)`} />
          <BotaoWhats texto={mensagemConviteEquipe({ nome: c.nome, agencia, papel: c.papel, url })} />
        </div>
      )}
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}
