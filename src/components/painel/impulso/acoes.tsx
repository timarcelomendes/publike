"use client";

import { LoaderCircle, Rocket, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { cancelarImpulso, impulsionarSemPagar, pararPacote, usarSaldoDeCandidatos } from "@/lib/acoes/impulso";
import { Botao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";

/** Impulsionar sem pagar: com os dias de crédito ou o primeiro grátis. */
export function ImpulsionarSemPagar({
  anuncio,
  jeito,
  dias,
}: {
  anuncio: string;
  jeito: "credito" | "cortesia";
  dias: number;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao
        variante="primario"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await chamarAcao(() => impulsionarSemPagar(anuncio, jeito));
            if (!r.ok) setErro(r.erro);
          })
        }
      >
        {pendente ? <LoaderCircle aria-hidden className="animate-spin" /> : <Rocket aria-hidden />}
        {jeito === "cortesia" ? `Impulsionar ${dias} dias grátis` : `Usar ${dias} ${dias === 1 ? "dia" : "dias"} de crédito`}
      </Botao>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Desistir antes de o anúncio entrar no ar (com a confirmação no próprio lugar). */
export function CancelarImpulso({ id, origem }: { id: string; origem: "compra" | "credito" | "cortesia" | "admin" }) {
  const [certeza, setCerteza] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const volta =
    origem === "compra"
      ? "O valor volta para você pelo mesmo jeito que pagou."
      : origem === "credito"
        ? "Os dias voltam como crédito."
        : origem === "admin"
          ? "É um impulso de cortesia do Publike: nada foi cobrado."
          : "O impulso grátis fica disponível de novo.";
  if (!certeza)
    return (
      <Botao tamanho="sm" onClick={() => setCerteza(true)}>
        Cancelar o impulso
      </Botao>
    );
  return (
    <div role="group" aria-label="Cancelar o impulso" className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
      <p className="text-body-sm">Cancelar o impulso? {volta}</p>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => cancelarImpulso(id));
              if (!r.ok) setErro(r.erro);
            })
          }
        >
          {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
          Sim, cancelar
        </Botao>
        <Botao tamanho="sm" onClick={() => setCerteza(false)} disabled={pendente}>
          Voltar
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * Parar o pacote de candidatos (com a confirmação no próprio lugar): o que não chegou fica de saldo para outra vaga (no
 * presente do Publike, o pacote só para).
 */
export function PararPacote({
  id,
  origem,
  faltam,
}: {
  id: string;
  origem: "compra" | "credito" | "cortesia" | "admin";
  faltam: number;
}) {
  const [certeza, setCerteza] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const presente = origem === "admin";
  const volta = presente
    ? "A vaga sai do destaque. É um presente do Publike: nada foi cobrado."
    : faltam === 1
      ? "A vaga sai do destaque, e o candidato que falta fica de saldo para outra vaga, por 90 dias."
      : `A vaga sai do destaque, e os ${faltam} candidatos que faltam ficam de saldo para outra vaga, por 90 dias.`;
  if (!certeza)
    return (
      <Botao tamanho="sm" onClick={() => setCerteza(true)} className="self-start">
        {presente ? "Parar o pacote" : "Parar e guardar o saldo"}
      </Botao>
    );
  return (
    <div role="group" aria-label="Parar o pacote" className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
      <p className="text-body-sm">Parar o pacote? {volta}</p>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => pararPacote(id));
              if (!r.ok) setErro(r.erro);
            })
          }
        >
          {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
          Sim, parar
        </Botao>
        <Botao tamanho="sm" onClick={() => setCerteza(false)} disabled={pendente}>
          Voltar
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Usar o saldo de candidatos nesta vaga: escolhe quantos (até o saldo) e o pacote começa na hora. */
export function UsarSaldo({ anuncio, saldo }: { anuncio: string; saldo: number }) {
  const [quantos, setQuantos] = useState(Math.min(saldo, 5));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const opcoes = Array.from({ length: Math.min(saldo, 100) }, (_, n) => n + 1);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-label">Quantos candidatos</span>
          <select
            value={quantos}
            onChange={(e) => setQuantos(Number(e.target.value))}
            className={`${classesEntrada} w-auto min-w-24`}
          >
            {opcoes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Botao
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => usarSaldoDeCandidatos(anuncio, quantos));
              if (!r.ok) setErro(r.erro);
            })
          }
        >
          {pendente ? <LoaderCircle aria-hidden className="animate-spin" /> : <Users aria-hidden />}
          Usar {quantos} {quantos === 1 ? "candidato" : "candidatos"} do saldo
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
