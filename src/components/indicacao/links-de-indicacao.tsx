"use client";

import { Link2, LoaderCircle } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { criarLinkDeIndicacao } from "@/lib/acoes/indicacao";
import { plural } from "@/lib/formato";
import { linkComIndicacao } from "@/lib/indicacao";
import type { LinkDeIndicacao } from "@/lib/servidor/indicacao";
import { BotoesDoLink } from "../painel/links-para-mandar";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro } from "../ui/campo";

// "Peça indicação" (claude/plano-painel-feed-indicacao-documentos.md, parte 3): a empresa cria um link para cada pessoa
// que vai indicar (um funcionário, um cliente, o grupo do bairro) e vê quantos candidatos cada link trouxe e quantos
// foram contratados. O prêmio, se tiver, a empresa combina por fora.

export function LinksDeIndicacao({
  anuncioId,
  url,
  vaga,
  links,
}: {
  anuncioId: string;
  url: string;
  vaga: string;
  links: LinkDeIndicacao[];
}) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function criar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setPronto(null);
    iniciar(async () => {
      const r = await chamarAcao(() => criarLinkDeIndicacao(anuncioId, nome));
      if (!r.ok) return setErro(r.erro ?? "Não deu para criar o link agora.");
      setNome("");
      setPronto(r.mensagem ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={criar} className="flex flex-col gap-1.5">
        <label htmlFor="quem-indica" className="text-label">
          Quem vai indicar
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="quem-indica"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={60}
            placeholder="Ex.: João, do caixa"
            autoComplete="off"
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? "quem-indica-erro" : undefined}
            className={`${classesEntrada} min-w-0 flex-1 basis-56`}
          />
          <Botao type="submit" disabled={pendente || nome.trim().length < 2} className="max-sm:w-full">
            {pendente ? <LoaderCircle aria-hidden className="animate-spin" /> : <Link2 aria-hidden />}
            Criar o link
          </Botao>
        </div>
        {erro && <MensagemErro id="quem-indica-erro">{erro}</MensagemErro>}
        {pronto && (
          <p role="status" className="text-body-sm text-cerrado-text">
            {pronto}
          </p>
        )}
      </form>

      {links.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-label">
                  {l.nome}
                  {l.dePessoa && <span className="font-normal text-ink-muted"> (indicou pelo próprio link)</span>}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {l.indicados === 0
                    ? "Ninguém se candidatou por este link ainda."
                    : `${plural(l.indicados, "candidato", "candidatos")}${
                        l.contratados ? `, ${plural(l.contratados, "contratado", "contratados")}` : ""
                      }`}
                </p>
              </div>
              {!l.dePessoa && (
                <div className="flex flex-wrap gap-2">
                  <BotoesDoLink
                    url={linkComIndicacao(url, l.codigo)}
                    nome={`o link de ${l.nome}`}
                    mensagem={`Estamos contratando: ${vaga}. Conhece alguém? Manda este link`}
                    comNome
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
