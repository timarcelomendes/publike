"use client";

import { useActionState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { salvarConfigIA } from "@/lib/acoes/admin";
import { FUNCIONALIDADES_IA } from "@/lib/ia-nomes";
import type { ConfigSite } from "@/lib/admin/dados";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";

const INICIAL: EstadoForm = { ok: false };
const salvarConfigIAProtegido = protegerAcao(salvarConfigIA);

type Modelo = { id: string; nome: string; ajuda: string; provedor: "openai" | "claude" };
/** Quais IAs têm a chave neste servidor. */
type Chaves = { openai: boolean; claude: boolean };

const NOME_PROVEDOR = { openai: "OpenAI", claude: "Claude (Anthropic)" } as const;

function Opcao({ nome, rotulo, ajuda, inicial }: { nome: string; rotulo: string; ajuda: string; inicial: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={nome}
        defaultChecked={inicial}
        className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
      />
      <span>
        <span className="block text-label">{rotulo}</span>
        <span className="block text-body-sm text-ink-muted">{ajuda}</span>
      </span>
    </label>
  );
}

export function FormConfigIA({
  config,
  modelos,
  chaves,
}: {
  config: ConfigSite;
  modelos: readonly Modelo[];
  chaves: Chaves;
}) {
  const [estado, acao, enviando] = useActionState(salvarConfigIAProtegido, INICIAL);
  const atual = modelos.some((m) => m.id === config.ia_modelo) ? config.ia_modelo : modelos[0].id;
  const nomePadrao = modelos.find((m) => m.id === atual)?.nome ?? modelos[0].nome;
  const escolhas =
    config.ia_modelos && typeof config.ia_modelos === "object" && !Array.isArray(config.ia_modelos)
      ? (config.ia_modelos as Record<string, string | undefined>)
      : {};
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
          ajuda="“Melhorar texto” ao publicar e a leitura do currículo pronto (PDF ou foto), juntos até 20 vezes por dia por pessoa, e a ordem das vagas no Descobrir (até 12 por dia, guardadas por 6 horas)."
          inicial={config.ia_melhorar_texto}
        />
        <Opcao
          nome="chat_ativo"
          rotulo="Assistente de ajuda"
          ajuda="O botão “Tirar dúvidas” no canto do site e a conversa na página /ajuda. Sem conta, só tira dúvidas (até 15 perguntas por hora); com conta, também procura vagas e empresas (até 40 por hora)."
          inicial={config.chat_ativo ?? true}
        />
        <Opcao
          nome="ia_resumo"
          rotulo="Resumo no painel"
          ajuda="Um resumo da semana com sinais de alerta e sugestões, quando você pedir."
          inicial={config.ia_resumo}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Modelo padrão</legend>
        <p className="text-body-sm text-ink-muted">Vale para o que não tiver um modelo próprio, logo abaixo.</p>
        {(["openai", "claude"] as const).map((provedor) => (
          <div key={provedor} className="flex flex-col gap-2">
            <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm font-medium">
              {NOME_PROVEDOR[provedor]}
              {!chaves[provedor] && <span className="font-normal text-ink-muted">· sem chave neste servidor</span>}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {modelos
                .filter((m) => m.provedor === provedor)
                .map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer flex-col rounded-md border border-line-strong bg-surface-200 px-3 py-2.5 transition-colors has-[:checked]:border-ink has-[:checked]:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
                  >
                    <input
                      type="radio"
                      name="ia_modelo"
                      value={m.id}
                      defaultChecked={m.id === atual}
                      className="sr-only"
                    />
                    <span className="text-label">{m.nome}</span>
                    <span className="text-body-sm text-ink-muted">{m.ajuda}</span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">Modelo de cada funcionalidade</legend>
        <p className="text-body-sm text-ink-muted">
          Ponha num modelo que escreve melhor só o que precisa (o chat, por exemplo) e deixe o resto no mais barato.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FUNCIONALIDADES_IA.map((f) => {
            const escolhido = escolhas[f.id];
            return (
              <label key={f.id} className="flex flex-col gap-1">
                <span className="text-label">{f.nome}</span>
                <span className="text-body-sm text-ink-muted">{f.ajuda}</span>
                <select
                  name={`modelo_${f.id}`}
                  defaultValue={escolhido && modelos.some((m) => m.id === escolhido) ? escolhido : ""}
                  className="mt-1 min-h-11 rounded-md border border-line-strong bg-surface-200 px-3 text-body"
                >
                  <option value="">Padrão ({nomePadrao})</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-label">Apelido da IA</legend>
        <label htmlFor="ia_apelido" className="text-body-sm text-ink-muted">
          O nome com que a IA aparece no site: “Melhorar com Ipê”, “Ipê está escrevendo”. Vazio, fica “a IA”. Até 20
          letras. Ideias: Ipê, Pequi, Lia, Tina.
        </label>
        <input
          id="ia_apelido"
          name="ia_apelido"
          defaultValue={config.ia_apelido ?? ""}
          maxLength={20}
          autoComplete="off"
          className="mt-1 min-h-11 max-w-xs rounded-md border border-line-strong bg-surface-200 px-3 text-body"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-label">Reserva</legend>
        <Opcao
          nome="ia_reserva"
          rotulo="Usar a outra IA quando a escolhida falhar"
          ajuda={
            chaves.openai && chaves.claude
              ? "Se a escolhida ficar sem chave, sem créditos ou fora do ar, o pedido vai uma vez para o par dela na outra IA: Luna e Haiku, Sol e Sonnet."
              : "Precisa das duas chaves no servidor. Com uma só, a reserva fica esperando."
          }
          inicial={config.ia_reserva ?? true}
        />
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
