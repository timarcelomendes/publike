"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { anotarMotivo, marcarContato } from "@/lib/acoes/manter-contato";
import { linkWhatsApp } from "@/lib/formato";
import {
  falouHaPouco,
  mensagemDeContato,
  MOTIVOS_DA_EMPRESA,
  NOME_DA_SITUACAO,
  situacaoDa,
  type EmpresaParaContato,
  type MotivoDaEmpresa,
} from "@/lib/manter-contato";
import { classesBotao } from "../ui/botao";

// Admin › Convites › Manter contato (19/11/2026; Marcelo: "reforçar para que elas publiquem mais vagas, e entender a
// razão de não ter publicado ainda, de forma simples e objetiva"). A mensagem abre no WhatsApp da equipe, uma de cada
// vez; a resposta numerada da empresa vira o motivo, que se conta no topo.

const CHAVE_ASSINATURA = "publike_admin_assinatura";
const FUSO = "America/Sao_Paulo";
const data = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(new Date(iso));

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

export function ManterContato({ empresas, agora }: { empresas: EmpresaParaContato[]; agora: number }) {
  const [assinatura, setAssinatura] = useState("o Marcelo");
  const [aba, setAba] = useState<"hoje" | "falei">("hoje");
  const [mudancas, setMudancas] = useState<Record<string, Partial<EmpresaParaContato>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  useEffect(() => {
    try {
      const salva = localStorage.getItem(CHAVE_ASSINATURA);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência do navegador, só existe no cliente
      if (salva !== null) setAssinatura(salva);
    } catch {}
  }, []);

  const lista = empresas.map((e) => ({ ...e, ...mudancas[e.id] }));
  const hoje = lista.filter((e) => !falouHaPouco(e, agora));
  const falei = lista.filter((e) => falouHaPouco(e, agora));
  // as sem vaga no ar primeiro (é onde está o porquê), depois as que estão saindo do ar
  const ordem = { sem_vaga: 0, vencendo: 1, no_ar: 2 } as const;
  const vistas = (aba === "hoje" ? hoje : falei).toSorted(
    (a, b) => ordem[situacaoDa(a, agora)] - ordem[situacaoDa(b, agora)] || a.nome.localeCompare(b.nome),
  );
  const motivos = MOTIVOS_DA_EMPRESA.map((m) => ({ ...m, n: lista.filter((e) => e.contato_motivo === m.id).length })).filter(
    (m) => m.n > 0,
  );

  const mudar = (id: string, x: Partial<EmpresaParaContato>, acao: () => Promise<{ ok: boolean; erro?: string }>) => {
    setMudancas((m) => ({ ...m, [id]: { ...m[id], ...x } }));
    iniciar(async () => {
      const r = await acao();
      setErro(r.ok ? null : (r.erro ?? "Não deu para salvar."));
    });
  };

  if (!empresas.length)
    return (
      <p className="text-body-sm text-ink-muted">
        Ainda não há empresa que veio de convite e publicou. Elas aparecem aqui depois da primeira vaga.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {motivos.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
          <h3 className="text-label">Por que não publicaram de novo</h3>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-body-sm">
            {motivos.map((m) => (
              <li key={m.id}>
                {m.nome}: <span className="text-label tabular-nums">{m.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2" role="group" aria-label="Quais empresas">
        <button type="button" aria-pressed={aba === "hoje"} className={chip(aba === "hoje")} onClick={() => setAba("hoje")}>
          Para falar <span className="tabular-nums opacity-70">{hoje.length}</span>
        </button>
        <button type="button" aria-pressed={aba === "falei"} className={chip(aba === "falei")} onClick={() => setAba("falei")}>
          Falei nos últimos 30 dias <span className="tabular-nums opacity-70">{falei.length}</span>
        </button>
      </div>

      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}

      {!vistas.length ? (
        <p className="text-body-sm text-ink-muted">
          {aba === "hoje" ? "Você já falou com todas nos últimos 30 dias." : "Nenhum contato nos últimos 30 dias."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {vistas.map((e) => {
            const situacao = situacaoDa(e, agora);
            const texto = mensagemDeContato(e, assinatura, agora);
            return (
              <li key={e.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-label">{e.nome}</p>
                  <span className={`text-caption font-semibold ${situacao === "sem_vaga" ? "text-terra-text" : "text-cerrado-text"}`}>
                    {NOME_DA_SITUACAO[situacao]}
                  </span>
                </div>
                <p className="text-body-sm text-ink-muted">
                  {e.vaga ? (
                    <>
                      {e.vaga.titulo} · {e.vaga.candidatos === 1 ? "1 candidato" : `${e.vaga.candidatos} candidatos`} ·{" "}
                      {e.vaga.no_ar ? (e.vaga.expira_em ? `no ar até ${data(e.vaga.expira_em)}` : "no ar") : "fora do ar"}
                    </>
                  ) : null}
                  {" · "}
                  {e.publicadas === 1 ? "1 vaga publicada" : `${e.publicadas} vagas publicadas`}
                  {e.contato_em ? ` · falei em ${data(e.contato_em)}` : ""}
                </p>
                <details className="text-body-sm">
                  <summary className="cursor-pointer text-ink-muted">Ver a mensagem</summary>
                  <p className="mt-2 max-w-xl rounded-lg bg-tom-servico px-3 py-2 whitespace-pre-line">{texto}</p>
                </details>
                <div className="flex flex-wrap items-center gap-2">
                  {e.whatsapp ? (
                    <a
                      href={linkWhatsApp(`55${e.whatsapp}`, texto)}
                      target="_blank"
                      rel="noreferrer"
                      className={classesBotao("primario", "sm")}
                      onClick={() => mudar(e.id, { contato_em: new Date().toISOString() }, () => marcarContato(e.id))}
                    >
                      <MessageCircle aria-hidden className="size-4" />
                      Abrir no WhatsApp
                    </a>
                  ) : (
                    <span className="text-body-sm text-ink-muted">Sem WhatsApp no convite.</span>
                  )}
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-caption text-ink-muted">O que a empresa respondeu</legend>
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS_DA_EMPRESA.map((m) => {
                      const ativo = e.contato_motivo === m.id;
                      const novo: MotivoDaEmpresa | null = ativo ? null : m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={ativo}
                          className={`${chip(ativo)} min-h-9 text-body-sm`}
                          onClick={() => mudar(e.id, { contato_motivo: novo }, () => anotarMotivo(e.id, novo))}
                        >
                          {m.nome}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
