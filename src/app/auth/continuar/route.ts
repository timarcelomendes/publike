import { NextResponse, type NextRequest } from "next/server";
import { obterMeuPerfil, obterUsuario, perfilParaEntrar } from "@/lib/dados";
import { caminhoSeguro } from "@/lib/formato";
import { COOKIE_CHEGADA, COOKIE_ENTRADA, COOKIE_ORIGEM } from "@/lib/origem";
import { registrarOrigemDaConta } from "@/lib/servidor/origem";
import { criarPerfilSozinho } from "@/lib/servidor/perfil-sozinho";
import { destinoParaJuntar } from "@/lib/servidor/juntar-whatsapp";

// Depois de entrar: quem ainda não tem perfil com WhatsApp vai completar;
// os outros seguem para onde estavam indo.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = caminhoSeguro(url.searchParams.get("next"), "/");
  const base = process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "") : url.origin;

  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(`${base}/entrar?next=${encodeURIComponent(proximo)}`);

  // De onde a conta veio (a campanha do link; sem ela, também o canal da chegada e a página de entrada): se a conta
  // acabou de nascer, o banco anota (só conta nova conta). O cookie deste navegador ou, sem ele (o link do e-mail
  // aberto em outro navegador), o que veio no link.
  const cookie = (nome: string) => request.cookies.get(nome)?.value;
  await registrarOrigemDaConta({
    origem: cookie(COOKIE_ORIGEM) ?? url.searchParams.get("origem"),
    chegada: cookie(COOKIE_CHEGADA) ?? url.searchParams.get("chegada"),
    entrada: cookie(COOKIE_ENTRADA) ?? url.searchParams.get("entrada"),
  });

  // conta nova pelo WhatsApp com o número no cadastro de outra conta: a pergunta de juntar antes (o cookie da prova vai
  // nesta resposta, gravado pelo cookies() do servidor)
  const juntar = await destinoParaJuntar(proximo);
  if (juntar) return NextResponse.redirect(`${base}${juntar}`);

  const perfil = await obterMeuPerfil();
  // conta nova pela rede (Google, LinkedIn), procurando trabalho: o perfil nasce sozinho, sem a tela do cadastro
  const nasceu = !perfil && (await criarPerfilSozinho(proximo));
  const resposta = NextResponse.redirect(
    nasceu || perfilParaEntrar(perfil)
      ? `${base}${proximo}`
      : `${base}/perfil?completar=1&next=${encodeURIComponent(proximo)}`,
  );
  // já serviram: quem entra de novo depois não conta outra vez
  for (const nome of [COOKIE_ORIGEM, COOKIE_CHEGADA, COOKIE_ENTRADA]) {
    if (cookie(nome) !== undefined) resposta.cookies.delete(nome);
  }
  return resposta;
}
