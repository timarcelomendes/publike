import "server-only";
import { previaDoCurriculo, TITULO_CONFERIR_E_SALVAR, type CurriculoMontado } from "@/lib/curriculo-pelo-whatsapp";
import { camposLidos, lerCurriculoDoArquivo } from "@/lib/ia/curriculo-do-arquivo";
import type { ClienteBanco } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/tipos-banco";
import { curriculoPeloWhatsappLigado } from "./curriculo-pelo-whatsapp";
import { caminhoDeEntrar } from "./entrar-pelo-whatsapp";
import { fotoParaLer } from "./vaga-pelo-whatsapp";
import { baixarFotoOuPdf, marcarLidaDigitando, type ConfigMeta } from "./whatsapp";

// O currículo que a pessoa manda no WhatsApp (foto ou PDF; 24/11/2026, Marcelo: "processar o currículo e chamar para
// um clique onde acessa o Publike"). O Publike lê, guarda o currículo montado (privado.curriculos_preparados, 7 dias),
// mostra a prévia e manda o botão "Conferir e salvar": o link de entrar com um toque (migração 20270920120000), que
// abre o currículo já preenchido. A conta só é criada no toque, e as empresas só veem o currículo depois de salvo.
// Com o currículo pelo WhatsApp desligado (Admin › Qualificados), ou sem conseguir ler, segue como antes.

type Saida = (texto: string, extra?: { perfil?: string | null; botao?: { titulo: string; caminho: string } | null }) => Promise<void>;

const MAX_FOTOS = 4;
const MAX_PDF = 6 * 1024 * 1024;
const LEITURAS_POR_DIA = 5;

/** "Mês de hoje" de Brasília (AAAA-MM). */
const mesDeHoje = (agora: Date) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 7);

export type Comum = {
  banco: ClienteBanco;
  chave: string;
  conversa: string;
  numero: string;
  /** o nome do perfil do WhatsApp */
  nome: string | null;
  modelo: () => Promise<string | null>;
  saida: Saida;
  /** a apresentação da primeira mensagem ("Oi, Rita! 👋 …\n\n") */
  ola: string;
  agora: Date;
};

/**
 * Já com o arquivo em mãos (as fotos em data URL e o PDF): lê, guarda e responde. true: respondeu; false: não deu
 * (o recurso desligado, não é currículo, nada lido) e quem chamou responde como antes.
 */
export async function responderCurriculoDoArquivo(
  p: Comum & { imagens: string[]; pdf: string | null },
): Promise<boolean> {
  if (!p.imagens.length && !p.pdf) return false;
  if (!(await curriculoPeloWhatsappLigado(p.banco, p.chave, p.numero))) return false;
  const modelo = await p.modelo();
  if (!modelo) return false;
  const hoje = mesDeHoje(p.agora);
  let lido;
  try {
    lido = await lerCurriculoDoArquivo(
      { pdf: p.pdf ? { nome: "curriculo.pdf", dados: p.pdf } : null, fotos: p.imagens },
      modelo,
      hoje,
    );
  } catch (e) {
    console.error("Publike: o currículo do WhatsApp não foi lido:", e instanceof Error ? e.message : e);
    return false;
  }
  if (!lido || !camposLidos(lido)) return false;
  const montado: CurriculoMontado = { ...lido, resumo: "" };
  const { data: token, error } = await p.banco.rpc("servidor_guardar_curriculo_preparado", {
    p_chave: p.chave,
    p_conversa: p.conversa,
    p_dados: montado as unknown as Json,
    p_nome: p.nome ?? "",
    p_telefone: p.numero,
  });
  if (error || typeof token !== "string") {
    console.error("Publike: o currículo lido no WhatsApp não foi guardado:", error?.message);
    return false;
  }
  const destino = `/perfil/curriculo?preparado=${token}`;
  const entrar = await caminhoDeEntrar(p.numero, destino);
  await p.saida(
    [
      `${p.ola}Li o seu currículo! 📄 Olha o que eu entendi:`,
      previaDoCurriculo(montado, hoje),
      entrar
        ? `Toque em *${TITULO_CONFERIR_E_SALVAR}*: você entra no Publike com este WhatsApp, sem digitar código, confere e salva. Aí as empresas da região já te acham, e eu te mando as vagas perto de você. 😊`
        : `Toque em *${TITULO_CONFERIR_E_SALVAR}*: você confere, entra com o seu WhatsApp e salva. Aí as empresas da região já te acham. 😊`,
    ].join("\n\n"),
    { perfil: "trabalho", botao: { titulo: TITULO_CONFERIR_E_SALVAR, caminho: entrar ?? destino } },
  );
  return true;
}

type Midia = { wamid: string; tipo: "imagem" | "pdf"; midia: string; mime: string | null };

/**
 * Quem procura trabalho mandou foto ou PDF: baixa o que chegou nesta vez e lê como currículo. false: segue como antes
 * (o recurso desligado, nada para ler, não é currículo).
 */
export async function lerCurriculoMandado(p: Comum & { cfg: ConfigMeta; wamid: string }): Promise<boolean> {
  if (!(await curriculoPeloWhatsappLigado(p.banco, p.chave, p.numero))) return false;
  const { data, error } = await p.banco.rpc("servidor_whatsapp_midias_da_vez", { p_chave: p.chave, p_conversa: p.conversa });
  if (error) return false;
  const vez = (data ?? {}) as unknown as { midias?: Midia[]; leituras_hoje?: number };
  const midias = vez.midias ?? [];
  const fotos = midias.filter((m) => m.tipo === "imagem").slice(0, MAX_FOTOS);
  const pdf = midias.find((m) => m.tipo === "pdf") ?? null;
  if (!fotos.length && !pdf) return false;
  if ((vez.leituras_hoje ?? 0) >= LEITURAS_POR_DIA) return false;

  await marcarLidaDigitando(p.cfg, p.wamid).catch(() => undefined);
  const imagens: string[] = [];
  let arquivo: string | null = null;
  for (const m of pdf ? [pdf] : fotos) {
    const r = await baixarFotoOuPdf(p.cfg, m.midia);
    if (!r.ok) {
      console.error("Publike: o currículo do WhatsApp não baixou:", r.erro);
      continue;
    }
    if (m.tipo === "pdf" || r.mime === "application/pdf") {
      if (r.bytes.length <= MAX_PDF && r.bytes.subarray(0, 5).toString() === "%PDF-")
        arquivo = `data:application/pdf;base64,${r.bytes.toString("base64")}`;
      continue;
    }
    const foto = await fotoParaLer(r.bytes, r.mime || m.mime || "");
    if (foto) imagens.push(foto);
  }
  const inicio = Date.now();
  const respondeu = await responderCurriculoDoArquivo({ ...p, imagens, pdf: arquivo });
  // a leitura conta no limite do dia e as fotos ficam como lidas (o mesmo registro do Publicar pelo WhatsApp)
  await p.banco.rpc("servidor_whatsapp_leitura", {
    p_chave: p.chave,
    p_conversa: p.conversa,
    p_numero: p.numero,
    p_fonte: arquivo ? "pdf" : "foto",
    p_resultado: respondeu ? "curriculo" : "falhou",
    p_motivo: respondeu ? "currículo de quem procura trabalho" : "não deu para ler como currículo",
    p_ms: Date.now() - inicio,
    p_midias: (pdf ? [pdf] : fotos).map((m) => m.wamid),
  });
  return respondeu;
}
