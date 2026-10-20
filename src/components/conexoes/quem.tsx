import { MapPin } from "lucide-react";
import Link from "next/link";
import type { Conexao } from "@/lib/conexoes";
import { TIPOS_CONTA } from "@/lib/constantes";
import { formatarLugar } from "@/lib/formato";
import type { TipoConta } from "@/lib/tipos";
import { Avatar } from "../ui/basicos";

/** O que é a outra ponta: "Procura trabalho", "Comércio", "Empresa", "Agência / RH". */
export function nomeDoLado(tipo: string) {
  if (tipo === "pessoa") return "Procura trabalho";
  return TIPOS_CONTA[(tipo as TipoConta) in TIPOS_CONTA ? (tipo as TipoConta) : "empresa"].nome;
}

/** Onde ver a outra ponta: o currículo (talento na aba) ou a página da empresa. */
export function linkDoOutro(c: Pick<Conexao, "outro_id" | "outro_tipo" | "outro_na_vitrine">) {
  return c.outro_tipo === "pessoa" && c.outro_na_vitrine ? `/talentos/${c.outro_id}` : `/perfil/${c.outro_id}`;
}

/** A outra ponta da conexão: foto, nome (com o link, se não estiver dentro de outro), o que é e onde fica. */
export function QuemConexao({
  c,
  tamanho = 48,
  titulo = false,
  link = true,
}: {
  c: Conexao;
  tamanho?: number;
  titulo?: boolean;
  /** false quando o item todo já é um link (não dá para pôr link dentro de link) */
  link?: boolean;
}) {
  const Nome = titulo ? "h2" : "p";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={tamanho} />
      <div className="min-w-0 flex-1">
        <Nome className={`truncate ${titulo ? "text-h3" : "text-label"}`}>
          {link ? (
            <Link href={linkDoOutro(c)} className="underline-offset-2 hover:underline">
              {c.outro_nome}
            </Link>
          ) : (
            c.outro_nome
          )}
        </Nome>
        <p className="flex min-w-0 items-center gap-1 text-body-sm text-ink-muted">
          <span className="shrink-0">{nomeDoLado(c.outro_tipo)}</span>
          <span aria-hidden>·</span>
          <MapPin aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{formatarLugar(c.outro_bairro, c.outro_cidade)}</span>
        </p>
      </div>
    </div>
  );
}
