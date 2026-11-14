import Link from "next/link";
import { obterMeuPerfil } from "@/lib/dados";
import type { ModoPainel } from "@/lib/modo-painel";
import { atividadesDoMenu } from "@/lib/servidor/modo";
import { soOlharComoPessoa } from "@/lib/servidor/so-olhar";

/**
 * Embaixo do título do quadro "Vagas impulsionadas na região", só para quem contrata (14/11/2026, Marcelo: "melhor
 * colocar algo que é exibido apenas para quem oferece vagas, tipo quer aparecer aqui?"): o convite para impulsionar uma
 * vaga, que leva às vagas da conta (o Impulsionar fica em cada uma). Quem procura trabalho, quem não entrou e a empresa
 * no "só olhar" veem só o título, que já diz que as vagas são impulsionadas. Vai dentro de um Suspense (lê a conta).
 */
export async function ConviteParaImpulsionar({ className = "" }: { className?: string }) {
  const [perfil, atividades, soOlhar] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    atividadesDoMenu().catch((): ModoPainel[] => []),
    soOlharComoPessoa().catch(() => false),
  ]);
  if (!perfil || soOlhar || !atividades.includes("contratar")) return null;
  return (
    <p className={`mt-1 text-body-sm text-ink-muted ${className}`}>
      Quer sua vaga aqui?{" "}
      <Link href="/painel/anuncios?tipo=vaga" className="font-semibold text-ink underline underline-offset-2">
        Impulsionar uma vaga
      </Link>
    </p>
  );
}
