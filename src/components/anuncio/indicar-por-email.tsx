"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { DicaDeNovidade, usarDica } from "@/components/ui/dica-de-novidade";
import { Botao, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { useAcao } from "@/components/ui/usar-acao";
import { indicarPorEmail } from "@/lib/acoes/indicacao-email";

// "Mandar por e-mail" no quadro "Conhece quem faria essa vaga?" (claude/plano-comentarios-e-indicar-por-email.md,
// parte 1): o e-mail do amigo e o nome (opcional). Sem recado livre. Quem não entrou vai entrar e volta para cá.

export function IndicarPorEmail({ anuncioId, logado }: { anuncioId: string; logado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const { rodar, pendente, mensagem } = useAcao();
  const id = useId();

  const botao = logado ? (
    <Botao
      variante="secundario"
      tamanho="sm"
      onClick={() => {
        setAberto((a) => !a);
        setEnviado(null);
      }}
      aria-expanded={aberto}
      aria-controls={`${id}-form`}
    >
      <Mail aria-hidden />
      Mandar por e-mail
    </Botao>
  ) : (
    <Link href={`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}#indicar`)}`} className={classesBotao("secundario", "sm")}>
      <Mail aria-hidden />
      Mandar por e-mail
    </Link>
  );

  function mandar(e: FormEvent) {
    e.preventDefault();
    rodar(
      () => indicarPorEmail(anuncioId, email, nome),
      (r) => {
        if (!r.ok) return;
        setEnviado(r.mensagem ?? "Pronto, mandamos a vaga.");
        setEmail("");
        setNome("");
        usarDica("indicar-email");
      },
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <DicaDeNovidade chave="indicar-email" logado={logado}>
        <div>{botao}</div>
      </DicaDeNovidade>
      {aberto && (
        <div id={`${id}-form`} className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-3">
          {enviado ? (
            <>
              <p role="status" className="text-body-sm text-cerrado-text">
                {enviado}
              </p>
              <p className="text-body-sm text-ink-muted">
                Se a pessoa ainda não tiver conta, ela cria em um toque pelo link do e-mail.
              </p>
              <Botao variante="secundario" tamanho="sm" className="self-start" onClick={() => setEnviado(null)}>
                Indicar outra pessoa
              </Botao>
            </>
          ) : (
            <form onSubmit={mandar} className="flex flex-col gap-3" noValidate>
              <label className="flex flex-col gap-1">
                <span className="text-label">E-mail do seu amigo</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  required
                  maxLength={200}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={classesEntrada}
                  placeholder="nome@gmail.com"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-label">
                  Nome dele <span className="font-normal text-ink-muted">(opcional)</span>
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  maxLength={60}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={classesEntrada}
                  placeholder="Para o e-mail começar com “Oi, Ana”"
                />
              </label>
              <p className="text-body-sm text-ink-muted">
                Mandamos a vaga em seu nome, sem recado. A pessoa pode parar de receber indicações com um toque.
              </p>
              <Botao type="submit" tamanho="sm" className="self-start" disabled={pendente}>
                {pendente ? "Mandando…" : "Mandar indicação"}
              </Botao>
              {mensagem}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
