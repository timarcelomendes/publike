import type { Metadata } from "next";
import { Suspense } from "react";
import { BotaoApagarChave, FormNovaChave } from "@/components/admin/chaves";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao, Situacao } from "@/components/admin/ui";
import { listarChavesServidor } from "@/lib/admin/dados";
import { formatarDataCurta, tempoRelativo } from "@/lib/formato";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Chaves" };

export default function Chaves() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [chaves, agora] = await Promise.all([listarChavesServidor(c), agoraDaRequisicao()]);
  const filas = situacaoFilas();

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Chave do servidor"
        descricao={
          <>
            O site publicado usa esta chave para mandar os e-mails e rodar a IA. Ela não abre o admin nem lê os dados das
            pessoas: só pega o que está na fila. A chave secreta do Supabase fica só neste computador.
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Situacao ok>
            Este computador usa a {filas.acesso === "chave do servidor" ? "chave do servidor (PUBLIKE_CHAVE_SERVIDOR)" : "chave secreta do Supabase"}.
          </Situacao>
          <Situacao ok={chaves.length > 0}>
            {chaves.length > 0
              ? `${chaves.length} chave(s) criada(s) para outros lugares.`
              : "Nenhuma chave criada ainda. Crie uma antes de publicar o site."}
          </Situacao>
        </div>
      </Secao>

      {chaves.length > 0 && (
        <Secao titulo="Chaves criadas" descricao="O banco guarda só uma impressão de cada chave, não a chave em si. Perdeu uma? Apague e gere outra.">
          <ul className="flex flex-col divide-y divide-line">
            {chaves.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex flex-col">
                  <span className="text-label">{k.nome}</span>
                  <span className="text-body-sm text-ink-muted">
                    Criada em {formatarDataCurta(k.criada_em)} ·{" "}
                    {k.usada_em ? `usada ${tempoRelativo(k.usada_em, agora)}` : "ainda não usada"}
                  </span>
                </div>
                <BotaoApagarChave id={k.id} nome={k.nome} />
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Gerar uma chave">
        <FormNovaChave />
      </Secao>
    </div>
  );
}
