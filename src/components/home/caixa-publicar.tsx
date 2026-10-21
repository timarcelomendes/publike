import { Briefcase, FileUser, ImageUp, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { iaLigadaNoSite, obterMeuCurriculo, obterMeuPerfil } from "@/lib/dados";
import { perfilDeUso } from "@/lib/servidor/perfil-de-uso";
import { Avatar } from "../ui/basicos";

type Acao = { nome: string; rotulo: string; href: string; icone: LucideIcon; cor: string };

/**
 * A caixa de publicar no alto do feed, como o "Começar publicação" do LinkedIn: para quem entrou,
 * os botões de publicar saíram do topo da página para cá. O convite e a ordem seguem o perfil:
 * quem procura trabalho começa pelo currículo; quem presta serviço, pela vitrine; quem contrata,
 * pela vaga. No celular, quem publica é o botão da barra de baixo.
 */
export async function CaixaDePublicar() {
  const [perfil, uso, ia] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    perfilDeUso(),
    iaLigadaNoSite().catch(() => false),
  ]);
  if (!perfil) return null;
  const temCurriculo = uso !== "contratar" && Boolean(await obterMeuCurriculo().catch(() => null));
  const vaga: Acao = {
    nome: "Vaga",
    rotulo: "Publicar vaga",
    href: "/publicar",
    icone: Briefcase,
    cor: "text-terra-text",
  };
  const pelaFoto: Acao = {
    nome: "Pela foto",
    rotulo: "Publicar vaga pela foto da arte",
    href: "/publicar#arte",
    icone: ImageUp,
    cor: "text-ink",
  };
  const servico: Acao = {
    nome: "Serviço",
    rotulo: "Colocar serviço na vitrine",
    href: "/painel/servicos",
    icone: Wrench,
    cor: "text-cerrado-text",
  };
  const curriculo: Acao = {
    nome: "Currículo",
    rotulo: temCurriculo ? "Meu currículo" : "Cadastrar currículo",
    href: temCurriculo ? "/perfil/curriculo" : "/perfil/curriculo?para=talentos",
    icone: FileUser,
    cor: "text-ink",
  };
  const { convite, destino, acoes }: { convite: string; destino: string; acoes: Acao[] } =
    uso === "contratar"
      ? {
          convite: "Publicar uma vaga grátis",
          destino: vaga.href,
          acoes: ia ? [vaga, pelaFoto, servico] : [vaga, servico],
        }
      : uso === "servicos"
        ? { convite: "Colocar um serviço na vitrine", destino: servico.href, acoes: [servico, vaga, curriculo] }
        : {
            convite: temCurriculo ? "Atualizar meu currículo" : "Cadastre seu currículo e apareça para as empresas",
            destino: curriculo.href,
            acoes: [curriculo, servico, vaga],
          };
  return (
    <section
      aria-label="Publicar"
      className="mb-4 hidden rounded-lg border border-line bg-surface-200 px-4 pt-4 pb-2 shadow-card md:block"
    >
      <div className="flex items-center gap-3">
        <Avatar
          nome={perfil.nome}
          foto={perfil.foto}
          tamanho={48}
          forma={perfil.tipo === "pessoa" ? "redonda" : "quadrada"}
          colorida
        />
        <Link
          href={destino}
          className="flex min-h-12 min-w-0 flex-1 items-center rounded-pill border border-line-strong px-5 text-label text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink"
        >
          <span className="truncate">{convite}</span>
        </Link>
      </div>
      <ul className="mt-2 flex flex-wrap items-center justify-around gap-1">
        {acoes.map((a) => (
          <li key={a.nome}>
            <Link
              href={a.href}
              aria-label={a.rotulo}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-label text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink"
            >
              <a.icone aria-hidden className={`size-5 shrink-0 ${a.cor}`} />
              {a.nome}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
