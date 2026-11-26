import "server-only";
import { acessoFila } from "./filas";
import { configMeta, enviarModelo, MODELOS, podeSair, RODAPE_WHATSAPP, type SituacaoModelos } from "./whatsapp";

// O convite com a vaga pronta pelo WhatsApp oficial (migração 20271011120000; 26/11/2026, Marcelo: "a maior conversão
// ocorre hoje via mensagens do WhatsApp, que mando, mas é muito limitado"; "o 2 inicialmente desligado"). O mesmo
// convite que converte do celular dele, em lote, pelo número do Publike: só com o envio ligado em Admin › Convites, até
// o teto do dia, das 9h às 18h de segunda a sábado (o banco decide quem sai). Marketing: só com o modelo aprovado.

export const MODELO_DO_CONVITE = "publike_vaga_pronta";

export type ConvitesPeloWhatsapp = { enviados: number; falhas: number; esperando: number; motivo?: string };

/** O texto do modelo, para a conversa guardar o que a empresa recebeu. */
export function textoDoConviteDoModelo(empresa: string, vaga: string, caminho: string, site: string) {
  const m = MODELOS.find((x) => x.nome === MODELO_DO_CONVITE)!;
  return `${m.corpo.replace("{{empresa}}", empresa).replace("{{vaga}}", vaga)}\n\nConferir e publicar: ${site}/${caminho}\n\n_${RODAPE_WHATSAPP}_`;
}

/** O /api/filas: os convites que estão na hora (até `limite` por rodada). Desligado, nada sai. */
export async function enviarConvitesPeloWhatsapp(limite = 20): Promise<ConvitesPeloWhatsapp> {
  const r: ConvitesPeloWhatsapp = { enviados: 0, falhas: 0, esperando: 0 };
  const cfg = configMeta();
  const acesso = acessoFila();
  if (!cfg || !acesso) return r;
  const { cliente: banco, chave } = acesso;
  const { data, error } = await banco.rpc("servidor_convites_para_whatsapp", { p_chave: chave, p_limite: limite });
  if (error) {
    if (error.code !== "PGRST202") r.motivo = `Não deu para ler os convites do WhatsApp: ${error.message}`;
    return r;
  }
  const convites = (data ?? []) as { id: string; nome: string; vaga: string; numero: string; token: string }[];
  if (!convites.length) return r;
  const { data: conf } = await banco.rpc("servidor_whatsapp_config", { p_chave: chave });
  const modelos = ((conf ?? {}) as { modelos?: SituacaoModelos }).modelos ?? {};
  if (!podeSair(modelos, MODELO_DO_CONVITE)) {
    // o modelo ainda na Meta: os convites esperam (continuam "a enviar")
    r.esperando = convites.length;
    return r;
  }
  const modelo = MODELOS.find((m) => m.nome === MODELO_DO_CONVITE)!;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://publike.org").replace(/\/+$/, "");
  for (const c of convites) {
    const empresa = c.nome.replace(/\s+/g, " ").trim().slice(0, 60);
    const vaga = c.vaga.replace(/\s+/g, " ").trim().slice(0, 80);
    const caminho = `publicar?convite=${c.token}`;
    const envio = await enviarModelo(cfg, c.numero, modelo, { empresa, vaga }, { link: caminho });
    const anotar = (wamid: string | null, falhou: string | null, numero = c.numero) =>
      banco.rpc("servidor_convite_whatsapp_mandado", {
        p_chave: chave,
        p_convite: c.id,
        p_numero: numero,
        p_wamid: wamid,
        p_falhou: falhou,
        p_texto: falhou ? null : textoDoConviteDoModelo(empresa, vaga, caminho, site),
      });
    if (envio.ok) {
      await anotar(envio.wamid, null, envio.waId ?? c.numero);
      r.enviados++;
    } else if (envio.configuracao) {
      r.falhas++;
      r.motivo = `Os convites pelo WhatsApp pararam: a Meta recusou o envio (${envio.erro.slice(0, 160)}).`;
      break;
    } else if (envio.passageiro) {
      r.falhas++;
    } else {
      // o número fora do WhatsApp ou o limite de marketing: não tenta de novo
      await anotar(null, envio.erro.slice(0, 300));
      r.falhas++;
    }
  }
  return r;
}
