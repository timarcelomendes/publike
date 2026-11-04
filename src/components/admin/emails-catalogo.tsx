"use client";

import { Power } from "lucide-react";
import { useActionState, useState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { ligarEmail, mudarIntervaloEmail, salvarParametrosEmail } from "@/lib/acoes/admin";
import type { ParametrosEmail } from "@/lib/admin/dados";
import { DIAS_DA_SEMANA, textoDoIntervalo } from "@/lib/emails/catalogo";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

const INICIAL: EstadoForm = { ok: false };
const salvarParametrosProtegido = protegerAcao(salvarParametrosEmail);

/** Ligar e desligar um e-mail do catálogo (Admin › E-mails › Todos). */
export function LigarEmail({ modelo, nome, ligado }: { modelo: string; nome: string; ligado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Botao
        tamanho="sm"
        variante={ligado ? "secundario" : "sucesso"}
        disabled={pendente}
        aria-label={ligado ? `Desligar o e-mail ${nome}` : `Ligar o e-mail ${nome}`}
        onClick={() => rodar(() => ligarEmail(modelo, !ligado))}
      >
        <Power aria-hidden />
        {ligado ? "Desligar" : "Ligar"}
      </Botao>
      {mensagem}
    </div>
  );
}

type Unidade = "min" | "h";

/** "No máximo 1 a cada N" de um e-mail, para a mesma pessoa (em branco: sem limite). */
export function IntervaloEmail({ modelo, nome, minutos }: { modelo: string; nome: string; minutos: number | null }) {
  const { rodar, pendente, mensagem } = useAcao();
  const emHoras = minutos !== null && minutos >= 60 && minutos % 60 === 0;
  const [valor, setValor] = useState(minutos === null ? "" : String(emHoras ? minutos / 60 : minutos));
  const [unidade, setUnidade] = useState<Unidade>(emHoras ? "h" : "min");
  const salvar = () => {
    const n = valor.trim() === "" ? null : Number(valor.replace(",", "."));
    const total = n === null ? null : Math.round(unidade === "h" ? n * 60 : n);
    rodar(() => mudarIntervaloEmail(modelo, total));
  };
  return (
    <details className="text-body-sm">
      <summary className="min-h-9 cursor-pointer text-label underline underline-offset-2">
        {minutos ? `Mudar a frequência (agora: 1 a cada ${textoDoIntervalo(minutos)})` : "Pôr limite de frequência"}
      </summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-label">No máximo 1 a cada</span>
          <input
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
            aria-label={`Intervalo do e-mail ${nome}`}
            placeholder="sem limite"
            className={`${classesEntrada} max-w-32`}
          />
        </label>
        <Seletor
          aria-label={`Unidade do intervalo do e-mail ${nome}`}
          value={unidade}
          onChange={(e) => setUnidade(e.target.value === "h" ? "h" : "min")}
          className={`${classesEntrada} max-w-36`}
        >
          <option value="min">minutos</option>
          <option value="h">horas</option>
        </Seletor>
        <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={salvar}>
          Salvar
        </Botao>
      </div>
      <p className="mt-1 text-ink-muted">Para a mesma pessoa. Em branco, sem limite (até 7 dias).</p>
      {mensagem}
    </details>
  );
}

/** Os números que valem para todos: o limite por dia, o dia e a hora da semana e o Volte a contratar. */
export function FormParametrosEmail({ numeros }: { numeros: ParametrosEmail }) {
  const [estado, acao, enviando] = useActionState(salvarParametrosProtegido, INICIAL);
  const erros = estado.erros ?? {};
  const numero = (nome: keyof ParametrosEmail, rotulo: string, ajuda?: string) => (
    <Campo rotulo={rotulo} nome={nome} erro={erros[nome]} ajuda={ajuda}>
      <input
        {...ligarCampo(nome, erros[nome])}
        inputMode="numeric"
        defaultValue={String(numeros[nome])}
        className={`${classesEntrada} max-w-32`}
      />
    </Campo>
  );
  return (
    <form action={acao} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">Todos os e-mails</legend>
        {numero(
          "por_dia",
          "Por dia, para a mesma pessoa",
          "Somando todos os e-mails (os de conta e de moderação passam sempre).",
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">Da semana (vagas, talentos, resumo e Volte a contratar)</legend>
        <div className="flex flex-wrap gap-4">
          <Campo rotulo="Dia" nome="semana_dia" erro={erros.semana_dia}>
            <Seletor
              {...ligarCampo("semana_dia", erros.semana_dia)}
              defaultValue={String(numeros.semana_dia)}
              className={`${classesEntrada} max-w-44`}
            >
              {DIAS_DA_SEMANA.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Seletor>
          </Campo>
          <Campo rotulo="A partir das" nome="semana_hora" erro={erros.semana_hora}>
            <Seletor
              {...ligarCampo("semana_hora", erros.semana_hora)}
              defaultValue={String(numeros.semana_hora)}
              className={`${classesEntrada} max-w-32`}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </Seletor>
          </Campo>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">Volte a contratar</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {numero("reativar_sem_vaga_dias", "Dias sem vaga no ar", "A última vaga saiu há pelo menos tantos dias.")}
          {numero("reativar_janela_dias", "Vagas de antes dos últimos (dias)", "Só conta quem teve vaga nesse tempo.")}
          {numero("reativar_intervalo_dias", "Dias entre um aviso e outro")}
          {numero("reativar_max_seguidos", "Avisos seguidos sem publicar", "Depois disso, para.")}
          {numero("reativar_minimo_talentos", "Mínimo de talentos que combinam", "Com menos, o aviso não sai.")}
        </div>
      </fieldset>
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
      <div>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar os números"}
        </Botao>
      </div>
    </form>
  );
}
