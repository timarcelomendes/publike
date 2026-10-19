"use client";

import { Check, Inbox, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { convidarParaVaga } from "@/lib/acoes/talentos";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

type VagaParaConvite = { id: string; titulo: string; convidado: boolean; curtiu: boolean };

/**
 * Convidar alguém da aba Talentos para uma vaga minha que está no ar. A pessoa recebe o aviso,
 * vê a vaga e decide se curte; curtindo, chega na caixa de entrada, e o contato sai no match.
 */
export function ConvidarTalento({
  perfilId,
  nome,
  vagas,
}: {
  perfilId: string;
  nome: string;
  vagas: VagaParaConvite[];
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [convidadas, setConvidadas] = useState(() => new Set(vagas.filter((v) => v.convidado).map((v) => v.id)));
  const [escolhida, setEscolhida] = useState(() => (vagas.find((v) => !v.convidado && !v.curtiu) ?? vagas[0]).id);
  // a vaga do último convite: o erro (se deu) aparece só embaixo dela
  const [ultima, setUltima] = useState<string | null>(null);
  const vaga = vagas.find((v) => v.id === escolhida) ?? vagas[0];
  const primeiroNome = nome.split(" ")[0];

  return (
    <section
      aria-labelledby="convidar-titulo"
      className="flex flex-col gap-3 rounded-lg border-2 border-terra bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <h2 id="convidar-titulo" className="text-h3">
        Convidar {primeiroNome} para uma vaga
      </h2>
      <p className="-mt-1 text-body-sm text-ink-muted">
        {primeiroNome} recebe o convite, vê a vaga e decide se curte. Se curtir, chega na sua caixa de entrada, e o
        WhatsApp dos dois aparece no match.
      </p>
      {vagas.length === 1 && (
        <p className="text-body-sm">
          Vaga: <span className="text-label">{vaga.titulo}</span>
        </p>
      )}
      {vagas.length > 1 && (
        <div className="flex flex-col gap-1.5 sm:max-w-md">
          <label htmlFor="vaga-convite" className="text-label">
            Vaga
          </label>
          <Seletor
            id="vaga-convite"
            value={escolhida}
            onChange={(e) => setEscolhida(e.target.value)}
            className={classesEntrada}
          >
            {vagas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.titulo}
                {v.curtiu ? " (já curtiu)" : convidadas.has(v.id) ? " (convite enviado)" : ""}
              </option>
            ))}
          </Seletor>
        </div>
      )}
      {vaga.curtiu ? (
        <p className="flex flex-wrap items-center gap-2 text-body-sm">
          <Inbox aria-hidden className="size-4 shrink-0 text-ink-muted" />
          {primeiroNome} já curtiu “{vaga.titulo}”: está na sua caixa de entrada.
          <Link href="/painel/caixa" className="text-label underline underline-offset-2">
            Abrir a caixa de entrada
          </Link>
        </p>
      ) : convidadas.has(vaga.id) ? (
        <p role="status" className="inline-flex items-center gap-1.5 text-label text-cerrado-text">
          <Check aria-hidden className="size-[18px] shrink-0" />
          Convite enviado para “{vaga.titulo}”
        </p>
      ) : (
        <Botao
          variante="primario"
          disabled={pendente}
          className="self-start"
          onClick={() => {
            setUltima(vaga.id);
            rodar(
              () => convidarParaVaga(vaga.id, perfilId),
              (r) => r.ok && setConvidadas((atual) => new Set(atual).add(vaga.id)),
            );
          }}
        >
          <Send aria-hidden />
          {pendente ? "Convidando…" : "Convidar para a vaga"}
        </Botao>
      )}
      {ultima === vaga.id && !convidadas.has(vaga.id) && mensagem}
    </section>
  );
}
