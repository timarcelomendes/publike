"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { aceitarConviteCandidato, recusarConviteCandidato } from "@/lib/acoes/convites-candidato";
import type { Pergunta, Respostas } from "@/lib/vaga-extra";
import { CamposDasPerguntas, faltandoResponder } from "../anuncio/perguntas-da-vaga";
import { Botao } from "../ui/botao";

// Quem foi chamado pelo link: aceitar (com as respostas da vaga) ou dizer que não quer.

export function AceitarConvite({
  token,
  perguntas,
  quem,
  temCurriculo,
}: {
  token: string;
  perguntas: Pergunta[];
  /** quem chamou ("RH Cerrado Seleção") */
  quem: string;
  /** a pessoa já tem currículo salvo: dá match na hora */
  temCurriculo: boolean;
}) {
  const router = useRouter();
  const [respostas, setRespostas] = useState<Respostas>({});
  const [faltando, setFaltando] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function aceitar() {
    setErro(null);
    const falta = faltandoResponder(perguntas, respostas);
    setFaltando(falta);
    if (falta.length) {
      setErro(falta.length === 1 ? "Responda à pergunta marcada." : "Responda às perguntas marcadas.");
      return;
    }
    iniciar(async () => {
      const r = await chamarAcao(() => aceitarConviteCandidato(token, respostas));
      if (r.ok) return router.push(r.ir);
      if ("ir" in r && r.ir) return router.push(r.ir);
      setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {perguntas.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-label">
            Antes, responda {perguntas.length === 1 ? "à pergunta" : "às perguntas"} da vaga:
          </p>
          <CamposDasPerguntas
            perguntas={perguntas}
            respostas={respostas}
            faltando={faltando}
            mudar={(id, valor) => {
              setRespostas((r) => ({ ...r, [id]: valor }));
              setFaltando((f) => f.filter((x) => x !== id));
            }}
          />
        </div>
      )}
      <p className="text-body-sm text-ink-muted">
        {temCurriculo
          ? `Ao aceitar, ${quem} vê seu perfil e seu currículo, e o WhatsApp de vocês aparece para os dois.`
          : `Ao aceitar, você confere o currículo que ${quem} montou e salva. Aí ${quem} vê seu perfil e seu currículo, e o WhatsApp de vocês aparece para os dois.`}
      </p>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Botao variante="primario" onClick={aceitar} disabled={pendente}>
          <Check aria-hidden />
          {pendente ? "Aceitando…" : "Aceitar e me candidatar"}
        </Botao>
        <NaoQuero token={token} />
      </div>
    </div>
  );
}

/** "Não tenho interesse": quem chamou recebe o aviso e o currículo lido sai do convite. */
export function NaoQuero({ token }: { token: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  if (aviso?.ok) {
    return (
      <p role="status" className="text-body-sm text-cerrado-text">
        {aviso.texto}
      </p>
    );
  }
  if (!confirmar) {
    return (
      <Botao variante="fantasma" onClick={() => setConfirmar(true)}>
        Não tenho interesse
      </Botao>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-body-sm">
      Avisamos que você não tem interesse.
      <Botao
        tamanho="sm"
        variante="perigo"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await chamarAcao(() => recusarConviteCandidato(token));
            setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
          })
        }
      >
        {pendente ? "Enviando…" : "Confirmar"}
      </Botao>
      <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
        Voltar
      </Botao>
      {aviso && !aviso.ok && (
        <span role="alert" className="w-full text-danger">
          {aviso.texto}
        </span>
      )}
    </span>
  );
}
