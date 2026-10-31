"use client";

import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { salvarTestesDaVaga } from "@/lib/acoes/testes";
import { nomeCurtoDoTeste } from "@/lib/testes";
import { Selo } from "../ui/basicos";
import { Botao, BotaoLink } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/**
 * Logo depois de publicar: o Teste Prático que combina com a função já entrou na vaga (migração 20261224120000).
 * Diz qual é e deixa tirar com um clique.
 */
export function AvisoTesteNaVaga({ anuncioId, titulo }: { anuncioId: string; titulo: string | null }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [tirado, setTirado] = useState(false);
  // a página voltou sem o teste (tirado aqui, ou já não estava): sem o aviso, a não ser o "ficou sem teste"
  if (!titulo && !tirado) return null;
  const curto = titulo ? nomeCurtoDoTeste(titulo) : "";
  const nome = curto !== titulo ? `O Teste Prático de ${curto}` : `O teste “${titulo}”`;
  return (
    <section
      aria-labelledby="aviso-teste-na-vaga"
      className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <p id="aviso-teste-na-vaga" className="flex flex-wrap items-center gap-2 text-label">
        <ClipboardCheck aria-hidden className="size-5 text-ink-muted" />
        {tirado ? "A vaga ficou sem teste" : `${nome} já está na vaga`}
        {!tirado && <Selo variante="novo">Novo</Selo>}
      </p>
      {tirado ? (
        <p className="text-body-sm text-ink-muted">
          Quando quiser, ponha um teste pela aba Teste Prático da vaga, no painel.
        </p>
      ) : (
        <>
          <p className="text-body-sm text-ink-muted">
            Quem se candidatar pode fazer pelo celular, em cerca de 10 minutos. O resultado aparece no quadro da vaga, e
            é grátis. O teste é opcional: ninguém deixa de se candidatar por causa dele.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <BotaoLink href={`/painel/anuncio/${anuncioId}/testes`} tamanho="sm" variante="secundario">
              Ver o teste da vaga
            </BotaoLink>
            <Botao
              tamanho="sm"
              variante="secundario"
              disabled={pendente}
              onClick={() =>
                rodar(
                  () => salvarTestesDaVaga(anuncioId, []),
                  (r) => r.ok && setTirado(true),
                )
              }
            >
              {pendente ? "Tirando…" : "Tirar o teste"}
            </Botao>
          </div>
        </>
      )}
      {!tirado && mensagem}
    </section>
  );
}
