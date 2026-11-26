"use client";

import { Check, CircleCheckBig, Clock, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { responderQuemContratou } from "@/lib/acoes/quem-contratou";
import { formatarDataCurta } from "@/lib/formato";

/** "20/11" (o ano não cabe na linha do celular e quase sempre é o deste ano). */
const diaMes = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
import {
  completaPorPadrao,
  quemFoiEscolhido,
  type PerguntaQuemContratou,
  type RespostaQuemContratou,
} from "@/lib/quem-contratou";
import { Aviso, Avatar } from "../ui/basicos";
import { Botao, BotaoLink } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/**
 * "Quem você contratou?" pelo link (migração 20271006120000): os aceitos para tocar (mais de um vale), "A vaga está
 * completa" (tira do ar e avisa quem ficou), "Ainda não contratei" e "Não contratei ninguém daqui". `marcadas` e
 * `parte` vêm do botão do e-mail (?p=, ?r=): já abrem escolhidas, mas só valem com o toque aqui.
 */
export function ResponderQuemContratou({
  token,
  pergunta,
  marcadas,
  parte,
}: {
  token: string;
  pergunta: PerguntaQuemContratou;
  marcadas: string[];
  parte: "ainda_nao" | "ninguem" | null;
}) {
  const jaRespondeu = pergunta.resposta === "contratei" || pergunta.resposta === "ninguem";
  const [mudando, setMudando] = useState(!jaRespondeu || marcadas.length > 0 || parte !== null);
  const [escolhidas, setEscolhidas] = useState<string[]>(marcadas);
  const [completa, setCompleta] = useState(() => completaPorPadrao(pergunta, marcadas));
  const [mexeuNaCompleta, setMexeuNaCompleta] = useState(false);
  const [ninguem, setNinguem] = useState(parte === "ninguem");
  const [preenchida, setPreenchida] = useState(false);
  const [feito, setFeito] = useState<{ resposta: RespostaQuemContratou; frase: string } | null>(null);
  // com muita gente (o contato direto chega a dezenas), a busca pelo nome
  const [busca, setBusca] = useState("");
  const { rodar, pendente, mensagem } = useAcao();

  const nomeDe = new Map(pergunta.pessoas.map((p) => [p.id, p.nome]));
  const nomesEscolhidos = escolhidas.map((id) => nomeDe.get(id) ?? "Alguém");
  const contratados = pergunta.pessoas.filter((p) => p.contratado);
  // com alguém em Contratados, "Ainda não" e "Ninguém daqui" não combinam (tirar de Contratados é no quadro)
  const temContratados = contratados.length > 0;

  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visiveis = busca.trim()
    ? pergunta.pessoas.filter((p) => semAcento(p.nome).includes(semAcento(busca.trim())))
    : pergunta.pessoas;

  function alternar(id: string) {
    const proximas = escolhidas.includes(id) ? escolhidas.filter((x) => x !== id) : [...escolhidas, id];
    setEscolhidas(proximas);
    if (!mexeuNaCompleta) setCompleta(completaPorPadrao(pergunta, proximas));
  }

  function responder(resposta: RespostaQuemContratou, perfis: string[] = [], tirarDoAr = false) {
    rodar(
      () => responderQuemContratou(token, resposta, perfis, tirarDoAr),
      (r) => r.ok && setFeito({ resposta, frase: r.mensagem ?? "Obrigado por contar!" }),
    );
  }

  if (feito) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso
          tipo="sucesso"
          titulo={
            feito.resposta === "contratei"
              ? `Pronto: ${quemFoiEscolhido(nomesEscolhidos)} em Contratados`
              : feito.resposta === "ninguem"
                ? "Resposta guardada"
                : "Combinado"
          }
        >
          {feito.frase}
        </Aviso>
        <div className="flex flex-col gap-2 sm:flex-row">
          {feito.resposta !== "ainda_nao" && (
            <BotaoLink href="/publicar" variante="primario">
              Publicar outra vaga
            </BotaoLink>
          )}
          <BotaoLink href={`/painel/anuncio/${pergunta.anuncio_id}/quadro`} variante="secundario">
            Ver os candidatos
          </BotaoLink>
        </div>
      </div>
    );
  }

  if (!mudando) {
    const quando = pergunta.respondida_em ? `Em ${formatarDataCurta(pergunta.respondida_em)}, você` : "Você";
    const quem = quemFoiEscolhido(contratados.map((p) => p.nome));
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h2">Quem você contratou?</h1>
        <Aviso tipo="sucesso" titulo="Você já respondeu">
          {pergunta.resposta === "contratei" && contratados.length
            ? `${quando} contou que contratou ${quem}${quem.endsWith(".") ? "" : "."} Obrigado!`
            : `${quando} contou que não contratou ninguém que veio pelo Publike. Obrigado!`}
        </Aviso>
        <Botao variante="secundario" className="self-start" onClick={() => setMudando(true)}>
          Mudar a resposta
        </Botao>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">Quem você contratou?</h1>
        <p className="text-body text-ink-muted">
          {pergunta.contato_direto
            ? "Estas pessoas receberam o seu contato pelo Publike. Toque em quem foi contratado (pode ser mais de uma)."
            : "Toque em quem foi contratado pelo Publike (pode ser mais de uma pessoa)."}{" "}
          Quem você escolher recebe os parabéns, e quem ficou recebe o retorno.
        </p>
      </div>

      {parte === "ainda_nao" && !temContratados && (
        <div className="flex flex-col gap-3 rounded-md border border-terra/40 bg-terra-soft p-4">
          <p className="text-body-sm">
            Ainda não contratou? Confirme com um toque: a vaga continua no ar
            {pergunta.no_ar ? " e aparece como confirmada para quem procura" : ""}, e a gente pergunta de novo em uma
            semana.
          </p>
          <Botao variante="primario" className="self-start" disabled={pendente} onClick={() => responder("ainda_nao")}>
            <Clock aria-hidden />
            Ainda não contratei
          </Botao>
        </div>
      )}

      {pergunta.pessoas.length > 8 && (
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar pelo nome"
          aria-label="Procurar pelo nome"
          className="min-h-11 rounded-md border border-line bg-surface-100 px-3 text-body"
        />
      )}
      <ul className="flex flex-col gap-2" aria-label={pergunta.contato_direto ? "Quem recebeu o seu contato" : "Quem foi aceito na vaga"}>
        {visiveis.length === 0 && <li className="text-body-sm text-ink-muted">Ninguém com esse nome.</li>}
        {visiveis.map((p) => {
          const marcada = p.contratado || escolhidas.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={marcada}
                disabled={p.contratado || pendente}
                onClick={() => alternar(p.id)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-default ${
                  marcada ? "border-cerrado bg-cerrado/10" : "border-line bg-surface-100 hover:border-line-strong"
                }`}
              >
                <Avatar nome={p.nome} foto={p.foto} tamanho={40} colorida />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label">{p.nome}</span>
                  <span className="block text-caption text-ink-muted">
                    {p.contratado
                      ? "Já está em Contratados"
                      : !p.aceito_em
                        ? pergunta.contato_direto
                          ? "Recebeu o seu contato"
                          : "Aceita na vaga"
                        : pergunta.contato_direto
                          ? `Recebeu o seu contato em ${diaMes(p.aceito_em)}`
                          : `Aceita em ${diaMes(p.aceito_em)}`}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-pill border ${
                    marcada ? "border-transparent bg-cerrado text-on-cerrado" : "border-line-strong"
                  }`}
                >
                  {marcada && <Check className="size-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {escolhidas.length > 0 && pergunta.no_ar && (
        <label className="flex items-start gap-3 rounded-md border border-line p-3">
          <input
            type="checkbox"
            checked={completa}
            onChange={(e) => {
              setCompleta(e.target.checked);
              setMexeuNaCompleta(true);
            }}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-terra)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-label">A vaga está completa</span>
            <span className="text-body-sm text-ink-muted">
              Tirar a vaga do ar e avisar quem não foi escolhido, para ninguém ficar esperando.
            </span>
          </span>
        </label>
      )}

      <Botao
        variante="primario"
        className="w-full sm:w-auto sm:self-start"
        disabled={!escolhidas.length || pendente}
        onClick={() => responder("contratei", escolhidas, completa && pergunta.no_ar)}
      >
        <CircleCheckBig aria-hidden />
        {escolhidas.length ? `Contratei ${quemFoiEscolhido(nomesEscolhidos)}` : "Toque em quem você contratou"}
      </Botao>

      {temContratados ? (
        <p className="border-t border-line pt-4 text-body-sm text-ink-muted">
          Contratou mais alguém? Toque em quem foi. Para tirar alguém de Contratados, use o{" "}
          <Link href={`/painel/anuncio/${pergunta.anuncio_id}/quadro`} className="underline underline-offset-2">
            quadro da vaga
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap">
          {parte !== "ainda_nao" && (
            <Botao variante="secundario" disabled={pendente} onClick={() => responder("ainda_nao")}>
              <Clock aria-hidden />
              Ainda não contratei
            </Botao>
          )}
          <Botao variante="fantasma" disabled={pendente} onClick={() => setNinguem((x) => !x)} aria-expanded={ninguem}>
            <UserX aria-hidden />
            Não contratei ninguém daqui
          </Botao>
        </div>
      )}

      {ninguem && !temContratados && (
        <div className="flex flex-col gap-3 rounded-md border border-line p-4">
          <p className="text-label">Não contratou ninguém que veio pelo Publike?</p>
          {pergunta.no_ar && (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={preenchida}
                onChange={(e) => setPreenchida(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-terra)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-label">A vaga já foi preenchida</span>
                <span className="text-body-sm text-ink-muted">
                  Contratei de outro lugar: tirar do ar e avisar quem esperava.
                </span>
              </span>
            </label>
          )}
          <Botao
            variante="secundario"
            className="self-start"
            disabled={pendente}
            onClick={() => responder("ninguem", [], preenchida && pergunta.no_ar)}
          >
            Confirmar: ninguém daqui
          </Botao>
        </div>
      )}
      {mensagem}
    </div>
  );
}
