import "server-only";
import { chaveIA, enderecoIA } from "@/lib/servidor/ambiente";
import { ErroIA } from "./openai";

// A fala vira texto (currículo falado). Só a OpenAI transcreve: sem a chave dela, o botão nem aparece.
// O áudio vai direto para a API e não fica guardado em lugar nenhum.

/** gpt-4o-mini-transcribe: cerca de US$ 0,003 por minuto (out/2026). */
export const MODELO_TRANSCRICAO = "gpt-4o-mini-transcribe";

/** O currículo falado está disponível neste servidor (precisa da chave da OpenAI). */
export function falaDisponivel() {
  return Boolean(chaveIA());
}

/** Transcreve o áudio em português. Erros saem como ErroIA. */
export async function transcrever(audio: Blob, nome: string): Promise<string> {
  const chave = chaveIA();
  if (!chave) throw new ErroIA("A transcrição não está disponível agora.");
  const dados = new FormData();
  dados.set("file", audio, nome);
  dados.set("model", MODELO_TRANSCRICAO);
  dados.set("language", "pt");
  dados.set("response_format", "text");
  // o assunto ajuda nas palavras de trabalho e nos nomes de Goiânia (sem pôr frases prontas na boca da pessoa)
  dados.set("prompt", "Uma pessoa de Goiânia conta onde trabalhou, o que fazia, o que estudou e que trabalho procura.");
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
  return (await resposta.text()).trim();
}
