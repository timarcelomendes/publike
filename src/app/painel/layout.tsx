import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { MenuPainel, MenuPainelEsqueleto } from "@/components/painel/menu-painel";
import { Container } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { pendenciasDeConexao } from "@/lib/conexoes";
import { listarMeusAnuncios, listarMinhasConversas, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { COOKIE_MODO, lerModo, modoPadrao, type Contadores } from "@/lib/modo-painel";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { minhasContas } from "@/lib/servidor/equipe";
import { obterIntencao } from "@/lib/servidor/intencao";

export const metadata: Metadata = { title: "Meu painel", robots: { index: false } };

// O painel: o menu do modo (Contratar, Trabalhar ou Serviços) na coluna da esquerda e a
// página ao lado. No celular, o menu vira uma linha em cima da página.
export default function LayoutPainel({ children }: LayoutProps<"/painel">) {
  return (
    <Container className="py-6 sm:py-8">
      <h1 className="sr-only">Meu painel</h1>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="lg:sticky lg:top-20">
          <Suspense fallback={<MenuPainelEsqueleto />}>
            <MenuDaConta />
          </Suspense>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}

/** O modo escolhido (ou o da conta) e os números do menu: quem espera resposta e mensagens novas. */
async function MenuDaConta() {
  if (MODO_DEMO) {
    return (
      <MenuPainel modo="trabalhar" contadores={{ responder: 0, pedidos: 0, mensagens: 0, conexoes: 0 }} nome={null} />
    );
  }
  const [perfil, intencao, anuncios, conversas, jar, usuario, contas, conexoes] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    obterIntencao().catch(() => null),
    listarMeusAnuncios().catch(() => []),
    listarMinhasConversas().catch(() => null),
    cookies(),
    obterUsuario(),
    // a conta da pessoa e as das equipes de que faz parte (com mais de uma, dá para trocar)
    minhasContas().catch(() => []),
    minhasConexoes().catch(() => null),
  ]);
  const modo = lerModo(jar.get(COOKIE_MODO)?.value) ?? modoPadrao(perfil?.tipo, intencao);
  const soma = (tipo: string) =>
    anuncios.filter((a) => a.tipo === tipo).reduce((total, a) => total + (a.curtidas_novas ?? 0), 0);
  const contadores: Contadores = {
    responder: soma("vaga"),
    pedidos: soma("servico"),
    mensagens: (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0),
    conexoes: pendenciasDeConexao(conexoes ?? []),
  };
  return (
    <MenuPainel
      modo={modo}
      contadores={contadores}
      nome={perfil?.nome ?? null}
      tipoConta={perfil?.tipo ?? null}
      contas={contas}
      papel={usuario?.papel ?? "dono"}
    />
  );
}
