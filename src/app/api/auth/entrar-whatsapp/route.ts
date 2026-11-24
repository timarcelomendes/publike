import { NextResponse, type NextRequest } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { destinoSeguro, TOKEN_ENTRADA } from "@/lib/servidor/entrar-pelo-whatsapp";
import { acessoFila } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { telefoneDoLogin } from "@/lib/telefone-login";

// O botão de /entrar/whatsapp (migração 20270920120000): gasta o link, pede ao Auth o código do celular (o gancho guarda
// em vez de mandar), confere o código e abre a sessão; segue para o destino (o currículo para conferir e salvar, por
// exemplo). Qualquer falha cai no caminho de sempre: o destino pede para entrar com o código.

const ir = (request: NextRequest, caminho: string) => {
  const r = NextResponse.redirect(new URL(caminho, request.url), 303);
  r.headers.set("Cache-Control", "no-store");
  r.headers.set("Referrer-Policy", "no-referrer");
  return r;
};

export async function POST(request: NextRequest) {
  const dados = await request.formData().catch(() => null);
  const token = String(dados?.get("t") ?? "");
  const acesso = acessoFila();
  if (MODO_DEMO || !acesso || !TOKEN_ENTRADA.test(token)) return ir(request, "/entrar/whatsapp?erro=link");
  const { cliente: banco, chave } = acesso;

  // o número do link, no formato do login (com o 9)
  const { data: visto } = await banco.rpc("servidor_ver_entrada_whatsapp", { p_chave: chave, p_token: token });
  const ver = (visto ?? null) as { numero?: string; destino?: string } | null;
  const login = ver?.numero ? telefoneDoLogin(ver.numero) : null;
  if (!ver || !login) return ir(request, "/entrar/whatsapp?erro=link");
  const destino = destinoSeguro(ver.destino);
  const peloCodigo = `/entrar?de=whatsapp&next=${encodeURIComponent(destino)}`;

  const { data: usado } = await banco.rpc("servidor_usar_entrada_whatsapp", {
    p_chave: chave,
    p_token: token,
    p_numero_do_login: login,
  });
  if (!usado) return ir(request, "/entrar/whatsapp?erro=link");

  const supabase = await criarClienteServidor();
  const telefone = `+${login}`;
  const { error: erroPedido } = await supabase.auth.signInWithOtp({ phone: telefone, options: { shouldCreateUser: true } });
  if (erroPedido) {
    console.error("Publike: entrar com um toque, o pedido do código falhou:", erroPedido.message);
    return ir(request, peloCodigo);
  }
  const { data: codigo } = await banco.rpc("servidor_pegar_codigo", { p_chave: chave, p_numero: login });
  if (typeof codigo !== "string") {
    // o gancho mandou o código pela conversa em vez de guardar (ou não rodou): a pessoa digita no /entrar
    console.error("Publike: entrar com um toque, o código não ficou guardado.");
    return ir(request, peloCodigo);
  }
  const { error: erroCodigo } = await supabase.auth.verifyOtp({ phone: telefone, token: codigo, type: "sms" });
  if (erroCodigo) {
    console.error("Publike: entrar com um toque, o código não valeu:", erroCodigo.message);
    return ir(request, peloCodigo);
  }
  return ir(request, destino);
}
