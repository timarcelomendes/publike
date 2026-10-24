"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { apagarChaveServidor, criarChaveServidor, type EstadoChave } from "@/lib/acoes/admin";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

const INICIAL: EstadoChave = { ok: false };
const criarChaveProtegido = protegerAcao(criarChaveServidor);

export function FormNovaChave() {
  const [estado, acao, enviando] = useActionState(criarChaveProtegido, INICIAL);
  const [copiado, setCopiado] = useState(false);
  // só o valor: na Vercel, a linha inteira colada no campo Value vira o valor (com o nome junto)
  const chave = estado.chave ?? "";

  return (
    <div className="flex flex-col gap-4">
      <form action={acao} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Campo
          rotulo="Nome da chave"
          nome="nome"
          erro={estado.erros?.nome}
          ajuda="Onde ela vai ser usada, para você lembrar depois."
          className="flex-1"
        >
          <input
            {...ligarCampo("nome", estado.erros?.nome, true)}
            maxLength={60}
            placeholder="Ex.: Vercel"
            className={classesEntrada}
          />
        </Campo>
        <Botao type="submit" disabled={enviando} className="sm:mb-7">
          <KeyRound aria-hidden />
          {enviando ? "Gerando…" : "Gerar chave"}
        </Botao>
      </form>
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.chave && (
        <Aviso tipo="alerta" titulo={`Chave “${estado.nome}” criada. Copie agora: ela não aparece de novo.`}>
          <p>
            Na Vercel (Settings › Environment Variables), abra PUBLIKE_CHAVE_SERVIDOR, cole só o valor abaixo no campo
            Value e faça um Redeploy: a chave nova só vale depois de publicar o site de novo. Não mande a chave por chat
            nem e-mail.
          </p>
          <code className="mt-2 block rounded-sm bg-surface-200 p-3 font-mono text-body-sm break-all select-all">
            {chave}
          </code>
          <div className="mt-2">
            <Botao
              tamanho="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(chave);
                setCopiado(true);
              }}
            >
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiado ? "Valor copiado" : "Copiar o valor"}
            </Botao>
          </div>
        </Aviso>
      )}
    </div>
  );
}

export function BotaoApagarChave({ id, nome }: { id: number; nome: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      {confirmar ? (
        <span className="flex flex-wrap items-center justify-end gap-2 text-body-sm">
          Apagar “{nome}”?
          <Botao tamanho="sm" variante="perigo" disabled={pendente} onClick={() => rodar(() => apagarChaveServidor(id))}>
            Sim, apagar
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
            Cancelar
          </Botao>
        </span>
      ) : (
        <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
          <Trash2 aria-hidden />
          Apagar
        </Botao>
      )}
      {mensagem}
    </div>
  );
}

/** Os segredos que o site usa e onde cada um vai (o valor é só um texto aleatório, igual nos lugares). */
const SEGREDOS = [
  {
    valor: "cron",
    nome: "CRON_SECRET (tarefas agendadas)",
    passos: [
      "Na Vercel (Settings › Environment Variables), crie CRON_SECRET em Production com este valor e faça um Redeploy.",
      "No GitHub (Settings › Secrets and variables › Actions), crie o segredo PUBLIKE_CRON_SECRET com o mesmo valor.",
      "Para testar: GitHub › Actions › Filas do site › Run workflow (verde = funcionando).",
    ],
  },
  {
    valor: "outro",
    nome: "Outro segredo",
    passos: ["Cole o valor no lugar que pediu o segredo (só o valor, sem o nome na frente)."],
  },
] as const;

/** 32 bytes aleatórios em base64url, gerados no navegador: nada passa pelo servidor nem fica guardado. */
function segredoNovo() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Gera um segredo qualquer (como o CRON_SECRET) e diz onde colar. Não guarda: copie na hora. */
export function GeradorDeSegredo() {
  const [tipo, setTipo] = useState<(typeof SEGREDOS)[number]["valor"]>("cron");
  const [valor, setValor] = useState("");
  const [copiado, setCopiado] = useState(false);
  const escolhido = SEGREDOS.find((s) => s.valor === tipo) ?? SEGREDOS[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-label">Para que é</span>
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as typeof tipo);
              setValor("");
              setCopiado(false);
            }}
            className={classesEntrada}
          >
            {SEGREDOS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <Botao
          type="button"
          onClick={() => {
            setValor(segredoNovo());
            setCopiado(false);
          }}
        >
          <KeyRound aria-hidden />
          Gerar segredo
        </Botao>
      </div>
      {valor && (
        <Aviso tipo="alerta" titulo="Segredo gerado. Copie agora: ele não fica guardado em lugar nenhum.">
          <code className="mt-1 block rounded-sm bg-surface-200 p-3 font-mono text-body-sm break-all select-all">
            {valor}
          </code>
          <div className="mt-2">
            <Botao
              tamanho="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(valor);
                setCopiado(true);
              }}
            >
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiado ? "Valor copiado" : "Copiar o valor"}
            </Botao>
          </div>
          <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5">
            {escolhido.passos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <p className="mt-2">Não mande o segredo por chat nem e-mail.</p>
        </Aviso>
      )}
    </div>
  );
}
