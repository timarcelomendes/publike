"use client";

import { CalendarPlus, CircleCheckBig, CircleX } from "lucide-react";
import { useState } from "react";
import { responderVencimento } from "@/lib/acoes/vencimento";
import { fraseDoVencimento, type RespostaVencimento, type ResultadoVencimento, type SituacaoVencimento } from "@/lib/vencimento";
import { Aviso } from "../ui/basicos";
import { Botao, BotaoLink } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

const diaMesAno = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );

const OPCOES: { id: RespostaVencimento; titulo: string; texto: (s: SituacaoVencimento) => string; icone: typeof CalendarPlus }[] = [
  {
    id: "prorrogar",
    titulo: "Prorrogar",
    texto: (s) => `A vaga ${s.no_ar ? "continua" : "volta"} no ar por mais ${s.prazo_dias} dias.`,
    icone: CalendarPlus,
  },
  {
    id: "preenchi",
    titulo: "Já preenchi",
    texto: (s) =>
      `A vaga sai do ar${s.esperando > 0 ? " e quem esperava recebe o retorno" : ""}${s.aceitos > 0 ? ". Depois, conte quem você contratou" : ""}.`,
    icone: CircleCheckBig,
  },
  {
    id: "encerrar",
    titulo: "Não preciso mais",
    texto: (s) => `A vaga é encerrada${s.esperando > 0 ? " e quem esperava recebe o retorno" : ""}.`,
    icone: CircleX,
  },
];

/** Os três toques do vencimento (migração 20271010120000). `escolhida` vem do botão do e-mail: só deixa marcada. */
export function ResponderVencimento({
  token,
  situacao,
  escolhida,
}: {
  token: string;
  situacao: SituacaoVencimento;
  escolhida: RespostaVencimento | null;
}) {
  const [opcao, setOpcao] = useState<RespostaVencimento | null>(escolhida);
  const [feito, setFeito] = useState<ResultadoVencimento | null>(null);
  const { rodar, pendente, mensagem } = useAcao();

  if (feito) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="sucesso" titulo="Pronto, obrigado!">
          {fraseDoVencimento(feito, feito.expira_em ? diaMesAno(feito.expira_em) : null)}
        </Aviso>
        <div className="flex flex-col gap-2 sm:flex-row">
          {feito.quem_contratou ? (
            <BotaoLink href={feito.quem_contratou} variante="primario">
              Contar quem você contratou
            </BotaoLink>
          ) : feito.resposta === "prorrogar" ? (
            <BotaoLink href={`/anuncio/${situacao.anuncio_id}`} variante="primario">
              Ver a vaga
            </BotaoLink>
          ) : (
            <BotaoLink href="/publicar" variante="primario">
              Publicar outra vaga
            </BotaoLink>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">{situacao.no_ar ? "A sua vaga está para vencer" : "A sua vaga saiu do ar"}</h1>
        <p className="text-body text-ink-muted">
          {situacao.no_ar
            ? `Fica no ar até ${diaMesAno(situacao.expira_em)}.`
            : `O prazo acabou em ${diaMesAno(situacao.expira_em)}.`}{" "}
          {situacao.esperando > 0
            ? `${situacao.esperando === 1 ? "Uma pessoa se candidatou e espera" : `${situacao.esperando} pessoas se candidataram e esperam`} o seu retorno.`
            : "Ainda está contratando?"}
        </p>
      </div>
      <ul className="flex flex-col gap-2" aria-label="O que fazer com a vaga">
        {OPCOES.map((o) => {
          const marcada = opcao === o.id;
          const Icone = o.icone;
          return (
            <li key={o.id}>
              <button
                type="button"
                aria-pressed={marcada}
                disabled={pendente}
                onClick={() => setOpcao(o.id)}
                className={`flex min-h-14 w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                  marcada ? "border-cerrado bg-cerrado/10" : "border-line bg-surface-100 hover:border-line-strong"
                }`}
              >
                <Icone aria-hidden className="mt-0.5 size-5 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-label">{o.titulo}</span>
                  <span className="text-body-sm text-ink-muted">{o.texto(situacao)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {opcao === "prorrogar" && situacao.suspensa && (
        <Aviso tipo="alerta" titulo="Esta vaga está suspensa por falta de retorno">
          Dê o retorno a quem espera no quadro da vaga e ela volta ao ar sozinha.
        </Aviso>
      )}
      <Botao
        variante="primario"
        className="w-full sm:w-auto sm:self-start"
        disabled={!opcao || pendente}
        onClick={() =>
          opcao &&
          rodar(async () => {
            const r = await responderVencimento(token, opcao);
            if (r.ok && r.resultado) setFeito(r.resultado);
            return r;
          })
        }
      >
        {opcao === "prorrogar"
          ? `Prorrogar por ${situacao.prazo_dias} dias`
          : opcao === "preenchi"
            ? "Confirmar: já preenchi"
            : opcao === "encerrar"
              ? "Confirmar: encerrar a vaga"
              : "Escolha uma opção"}
      </Botao>
      {mensagem}
    </div>
  );
}
