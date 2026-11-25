import "server-only";
import { previaDoCurriculo, TITULO_CONFERIR_E_SALVAR, type CurriculoMontado } from "@/lib/curriculo-pelo-whatsapp";
import { camposLidos, lerCurriculoDoArquivoComMotivo } from "@/lib/ia/curriculo-do-arquivo";
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
// Com o currículo pelo WhatsApp desligado (Admin › Qualificados), segue como antes.
//
// Sem conseguir ler, nada fica calado (25/11/2026: a Arlete mandou o PDF duas vezes e ouviu "não consigo abrir"): a
// leitura devolve o porquê (`ArquivoNaoLido`), que vai para o registro da leitura (privado.whatsapp_leituras) e para a
// resposta (src/lib/curriculo-pelo-whatsapp.ts, `arquivoNaoLido`).

type Saida = (texto: string, extra?: { perfil?: string | null; botao?: { titulo: string; caminho: string } | null }) => Promise<void>;

const MAX_FOTOS = 4;
/** O PDF do currículo, até 20 MB (o escaneado e o do Canva passam de 6 MB; o Claude aceita até 32 MB no pedido). */
export const MAX_PDF = 20 * 1024 * 1024;
const LEITURAS_POR_DIA = 5;

/**
 * Por que o arquivo não virou currículo:
 * - sem_midia: nada guardado para ler (o formato que não é foto nem PDF) e desligado: quem chamou responde como antes;
 * - limite: as leituras do dia do número;
 * - grande, nao_baixou, nao_e_pdf: o arquivo (o tamanho vai em `tamanho`);
 * - sem_modelo, falha, nao_guardou: do lado do Publike (a IA, o banco);
 * - nao_e_curriculo: a IA leu e não é currículo (o que é vai em `oQueE`); sem_campos: é, mas não deu para ler nada.
 */
export type ArquivoNaoLido = {
  ok: false;
  tipo:
    | "sem_midia"
    | "desligado"
    | "limite"
    | "grande"
    | "nao_baixou"
    | "nao_e_pdf"
    | "sem_modelo"
    | "falha"
    | "nao_guardou"
    | "nao_e_curriculo"
    | "sem_campos";
  /** para o registro da leitura (até 300 letras) */
  motivo: string;
  oQueE?: string;
  /** "7,2 MB" */
  tamanho?: string;
};
export type LeituraDoArquivo = { ok: true } | ArquivoNaoLido;
export type ProblemaDoArquivo = { tipo: "grande" | "nao_baixou" | "nao_e_pdf"; motivo: string; tamanho?: string };

/** "7,2 MB" */
export const emMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/** O PDF de verdade: o "%PDF-" vem no começo, ou depois de uns bytes soltos (até 1 KB, como os leitores aceitam). */
export const pareceePdf = (bytes: Buffer) => bytes.subarray(0, 1024).includes("%PDF-");

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
 * Já com o arquivo em mãos (as fotos em data URL e o PDF): lê, guarda e responde. ok: respondeu; senão, o porquê (o
 * recurso desligado, não é currículo, nada lido...), e quem chamou responde.
 */
export async function responderCurriculoDoArquivo(
  p: Comum & { imagens: string[]; pdf: string | null; problema?: ProblemaDoArquivo | null },
): Promise<LeituraDoArquivo> {
  if (!p.imagens.length && !p.pdf)
    return p.problema ? { ok: false, ...p.problema } : { ok: false, tipo: "sem_midia", motivo: "nada para ler" };
  if (!(await curriculoPeloWhatsappLigado(p.banco, p.chave, p.numero)))
    return { ok: false, tipo: "desligado", motivo: "o currículo pelo WhatsApp está desligado" };
  const modelo = await p.modelo();
  if (!modelo) return { ok: false, tipo: "sem_modelo", motivo: "a IA não está configurada" };
  const hoje = mesDeHoje(p.agora);
  let lido;
  let oQueE = "";
  try {
    ({ lido, oQueE } = await lerCurriculoDoArquivoComMotivo(
      { pdf: p.pdf ? { nome: "curriculo.pdf", dados: p.pdf } : null, fotos: p.imagens },
      modelo,
      hoje,
    ));
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("Publike: o currículo do WhatsApp não foi lido:", erro);
    return { ok: false, tipo: "falha", motivo: `a IA falhou: ${erro}`.slice(0, 300) };
  }
  if (!lido)
    return {
      ok: false,
      tipo: "nao_e_curriculo",
      motivo: `a IA disse que não é currículo${oQueE ? `: ${oQueE}` : ""}`,
      ...(oQueE ? { oQueE } : {}),
    };
  if (!camposLidos(lido)) return { ok: false, tipo: "sem_campos", motivo: "é currículo, mas a IA não leu nenhum campo" };
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
    return { ok: false, tipo: "nao_guardou", motivo: `não guardou: ${error?.message ?? "sem o link"}`.slice(0, 300) };
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
  return { ok: true };
}

export type Midia = { wamid: string; tipo: "imagem" | "pdf"; midia: string; mime: string | null };

