"use client";

import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { comecarTesteDaVaga } from "@/lib/acoes/testes";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

type TesteDaVaga = { modelo_id: string; titulo: string; questoes: number; obrigatoria: boolean };
type MeuTeste = { id: string; modelo_id: string; status: string; vencida: boolean };

/** Na página da vaga, para quem curtiu: os testes que a vaga pede e o botão de fazer. */
export function TestesParaMim({
  anuncioId,
  testes,
  meus,
}: {
  anuncioId: string;
  testes: TesteDaVaga[];
  meus: MeuTeste[];
}) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
      <p className="flex items-center gap-2 text-label">
        <ClipboardCheck aria-hidden className="size-5 text-ink-muted" />
        {testes.length === 1 ? "Esta vaga tem um teste" : `Esta vaga tem ${testes.length} testes`}
      </p>
      <ul className="flex flex-col gap-2">
        {testes.map((t) => {
          const meu = meus.find((m) => m.modelo_id === t.modelo_id);
          return (
            <li key={t.modelo_id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-sm">
                {t.titulo}
                <span className="text-ink-muted">
                  {" "}
                  · {t.questoes} questões · {t.obrigatoria ? "a empresa pede" : "opcional"}
                </span>
              </span>
              {meu?.status === "feita" ? (
                <Link href={`/testes/${meu.id}`} className="text-label text-cerrado-text underline">
                  Feito
                </Link>
              ) : meu?.vencida ? (
                <span className="text-body-sm text-ink-muted">Prazo acabou</span>
              ) : (
                <Botao
                  tamanho="sm"
                  variante={t.obrigatoria ? "primario" : "secundario"}
                  disabled={pendente}
                  onClick={() => rodar(() => comecarTesteDaVaga(anuncioId, t.modelo_id))}
                >
                  {meu ? "Continuar o teste" : "Fazer o teste"}
                </Botao>
              )}
            </li>
          );
        })}
      </ul>
      {mensagem}
      <p className="text-body-sm text-ink-muted">
        O resultado vai junto com a sua candidatura. Ninguém é recusado só pelo teste.
      </p>
    </div>
  );
}
