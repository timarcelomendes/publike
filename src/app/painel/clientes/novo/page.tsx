import type { Metadata } from "next";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
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
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        voltar={{ href: "/painel/clientes", nome: "Clientes" }}
        titulo="Adicionar cliente"
        descricao="Só o nome é obrigatório. Na vaga aparece só o nome (ou “Empresa confidencial”); o resto fica só com você."
      />
      {/* um formulário: numa coluna de ler bem */}
      <div className="max-w-3xl">
        <Suspense fallback={<Esqueleto className="h-[40rem] w-full rounded-lg" />}>
          <Conteudo />
        </Suspense>
      </div>
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