/** Baixa da Meta as fotos (em JPEG para a IA) ou o PDF. O que não deu vem em `problema` (o primeiro), nunca calado. */
export async function baixarParaLer(cfg: ConfigMeta, midias: Midia[]) {
  const imagens: string[] = [];
  let pdf: string | null = null;
  let problema: ProblemaDoArquivo | null = null;
  for (const m of midias) {
    const ehPdf = m.tipo === "pdf";
    const r = await baixarFotoOuPdf(cfg, m.midia, ehPdf ? MAX_PDF : undefined);
    if (!r.ok) {
      console.error("Publike: o currículo do WhatsApp não baixou:", r.erro);
      const tamanho = "tamanho" in r && r.tamanho ? emMb(r.tamanho) : undefined;
      problema ??=
        "grande" in r && r.grande
          ? { tipo: "grande", motivo: `arquivo grande demais${tamanho ? ` (${tamanho})` : ""}`, ...(tamanho ? { tamanho } : {}) }
          : { tipo: "nao_baixou", motivo: `não baixou: ${r.erro}`.slice(0, 300) };
      continue;
    }
    if (ehPdf || r.mime === "application/pdf") {
      if (pdf) continue;
      if (r.bytes.length > MAX_PDF) {
        problema ??= { tipo: "grande", motivo: `PDF grande demais (${emMb(r.bytes.length)})`, tamanho: emMb(r.bytes.length) };
        continue;
      }
      if (!pareceePdf(r.bytes)) {
        problema ??= { tipo: "nao_e_pdf", motivo: `o arquivo não abre como PDF (${emMb(r.bytes.length)}, ${r.mime || "sem tipo"})` };
        continue;
      }
      pdf = `data:application/pdf;base64,${r.bytes.toString("base64")}`;
      continue;
    }
    const foto = await fotoParaLer(r.bytes, r.mime || m.mime || "");
    if (foto && imagens.length < MAX_FOTOS) imagens.push(foto);
    else if (!foto) problema ??= { tipo: "nao_baixou", motivo: `a foto não abriu (${emMb(r.bytes.length)}, ${r.mime || "sem tipo"})` };
  }
  return { imagens, pdf, problema };
}

/**
 * Quem procura trabalho mandou foto ou PDF: baixa o que chegou nesta vez e lê como currículo. ok: respondeu (a prévia e
 * o "Conferir e salvar"); senão, o porquê. sem_midia e desligado: nada foi lido, e quem chamou responde como antes.
 */
export async function lerCurriculoMandado(p: Comum & { cfg: ConfigMeta; wamid: string }): Promise<LeituraDoArquivo> {
  if (!(await curriculoPeloWhatsappLigado(p.banco, p.chave, p.numero)))
    return { ok: false, tipo: "desligado", motivo: "o currículo pelo WhatsApp está desligado" };
  const { data, error } = await p.banco.rpc("servidor_whatsapp_midias_da_vez", { p_chave: p.chave, p_conversa: p.conversa });
  if (error) return { ok: false, tipo: "sem_midia", motivo: `as mídias não vieram: ${error.message}` };
  const vez = (data ?? {}) as unknown as { midias?: Midia[]; leituras_hoje?: number };
  const midias = vez.midias ?? [];
  const fotos = midias.filter((m) => m.tipo === "imagem").slice(0, MAX_FOTOS);
  const pdf = midias.find((m) => m.tipo === "pdf") ?? null;
  if (!fotos.length && !pdf) return { ok: false, tipo: "sem_midia", motivo: "nada guardado para ler" };
  const lidas = (pdf ? [pdf] : fotos).map((m) => m.wamid);
  const registrar = (resultado: string, motivo: string, ms: number | null) =>
    p.banco.rpc("servidor_whatsapp_leitura", {
      p_chave: p.chave,
      p_conversa: p.conversa,
      p_numero: p.numero,
      p_fonte: pdf ? "pdf" : "foto",
      p_resultado: resultado,
      p_motivo: motivo.slice(0, 300),
      p_ms: ms,
      p_midias: lidas,
    });
  if ((vez.leituras_hoje ?? 0) >= LEITURAS_POR_DIA) {
    const motivo = `${vez.leituras_hoje} leituras nas últimas 24 horas`;
    await registrar("limite", motivo, null);
    return { ok: false, tipo: "limite", motivo };
  }

  await marcarLidaDigitando(p.cfg, p.wamid).catch(() => undefined);
  const baixado = await baixarParaLer(p.cfg, pdf ? [pdf] : fotos);
  // o tempo da leitura (sem o download, como nas outras linhas do registro)
  const inicio = Date.now();
  const r = await responderCurriculoDoArquivo({ ...p, ...baixado });
  // a leitura conta no limite do dia e as fotos ficam como lidas (o mesmo registro do Publicar pelo WhatsApp); o
  // motivo diz o que houve (o tamanho, o que a IA achou que era), para a equipe ver em Admin
  await registrar(
    r.ok ? "curriculo" : r.tipo === "grande" ? "grande" : r.tipo === "nao_e_curriculo" ? "outro" : "falhou",
    r.ok ? "currículo de quem procura trabalho" : r.motivo,
    Date.now() - inicio,
  );
  return r;
}
