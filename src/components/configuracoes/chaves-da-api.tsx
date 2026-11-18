"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apagarChaveApi, criarChaveApi } from "@/lib/acoes/api";
import { tempoRelativo } from "@/lib/formato";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

// As chaves da API em Configurações › API (migração 20270713120000): criar (a chave inteira aparece uma vez só, para
// copiar), ver quais existem e quando foram usadas, e apagar.

export type ChaveDaApi = {
  id: string;
  nome: string;
  prefixo: string;
  criada_em: string;
  usada_em: string | null;
  criada_por: string | null;
};

export function ChavesDaApi({ chaves, maximo, agora }: { chaves: ChaveDaApi[]; maximo: number; agora: number }) {
  const criar = useAcao();
  const [nome, setNome] = useState("");
  const [nova, setNova] = useState<{ nome: string; chave: string } | null>(null);
  const [copiada, setCopiada] = useState(false);
  const cheio = chaves.length >= maximo;

  function enviar(e: FormEvent) {
    e.preventDefault();
    const pedido = nome.trim();
    criar.rodar(
      () => criarChaveApi(pedido),
      (r) => {
        if (r.ok && "chave" in r && typeof r.chave === "string") {
          setNova({ nome: pedido, chave: r.chave });
          setCopiada(false);
          setNome("");
        }
      },
    );
  }

  async function copiar() {
    if (!nova) return;
    try {
      await navigator.clipboard.writeText(nova.chave);
      setCopiada(true);
    } catch {
      // sem a área de transferência (navegador antigo ou sem permissão): a pessoa seleciona e copia
      setCopiada(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {nova && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-100 p-3 sm:p-4">
          <p className="text-label">Chave “{nova.nome}” criada</p>
          <p className="text-body-sm text-ink-muted">
            Copie agora e guarde no seu sistema: por segurança, ela não aparece de novo. Quem tem a chave vê os
            candidatos das suas vagas, então trate como uma senha.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-sm bg-surface-300 px-2.5 py-2 font-mono text-[13px] break-all select-all">
              {nova.chave}
            </code>
            <Botao variante="secundario" tamanho="sm" onClick={copiar}>
              {copiada ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiada ? "Copiada" : "Copiar"}
            </Botao>
          </div>
        </div>
      )}

      {chaves.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Chaves da API">
          {chaves.map((k) => (
            <ItemDaChave key={k.id} chave={k} agora={agora} />
          ))}
        </ul>
      )}

      {cheio ? (
        <p className="text-body-sm text-ink-muted">
          A conta já tem {maximo} chaves, o máximo. Apague uma que não usa mais para criar outra.
        </p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-2">
          <label htmlFor="nome-da-chave" className="text-label">
            {chaves.length ? "Nova chave" : "Crie a primeira chave"}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="nome-da-chave"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={60}
              placeholder="Para que é, como “CRM da agência”"
              className="min-h-11 min-w-0 flex-1 basis-56 rounded-md border border-line-strong bg-surface-100 px-3 text-body"
            />
            <Botao type="submit" variante="primario" disabled={criar.pendente || !nome.trim()}>
              <KeyRound aria-hidden />
              {criar.pendente ? "Criando…" : "Criar chave"}
            </Botao>
          </div>
          {criar.mensagem}
        </form>
      )}
    </div>
  );
}

function ItemDaChave({ chave: k, agora }: { chave: ChaveDaApi; agora: number }) {
  const apagar = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  const criada = new Date(k.criada_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <li className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-label break-words">{k.nome}</p>
          <p className="text-body-sm text-ink-muted">
            <code className="font-mono text-[13px]">{k.prefixo}…</code> · criada em {criada}
            {k.criada_por ? ` por ${k.criada_por}` : ""} ·{" "}
            {k.usada_em ? `usada ${tempoRelativo(k.usada_em, agora)}` : "ainda não usada"}
          </p>
        </div>
        {!confirmar && (
          <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmar(true)} className="-mr-2">
            <Trash2 aria-hidden />
            Apagar<span className="sr-only"> a chave {k.nome}</span>
          </Botao>
        )}
      </div>
      {confirmar && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <p className="text-body-sm">
            Apagar a chave “{k.nome}”? O sistema que usa ela para de receber os candidatos na hora.
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="perigo"
              tamanho="sm"
              disabled={apagar.pendente}
              onClick={() => apagar.rodar(() => apagarChaveApi(k.id))}
            >
              {apagar.pendente ? "Apagando…" : "Apagar a chave"}
            </Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmar(false)}>
              Cancelar
            </Botao>
          </div>
          {apagar.mensagem}
        </div>
      )}
    </li>
  );
}
