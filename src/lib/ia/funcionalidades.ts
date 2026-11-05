import "server-only";
import { FUNCIONALIDADES_IA, type FuncionalidadeIA } from "@/lib/ia-nomes";
import { modeloDaIA } from "./openai";

// Um modelo de IA para cada funcionalidade e o apelido da IA (claude/plano-ia-por-funcionalidade.md, 05/11/2026).
// Em Admin › IA, cada funcionalidade pode ter o seu modelo (`config_site.ia_modelos`, {funcionalidade: modelo});
// sem escolha própria, vale o "Padrão" (`ia_modelo`). O apelido (`ia_apelido`) é o nome com que a IA aparece no
// site ("Melhorar com Ipê"); vazio, fica "a IA", como sempre.

type ConfigDaIA = { ia_modelo?: string | null; ia_modelos?: unknown } | null | undefined;

/** As escolhas por funcionalidade que valem (só modelos que existem). */
export function modelosEscolhidos(config: ConfigDaIA): Partial<Record<FuncionalidadeIA, string>> {
  const bruto = config?.ia_modelos;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const certo: Partial<Record<FuncionalidadeIA, string>> = {};
  for (const f of FUNCIONALIDADES_IA) {
    const m = (bruto as Record<string, unknown>)[f.id];
    if (typeof m === "string" && modeloDaIA(m).id === m) certo[f.id] = m;
  }
  return certo;
}

/** O modelo da funcionalidade: o escolhido para ela ou, sem escolha, o padrão. */
export function modeloPara(config: ConfigDaIA, funcionalidade: FuncionalidadeIA): string {
  return modeloDaIA(modelosEscolhidos(config)[funcionalidade] ?? config?.ia_modelo).id;
}
