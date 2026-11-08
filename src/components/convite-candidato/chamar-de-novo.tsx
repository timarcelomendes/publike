"use client";

import { Check, MessageCircle, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { convidarParaVaga } from "@/lib/acoes/talentos";
import { formatarLugar, linkWhatsApp, tempoRelativo } from "@/lib/formato";
import type { CandidatoDeAntes } from "@/lib/servidor/convites-candidato";
import { ConviteEmLote, MarcarConvite, MarcarTodos } from "../talentos/convite-em-lote";
import { Avatar } from "../ui/basicos";
import { Botao } from "../ui/botao";

const ATE_ONDE: Record<CandidatoDeAntes["ate_onde"], string> = {
  finalista: "foi finalista",
  entrevista: "chegou à entrevista",
  match: "você aceitou",
};

/**
 * Chamar de novo: quem já se candidatou às suas vagas, com o Convidar de Talentos em cada um, a caixa de marcar
 * para convidar vários de uma vez e, para quem já deu match fora do "só pelo chat", o WhatsApp com a mensagem pronta.
 */
export function ChamarDeNovo({
  anuncioId,
  vaga,
  quem,
  link,
  candidatos,
  agora,
}: {
  anuncioId: string;
  vaga: string;
  quem: string;
  link: string;
  candidatos: CandidatoDeAntes[];
  agora: number;
}) {
  return (
    <ConviteEmLote vagas={[{ id: anuncioId, titulo: vaga }]}>
      <div className="flex flex-col gap-3">
        <MarcarTodos perfis={candidatos.filter((c) => !c.convidado).map((c) => c.perfil_id)} />
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
          {candidatos.map((c) => (
            <Linha key={c.perfil_id} anuncioId={anuncioId} vaga={vaga} quem={quem} link={link} c={c} agora={agora} />
          ))}
        </ul>
      </div>
    </ConviteEmLote>
  );
}

function Linha({
  anuncioId,
  vaga,
  quem,
  link,
  c,
  agora,
}: {
  anuncioId: string;
  vaga: string;
  quem: string;
  link: string;
  c: CandidatoDeAntes;
  agora: number;
}) {
  const [pendente, iniciar] = useTransition();
  const [convidado, setConvidado] = useState(c.convidado);
  const [erro, setErro] = useState<string | null>(null);
  const primeiroNome = c.nome.split(" ")[0];
  const mensagem = `Oi, ${primeiroNome}! Aqui é da ${quem}. Você participou da nossa vaga "${c.vaga}" e lembramos de você para a vaga "${vaga}". Se tiver interesse, curta a vaga no Publike: ${link}`;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar nome={c.nome} foto={c.foto} tamanho={40} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-label break-words">{c.nome}</p>
        <p className="text-body-sm text-ink-muted">
          {formatarLugar(c.bairro, c.cidade)} · Em {c.vaga}, {ATE_ONDE[c.ate_onde]} (
          {tempoRelativo(c.candidatou_em, agora)})
        </p>
        {erro && (
          <p role="alert" className="text-body-sm text-danger">
            {erro}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {c.whatsapp && (
          <a
            href={linkWhatsApp(c.whatsapp, mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-surface-200 px-3 text-label hover:bg-surface-300"
            aria-label={`Chamar ${c.nome} no WhatsApp`}
          >
            <MessageCircle aria-hidden className="size-4" />
            WhatsApp
          </a>
        )}
        {convidado ? (
          <span className="inline-flex items-center gap-1.5 text-body-sm text-cerrado-text">
            <Check aria-hidden className="size-4" />
            Convidado
          </span>
        ) : (
          <>
            <MarcarConvite perfilId={c.perfil_id} nome={c.nome} />
            <Botao
              tamanho="sm"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  setErro(null);
                  const r = await chamarAcao(() => convidarParaVaga(anuncioId, c.perfil_id));
                  if (r.ok) setConvidado(true);
                  else setErro(r.erro);
                })
              }
              aria-label={`Convidar ${c.nome}`}
            >
              <Send aria-hidden />
              Convidar
            </Botao>
          </>
        )}
      </div>
    </li>
  );
}
