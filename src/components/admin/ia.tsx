"use client";

import { useActionState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { salvarConfigIA } from "@/lib/acoes/admin";
import { ChevronDown } from "lucide-react";
import { escolhasDosUsos, FUNCIONALIDADES_IA, GRUPOS_DO_USO, USOS_IA } from "@/lib/ia-nomes";
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

/** As chamadas dos últimos 30 dias de cada funcionalidade e o custo estimado (pelos tokens e pelo preço do modelo). */
export type UsoDaFuncionalidade = Partial<
  Record<string, { chamadas: number; falhas: number; buscas: number; dolares: number; semPreco: boolean }>
>;

const dolares = (v: number) =>
  v === 0
    ? "US$ 0"
    : v < 0.01
      ? "menos de US$ 0,01"
      : `cerca de US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "1.234 chamadas em 30 dias · cerca de US$ 0,42 · 3 falharam" */
function textoDoUso(u: UsoDaFuncionalidade[string]) {
  if (!u || (!u.chamadas && !u.falhas)) return "Nenhuma chamada em 30 dias";
  const partes = [
    `${u.chamadas.toLocaleString("pt-BR")} ${u.chamadas === 1 ? "chamada" : "chamadas"} em 30 dias`,
    u.buscas ? `${u.buscas.toLocaleString("pt-BR")} ${u.buscas === 1 ? "busca" : "buscas"} na internet` : null,
    u.semPreco ? null : dolares(u.dolares),
    u.falhas ? `${u.falhas.toLocaleString("pt-BR")} ${u.falhas === 1 ? "falhou" : "falharam"}` : null,
  ];
  return partes.filter(Boolean).join(" · ");
}

/** O total de todas as funcionalidades. */
function somar(uso: UsoDaFuncionalidade) {
  const total = { chamadas: 0, falhas: 0, buscas: 0, dolares: 0, semPreco: false };
  for (const u of Object.values(uso)) {
    if (!u) continue;
    total.chamadas += u.chamadas;
    total.falhas += u.falhas;
    total.buscas += u.buscas;
    total.dolares += u.dolares;
    total.semPreco ||= u.semPreco;
  }
  return total;
}

export function FormConfigIA({
  config,
  modelos,
  chaves,
  uso,
  transcricao,
}: {
  config: ConfigSite;
  modelos: readonly Modelo[];
  /** os modelos de transcrição (só a OpenAI); o primeiro é o padrão */
  transcricao: readonly { id: string; nome: string }[];
  chaves: Chaves;
  /** null: sem a migração do uso (não mostra a contagem) */
  uso: UsoDaFuncionalidade | null;
}) {
  const [estado, acao, enviando] = useActionState(salvarConfigIAProtegido, INICIAL);
  const atual = modelos.some((m) => m.id === config.ia_modelo) ? config.ia_modelo : modelos[0].id;
  const nomePadrao = modelos.find((m) => m.id === atual)?.nome ?? modelos[0].nome;
  const escolhas =
    config.ia_modelos && typeof config.ia_modelos === "object" && !Array.isArray(config.ia_modelos)
      ? (config.ia_modelos as Record<string, string | undefined>)
      : {};
  const escolhasUsos = escolhasDosUsos(config.ia_usos);
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
        <legend className="mb-1 text-label">Cada uso da IA</legend>
        <p className="text-body-sm text-ink-muted">
          Tudo o que chama a IA, um por um: desmarque para desligar só aquele uso e escolha o modelo dele. Sem escolha,
          vale o modelo do grupo (ou o padrão). Ponha num modelo que escreve melhor só o que precisa e deixe o resto no
          mais barato. Uma mudança vale em até meio minuto.
          {uso && " Em cada um, as chamadas dos últimos 30 dias e o custo estimado pelos tokens."}
        </p>
        {uso && (
          <p className="text-label">
            {textoDoUso(somar(uso)).replace("em 30 dias", "em 30 dias, no total")}
          </p>
        )}
        <div className="flex flex-col divide-y divide-line rounded-md border border-line">
          {GRUPOS_DO_USO.map((g) => {
            const usos = USOS_IA.filter((u) => u.grupo === g.id);
            const funcionalidade = FUNCIONALIDADES_IA.find((f) => f.id === g.id);
            const doGrupo = escolhas[g.id];
            const modeloDoGrupo = funcionalidade
              ? (modelos.find((m) => m.id === doGrupo)?.nome ?? nomePadrao)
              : g.id === "transcricao"
                ? transcricao[0].nome
                : "o do Admin › Qualificados";
            const ligados = usos.filter((u) => escolhasUsos[u.id]?.ligado !== false).length;
            // o uso do grupo: o de antes de 22/11/2026 (contado pelo grupo) e o de cada uso
            const totalDoGrupo = uso ? somar(Object.fromEntries([g.id, ...usos.map((u) => u.id)].map((k) => [k, uso[k]]))) : null;
            const opcoes = g.id === "transcricao" ? transcricao : modelos;
            return (
              <details key={g.id} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                  <ChevronDown aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                  <span className="text-label">{g.nome}</span>
                  <span className={ligados < usos.length ? "text-body-sm text-terra-text" : "text-body-sm text-ink-muted"}>
                    {ligados === usos.length
                      ? usos.length === 1
                        ? "ligado"
                        : `${usos.length} ligados`
                      : `${ligados} de ${usos.length} ligados`}
                  </span>
                  {totalDoGrupo && (
                    <span className="basis-full pl-7 text-body-sm text-ink-muted tabular-nums">{textoDoUso(totalDoGrupo)}</span>
                  )}
                </summary>
                <div className="flex flex-col gap-4 px-4 pb-4 pl-11">
                  {funcionalidade && (
                    <label className="flex flex-col gap-1">
                      <span className="text-body-sm font-medium">Modelo do grupo</span>
                      <span className="text-body-sm text-ink-muted">{funcionalidade.ajuda}</span>
                      <select
                        name={`modelo_${funcionalidade.id}`}
                        defaultValue={doGrupo && modelos.some((m) => m.id === doGrupo) ? doGrupo : ""}
                        className="mt-1 min-h-11 max-w-sm rounded-md border border-line-strong bg-surface-200 px-3 text-body"
                      >
                        <option value="">Padrão ({nomePadrao})</option>
                        {modelos.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <ul className="flex flex-col gap-4">
                    {usos.map((u) => {
                      const e = escolhasUsos[u.id];
                      return (
                        <li key={u.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-start">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              name={`uso_ligado_${u.id}`}
                              defaultChecked={e?.ligado !== false}
                              className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
                            />
                            <span>
                              <span className="block text-label">{u.nome}</span>
                              <span className="block text-body-sm text-ink-muted">{u.ajuda}</span>
                              {uso && (
                                <span className="block text-body-sm text-ink-muted tabular-nums">{textoDoUso(uso[u.id])}</span>
                              )}
                            </span>
                          </label>
                          <select
                            name={`uso_modelo_${u.id}`}
                            aria-label={`Modelo de ${u.nome}`}
                            defaultValue={e?.modelo && opcoes.some((m) => m.id === e.modelo) ? e.modelo : ""}
                            className="min-h-11 rounded-md border border-line-strong bg-surface-200 px-3 text-body"
                          >
                            <option value="">
                              {g.id === "transcricao" ? `Padrão (${modeloDoGrupo})` : `Do grupo (${modeloDoGrupo})`}
                            </option>
                            {opcoes
                              .filter((m) => g.id !== "transcricao" || m.id !== transcricao[0].id)
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.nome}
                                </option>
                              ))}
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
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
