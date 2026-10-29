import type { NextRequest } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { falaDisponivel } from "@/lib/ia/transcrever";
import { registrarFalha, textoDoErro } from "@/lib/servidor/falhas";
import { dentroDoLimite } from "@/lib/servidor/limite";
import { lerFalaDoCurriculo, type LeituraDoArquivo } from "@/lib/servidor/ler-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Currículo falado: o navegador grava a pessoa contando a experiência e manda o áudio para cá (rota, e
// não ação do servidor: a ação aceita só 1 MB, e a gravação do iPhone passa disso). Devolve os campos
// do currículo para ela conferir; nada é salvo e o áudio não fica guardado.

// a transcrição (até 60 s) e a leitura da IA (até 60 s), uma depois da outra
export const maxDuration = 130;

const responder = (r: LeituraDoArquivo, status = 200) =>
  Response.json(r, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest) {
  if (MODO_DEMO) return responder({ ok: false, erro: MENSAGEM_DEMO });
  // só a página do próprio site manda (o navegador diz de onde veio)
  const origem = request.headers.get("origin");
  if (!origem || (origem !== request.nextUrl.origin && origem !== new URL(SITE_URL).origin)) {
    return responder({ ok: false, erro: "Pedido inválido." }, 403);
  }
  if (!falaDisponivel()) return responder({ ok: false, erro: "Contar falando não está disponível agora." });
  const usuario = await obterUsuario();
  if (!usuario) return responder({ ok: false, erro: "Entre na sua conta para continuar." }, 401);
  // além da cota da ajuda da IA (por dia): no máximo 8 gravações por hora, por conta
  if (!dentroDoLimite(`fala:${usuario.id}`, 8, 60 * 60_000)) {
    return responder({ ok: false, erro: "Muitas gravações seguidas. Espere um pouco e tente de novo." }, 429);
  }
  let audio: FormDataEntryValue | null;
  try {
    audio = (await request.formData()).get("audio");
  } catch {
    return responder({ ok: false, erro: "Não deu para enviar a gravação. Tente de novo." }, 400);
  }
  if (!(audio instanceof File)) return responder({ ok: false, erro: "Grave de novo." }, 400);

  let leitura: LeituraDoArquivo;
  try {
    leitura = await lerFalaDoCurriculo(audio, await criarClienteServidor());
  } catch (e) {
    console.error("Publike: erro no currículo falado:", e);
    leitura = { ok: false, erro: "Não deu para ouvir a gravação agora. Tente de novo ou preencha aqui embaixo." };
    await registrarFalha({
      onde: "curriculo",
      etapa: "leitura",
      mensagem: leitura.erro,
      detalhe: `fala · ${textoDoErro(e)}`,
    });
    return responder(leitura);
  }
  if (!leitura.ok) {
    // a IA ou a transcrição falharam (aviso na hora); o resto é a fala que não serve (só registra)
    const doSistema = /^Não deu para (ouvir a gravação agora|preencher agora)/.test(leitura.erro);
    await registrarFalha({
      onde: "curriculo",
      etapa: doSistema ? "leitura" : "validacao",
      mensagem: leitura.erro,
      detalhe: "fala",
    });
  }
  return responder(leitura);
}
