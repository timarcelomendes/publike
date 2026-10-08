import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcoesModeracao } from "@/components/painel/acoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Container, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { MOTIVOS_DENUNCIA, STATUS_ANUNCIO } from "@/lib/constantes";
import { ehModerador, filaModeracao } from "@/lib/dados";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";

export const metadata: Metadata = {
  title: "Moderação",
  robots: { index: false },
};

export default function Moderacao() {
  return (
    <Container className="py-8">
      <h1 className="text-h2 sm:text-h1">Moderação</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Anúncios com denúncias abertas. Com três denúncias de pessoas diferentes, o anúncio sai do ar sozinho até você
        decidir.
      </p>
      <Suspense fallback={<EsqueletoLista />}>
        <Conteudo />
      </Suspense>
    </Container>
  );
}

const NOME_MOTIVO = Object.fromEntries(MOTIVOS_DENUNCIA.map((m) => [m.valor, m.nome]));

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/moderacao");
  if (!(await ehModerador())) notFound();
  const fila = await filaModeracao();
  const agora = await agoraDaRequisicao();

  if (fila.length === 0) {
    return (
      <Vazio icone={ShieldCheck} titulo="Nenhuma denúncia aberta">
        Tudo em ordem por aqui.
      </Vazio>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {fila.map((item) => (
        <li key={item.anuncio_id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Selo variante={item.status === "em_analise" ? "perigo" : "contorno"}>
              {STATUS_ANUNCIO[item.status as StatusAnuncio]?.nome ?? item.status}
            </Selo>
            <Selo variante="aviso">
              {item.denuncias_abertas} {item.denuncias_abertas === 1 ? "denúncia" : "denúncias"}
            </Selo>
          </div>
          <h2 className="text-h3">
            <Link href={`/anuncio/${item.anuncio_id}`} className="underline-offset-2 hover:underline">
              {item.titulo}
            </Link>
          </h2>
          <p className="text-body-sm text-ink-muted">
            Por{" "}
            <Link href={`/perfil/${item.autor_id}`} className="underline">
              {item.autor_nome}
            </Link>{" "}
            · {formatarLugar(item.bairro, item.cidade)} · publicado {tempoRelativo(item.criado_em, agora)}
          </p>
          <div className="flex flex-wrap gap-2">
            {item.motivos.map((m) => (
              <Selo key={m} variante="contorno">
                {NOME_MOTIVO[m] ?? m}
              </Selo>
            ))}
          </div>
          {item.detalhes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {item.detalhes.map((d, i) => (
                <li key={i} className="rounded-md bg-surface-300 p-3 text-body-sm">
                  “{d}”
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line pt-3">
            <AcoesModeracao anuncioId={item.anuncio_id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
