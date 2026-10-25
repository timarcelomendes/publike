import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BarraInferiorAtiva } from "./barra-inferior-ativa";
import { BarraInferiorBase } from "./barra-inferior-base";
import { BotaoInstalarApp } from "./instalar-app";
import { caminhoDaBusca, CIDADES_PRINCIPAIS } from "@/lib/paginas-busca";
import { Container, Logo } from "./ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { listarMeusAnuncios, obterUsuario } from "@/lib/dados";
import { caminhoDaConta } from "@/lib/servidor/caminho";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { modoDaConta } from "@/lib/servidor/modo";

export function BarraInferior() {
  return (
    // enquanto carrega, a barra vazia (sem mostrar as abas de outra pessoa)
    <Suspense fallback={<BarraInferiorBase ativo={null} abas={null} />}>
      <BarraDoModo />
    </Suspense>
  );
}

/**
 * A barra de quem tem conta segue o modo (Contratar, Trabalhar ou Serviços), com os números do que
 * espera a pessoa: os candidatos ou os pedidos para responder e as mensagens novas.
 */
async function BarraDoModo() {
  const usuario = MODO_DEMO ? null : await obterUsuario();
  if (!usuario) return <BarraInferiorAtiva modo={null} />;
  const modo = await modoDaConta().catch(() => "trabalhar" as const);
  const [conversas, anuncios, caminho] = await Promise.all([
    conversasPorPessoa().catch(() => null),
    modo === "trabalhar" ? Promise.resolve([]) : listarMeusAnuncios().catch(() => []),
    modo === "contratar" ? caminhoDaConta().catch(() => null) : Promise.resolve(null),
  ]);
  const soma = (tipo: string) =>
    anuncios.filter((a) => a.tipo === tipo).reduce((total, a) => total + (a.curtidas_novas ?? 0), 0);
  return (
    <BarraInferiorAtiva
      modo={modo}
      numeros={{
        mensagens: (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0),
        segunda:
          modo === "contratar" ? (caminho?.responder ?? soma("vaga")) : modo === "servicos" ? soma("servico") : 0,
      }}
    />
  );
}

export function Rodape() {
  const link = "text-ink-muted hover:text-ink hover:underline";
  return (
    <footer className="mt-16 border-t border-line bg-surface-200">
      <Container className="flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo altura={32} />
          <p className="mt-3 text-body-sm text-ink-muted">
            Uma ferramenta do povo para gerar emprego: trabalho perto de casa, de graça.
          </p>
          <p className="mt-3 font-display text-h3">Publicou, curtiu, trabalhou.</p>
        </div>
        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-10 gap-y-3 text-body-sm">
          <Link href="/?tipo=vaga" className={link}>
            Vagas
          </Link>
          <Link href="/como-funciona" className={link}>
            Como funciona
          </Link>
          <Link href="/missao" className={link}>
            Nossa missão
          </Link>
          <Link href="/gratis" className={link}>
            É grátis
          </Link>
          <Link href="/conteudos" className={link}>
            Conteúdos sobre trabalho
          </Link>
          <Link href="/noticias" className={link}>
            Notícias
          </Link>
          <Link href="/?tipo=servico" className={link}>
            Serviços
          </Link>
          <Link href="/como-funciona#seguranca" className={link}>
            Dicas de segurança
          </Link>
          <Link href="/publicar" className={link}>
            Publicar grátis
          </Link>
          <Link href="/empresas" className={link}>
            Para empresas
          </Link>
          <Link href="/profissionais" className={link}>
            Para profissionais
          </Link>
          <Link href="/privacidade" className={link}>
            Privacidade
          </Link>
          <Link href="/cookies" className={link}>
            Cookies
          </Link>
          <Link href="/regras" className={link}>
            Regras
          </Link>
          <Link href="/ajuda" className={link}>
            Ajuda
          </Link>
          <Link href="/sugerir" className={link}>
            Sugestões e erros
          </Link>
          <BotaoInstalarApp className={`${link} text-left`} />
        </nav>
      </Container>
      {/* links das páginas de busca por cidade (ajudam quem procura e o Google) */}
      <Container className="flex flex-col gap-2 border-t border-line py-5 text-body-sm">
        {(["vaga", "servico"] as const).map((tipo) => (
          <nav key={tipo} aria-label={tipo === "vaga" ? "Vagas por cidade" : "Serviços por cidade"}>
            <span className="text-ink">{tipo === "vaga" ? "Vagas de emprego em" : "Profissionais em"}</span>{" "}
            {CIDADES_PRINCIPAIS.map((c, i) => (
              <span key={c}>
                {i > 0 && <span className="text-ink-muted"> · </span>}
                <Link href={caminhoDaBusca(tipo, c)} className={link}>
                  {c}
                </Link>
              </span>
            ))}
          </nav>
        ))}
      </Container>
      <Container className="border-t border-line py-4 text-body-sm text-ink-muted">
        Feito em Goiânia.{" "}
        <Link href="/gratis" className="underline underline-offset-2 hover:text-ink">
          Grátis
        </Link>{" "}
        para quem trabalha, para quem presta serviço e para empresas de qualquer tamanho.
      </Container>
    </footer>
  );
}

/** O rodapé das telas que funcionam como app (painel, perfil): uma linha só. */
export function RodapeCurto() {
  const link = "text-ink-muted hover:text-ink hover:underline";
  return (
    <footer className="mt-12 border-t border-line">
      <Container className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 text-body-sm">
        <span className="text-ink-muted">Publike · grátis</span>
        <Link href="/ajuda" className={link}>
          Ajuda
        </Link>
        <Link href="/privacidade" className={link}>
          Privacidade e regras
        </Link>
        <Link href="/sugerir" className={link}>
          Sugestões e erros
        </Link>
      </Container>
    </footer>
  );
}

export function AvisoDemo() {
  return (
    <div className="border-b border-line bg-ipe text-on-ipe">
      <Container className="flex items-start gap-2 py-2 text-body-sm sm:items-center">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p>
          <strong>Modo demonstração.</strong> Os anúncios são exemplos e nada é salvo. Para publicar de verdade, conecte
          o Supabase (passo a passo no README).
        </p>
      </Container>
    </div>
  );
}
