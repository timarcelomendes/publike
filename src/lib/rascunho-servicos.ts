// A vitrine de quem começou sem conta: fica só neste aparelho (localStorage) enquanto a pessoa
// preenche e entra; depois de entrar, o formulário volta com ela para a pessoa conferir e salvar.

import type { ValoresServicos } from "@/components/form-servicos";

const CHAVE = "publike_vitrine_sem_conta";
/** Depois de uma semana, o rascunho não volta mais. */
const VALIDADE = 7 * 24 * 3600e3;

/** Para onde o "Entrar e publicar" volta: a vitrine reabre com o que foi preenchido. */
export const VOLTA_DA_VITRINE = "/painel/servicos?rascunho=1";

export function guardarVitrine(valores: ValoresServicos) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ salvo_em: Date.now(), valores }));
  } catch {}
}

/** A vitrine preenchida sem conta (e some do aparelho, a não ser que `manter`). Sem serviço, nada. */
export function lerVitrine(manter: boolean): ValoresServicos | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    if (!manter) localStorage.removeItem(CHAVE);
    const r = JSON.parse(bruto) as { salvo_em: number; valores: ValoresServicos };
    if (Date.now() - r.salvo_em > VALIDADE || !Array.isArray(r.valores?.servicos)) return null;
    return r.valores.servicos.length ? r.valores : null;
  } catch {
    return null;
  }
}
