import { ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcoesModeracaoAnuncio } from "@/components/admin/acoes-anuncio";
import { SeloStatus } from "@/components/admin/ui";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { Selo, Vazio } from "@/components/ui/basicos";
import { filaDaModeracao } from "@/lib/admin/dados";
import { CATEGORIAS_IA } from "@/lib/admin/textos";
import { MOTIVOS_DENUNCIA } from "@/lib/constantes";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Denúncias" };

const NOME_MOTIVO: Record<string, string> = Object.fromEntries(MOTIVOS_DENUNCIA.map((m) => [m.valor, m.nome]));

export default function Denuncias() {
  return (
    <>
      <p className="mb-6 max-w-3xl text-body text-ink-muted">
        Anúncios com denúncias abertas, os que a IA tirou do ar e os que ela não conseguiu revisar. Com três denúncias de
        pessoas diferentes, o anúncio sai do ar sozinho até alguém decidir.
      </p>
      <Suspense fallback={<EsqueletoLista />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  const acesso = await acessoDaEquipe();
  if (!acesso) notFound();
  const [fila, agora] = await Promise.all([filaDaModeracao(acesso.cliente), agoraDaRequisicao()]);

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
            <SeloStatus status={item.status} />
            {item.denuncias_abertas > 0 && (
              <Selo variante="aviso">
                {item.denuncias_abertas} {item.denuncias_abertas === 1 ? "denúncia" : "denúncias"}
              </Selo>
            )}
            {item.ia_retido && (
              <Selo variante="aviso">
                <Sparkles aria-hidden />
                Retido pela IA
              </Selo>
            )}
            {item.ia_falhou && (
              <Selo variante="contorno">
                <Sparkles aria-hidden />
                A IA não conseguiu revisar
              </Selo>
            )}
          </div>
          <h2 className="text-h3">
            <Link href={`/admin/anuncios/${item.anuncio_id}`} className="underline-offset-2 hover:underline">
              {item.titulo}
            </Link>
          </h2>
          <p className="text-body-sm text-ink-muted">
            Por{" "}
            {acesso.admin ? (
              <Link href={`/admin/usuarios/${item.autor_id}`} className="underline">
                {item.autor_nome}
              </Link>
            ) : (
              item.autor_nome
            )}{" "}
            · {formatarLugar(item.bairro, item.cidade)} · publicado {tempoRelativo(item.criado_em, agora)}
          </p>
          {item.ia_falhou && (
            <p className="rounded-md bg-surface-300 p-3 text-body-sm">
              O anúncio continua no ar, mas ninguém conferiu o texto. Leia e, se estiver tudo certo, marque como revisado.
            </p>
          )}
          {item.ia_retido && (
            <div className="flex flex-col gap-2 rounded-md bg-terra-soft p-3 text-body-sm">
              <div className="flex flex-wrap gap-2">
                {item.ia_categorias.map((c) => (
                  <Selo key={c} variante="contorno">
                    {CATEGORIAS_IA[c] ?? c}
                  </Selo>
                ))}
              </div>
              {item.ia_explicacao && <p>IA: {item.ia_explicacao}</p>}
            </div>
          )}
          {item.motivos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.motivos.map((m) => (
                <Selo key={m} variante="contorno">
                  {NOME_MOTIVO[m] ?? m}
                </Selo>
              ))}
            </div>
          )}
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
            <AcoesModeracaoAnuncio
              anuncioId={item.anuncio_id}
              status={item.status}
              denunciasAbertas={item.denuncias_abertas}
              iaFalhou={item.ia_falhou}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
