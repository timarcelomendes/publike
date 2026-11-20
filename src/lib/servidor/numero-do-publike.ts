import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { formatarTelefone } from "@/lib/formato";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { conferirNumero, configMeta } from "./whatsapp";

/** A marca do cache: o Admin, ao salvar, faz o site ver a mudança na hora. */
export const TAG_CONTATO_DAS_VAGAS = "whatsapp-vagas-no-site";

/**
 * O "Mandar a vaga pelo WhatsApp" do site (/empresas e o passo 1 do publicar; migração 20270806120000): o número do
 * Publike como a Meta mostra, só com o WhatsApp, o atendimento e o Publicar pelo WhatsApp ligados (e a chamada no site,
 * em Admin › Publicar pelo WhatsApp). Guardado por umas horas; sem a Meta ou sem o recurso, null (o site não mostra).
 */
export async function contatoDasVagasPeloWhatsapp(): Promise<{ numero: string; exibicao: string } | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG_CONTATO_DAS_VAGAS);
  if (MODO_DEMO) return null;
  try {
    const cfg = configMeta();
    if (!cfg) return null;
    const { data: ligado, error } = await criarClientePublico().rpc("whatsapp_vagas_no_site");
    if (error || !ligado) return null;
    const r = await conferirNumero(cfg);
    const digitos = r.ok ? (r.display_phone_number ?? "").replace(/\D/g, "") : "";
    if (!/^55[1-9][0-9][0-9]{8,9}$/.test(digitos)) return null;
    // a Meta mostra o celular sem o 9 (556284771907): a exibição põe o 9, como as pessoas conhecem o número
    // (20/11/2026: o publicar mostrava "(62) 8477-1907"); o link do wa.me segue com os dígitos da Meta
    return { numero: digitos, exibicao: formatarTelefone(digitos) };
  } catch {
    return null;
  }
}
