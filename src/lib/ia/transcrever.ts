import "server-only";
import { CIDADES_DAS_PRACAS } from "@/lib/pracas";
import { chaveIA, enderecoIA } from "@/lib/servidor/ambiente";
import { contarUsoDaIA } from "@/lib/servidor/uso-da-ia";
import { ErroIA } from "./openai";

// A fala vira texto (currículo falado). Só a OpenAI transcreve: sem a chave dela, o botão nem aparece.
// O áudio vai direto para a API e não fica guardado em lugar nenhum.

/** gpt-4o-mini-transcribe: cerca de US$ 0,003 por minuto (out/2026). */
export const MODELO_TRANSCRICAO = "gpt-4o-mini-transcribe";
/**
 * Dólares por milhão de tokens (out/2026): o áudio de entrada US$ 3 e o texto de saída US$ 5 (o texto de entrada, o
 * assunto, custa menos, mas é pouco: entra no preço do áudio).
 */
export const PRECO_TRANSCRICAO = { entrada: 3, saida: 5 };

/** O currículo falado está disponível neste servidor (precisa da chave da OpenAI). */
export function falaDisponivel() {
  return Boolean(chaveIA());
}

/**
 * Transcreve o áudio (ou o vídeo: webm e mp4 servem) em português. Erros saem como ErroIA. `assunto`: a frase que
 * ajuda nas palavras (sem ela, a do currículo falado).
 */
export async function transcrever(audio: Blob, nome: string, assunto?: string): Promise<string> {
  try {
    const { texto, tokens } = await transcreverNaApi(audio, nome, assunto);
    await contarUsoDaIA("transcricao", MODELO_TRANSCRICAO, tokens);
    return texto;
  } catch (e) {
    await contarUsoDaIA("transcricao", MODELO_TRANSCRICAO, null, true);
    throw e;
  }
}

async function transcreverNaApi(
  audio: Blob,
  nome: string,
  assunto?: string,
): Promise<{ texto: string; tokens: { entrada: number; saida: number } | null }> {
  const chave = chaveIA();
  if (!chave) throw new ErroIA("A transcrição não está disponível agora.");
  const dados = new FormData();
  dados.set("file", audio, nome);
  dados.set("model", MODELO_TRANSCRICAO);
  dados.set("language", "pt");
  // em JSON, a resposta traz os tokens cobrados (para o uso da IA no Admin)
  dados.set("response_format", "json");
  // o assunto ajuda nas palavras de trabalho e nos nomes de Goiânia (sem pôr frases prontas na boca da pessoa)
  dados.set(
    "prompt",
    assunto ??
      `Uma pessoa de ${CIDADES_DAS_PRACAS} conta onde trabalhou, o que fazia, o que estudou e que trabalho procura.`,
  );
  let resposta: Response;
  try {
    resposta = await fetch(`${enderecoIA()}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${chave}` },
      body: dados,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErroIA(tempo ? "A transcrição demorou demais." : "Não foi possível falar com a IA agora.");
  }
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    console.error(`Publike: a transcrição respondeu ${resposta.status}:`, corpo.slice(0, 300));
    throw new ErroIA("A transcrição falhou.", resposta.status);
  }
  const corpo = await resposta.text();
  try {
    const json = JSON.parse(corpo) as { text?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
    const tokens =
      json.usage && typeof json.usage.input_tokens === "number"
        ? { entrada: json.usage.input_tokens, saida: json.usage.output_tokens ?? 0 }
        : null;
    return { texto: typeof json.text === "string" ? json.text.trim() : "", tokens };
  } catch {
    // não veio JSON (um servidor que só devolve texto): o texto como veio
    return { texto: corpo.trim(), tokens: null };
  }
}
