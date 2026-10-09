"use client";

import { useActionState } from "react";
import { salvarConfigIA } from "@/lib/acoes/admin";
import type { ConfigSite } from "@/lib/admin/dados";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";

const INICIAL: EstadoForm = { ok: false };

type Modelo = { id: string; nome: string; ajuda: string };

function Opcao({ nome, rotulo, ajuda, inicial }: { nome: string; rotulo: string; ajuda: string; inicial: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" name={nome} defaultChecked={inicial} className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]" />
      <span>
        <span className="block text-label">{rotulo}</span>
        <span className="block text-body-sm text-ink-muted">{ajuda}</span>
      </span>
    </label>
  );
}

export function FormConfigIA({ config, modelos }: { config: ConfigSite; modelos: readonly Modelo[] }) {
  const [estado, acao, enviando] = useActionState(salvarConfigIA, INICIAL);
  const atual = modelos.some((m) => m.id === config.ia_modelo) ? config.ia_modelo : modelos[0].id;
  return (
    <form action={acao} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-label">O que a IA faz</legend>
        <Opcao
          nome="ia_moderacao"
          rotulo="Moderação automática"
          ajuda="Revisa cada anúncio novo ou editado. Se achar golpe, cobrança, discriminação ou trabalho infantil, tira do ar até a moderação olhar."
          inicial={config.ia_moderacao}
        />
        <Opcao
          nome="ia_melhorar_texto"
          rotulo="Ajuda da IA para quem usa o site"
          ajuda="“Melhorar texto” ao publicar (até 20 vezes por dia por pessoa) e a ordem das vagas no Descobrir (até 12 por dia, guardadas por 6 horas)."
          inicial={config.ia_melhorar_texto}
        />
        <Opcao
          nome="ia_resumo"
          rotulo="Resumo no painel"
          ajuda="Um resumo da semana com sinais de alerta e sugestões, quando você pedir."
          inicial={config.ia_resumo}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Modelo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {modelos.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer flex-col rounded-md border border-line-strong bg-surface-200 px-3 py-2.5 transition-colors has-[:checked]:border-ink has-[:checked]:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input type="radio" name="ia_modelo" value={m.id} defaultChecked={m.id === atual} className="sr-only" />
              <span className="text-label">{m.nome}</span>
              <span className="text-body-sm text-ink-muted">{m.ajuda}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
      <div>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar"}
        </Botao>
      </div>
    </form>
  );
}
