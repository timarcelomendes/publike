import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormCliente } from "@/components/painel/form-cliente";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Adicionar cliente" };

export default function NovoCliente() {
  return (
    <div className="max-w-3xl">
      <Link
        href="/painel/clientes"
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Clientes
      </Link>
      <h2 className="mt-1 text-h2">Adicionar cliente</h2>
      <p className="mt-1 mb-6 text-body text-ink-muted">
        Só o nome é obrigatório. Na vaga aparece só o nome (ou “Empresa confidencial”); o resto fica só com você.
      </p>
      <Suspense fallback={<Esqueleto className="h-[40rem] w-full rounded-lg" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/clientes/novo");
  const perfil = await obterMeuPerfil();
  if (perfil?.tipo !== "agencia") {
    return (
      <Aviso tipo="alerta" titulo="Clientes é para agência de emprego e RH">
        <p>Mude o tipo da conta para Agência / RH no perfil, com o CNPJ da agência, para cadastrar clientes.</p>
        <p className="mt-2">
          <BotaoLink href="/perfil" tamanho="sm">
            Abrir o perfil
          </BotaoLink>
        </p>
      </Aviso>
    );
  }
  return <FormCliente cliente={null} cidadePadrao={perfil.cidade} />;
}
