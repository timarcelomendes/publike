"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { apagarChaveServidor, criarChaveServidor, type EstadoChave } from "@/lib/acoes/admin";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

const INICIAL: EstadoChave = { ok: false };

export function FormNovaChave() {
  const [estado, acao, enviando] = useActionState(criarChaveServidor, INICIAL);
  const [copiado, setCopiado] = useState(false);
  const linha = estado.chave ? `PUBLIKE_CHAVE_SERVIDOR=${estado.chave}` : "";

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
            placeholder="Ex.: Render"
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
            Cole esta linha nas variáveis de ambiente da hospedagem (no Render: Environment) e
            publique o site de novo. Não mande a chave por chat nem e-mail.
          </p>
          <code className="mt-2 block rounded-sm bg-surface-200 p-3 font-mono text-body-sm break-all select-all">{linha}</code>
          <div className="mt-2">
            <Botao
              tamanho="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(linha);
                setCopiado(true);
              }}
            >
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiado ? "Copiado" : "Copiar"}
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
