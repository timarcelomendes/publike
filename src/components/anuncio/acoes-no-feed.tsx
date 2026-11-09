import type { ResumoComentarios } from "@/lib/comentarios";
import { ComentariosNaJanela } from "./comentarios-no-feed";
import { IndicarNaJanela } from "./indicar-por-email";

// Os comentários e o "Indicar" à vista no cartão da vaga das listas (Vagas, busca): o botão dos comentários, com o
// número, abre a conversa numa janela por cima da lista (sem sair dela), e o "Indicar a um amigo" abre a janela do
// e-mail. Na linha do tempo da home, os dois ficam embaixo do tíquete (comentarios-no-feed.tsx).

/** Os dois botões juntos: comentários e indicar (vaga de outra conta, no ar). */
export function AcoesDaVagaNoCartao({
  anuncioId,
  titulo,
  comentarios,
  logado,
  pequeno = false,
}: {
  anuncioId: string;
  titulo: string;
  comentarios: ResumoComentarios;
  logado: boolean;
  pequeno?: boolean;
}) {
  return (
    <span className="relative z-10 flex items-center gap-2">
      {(comentarios.total > 0 || comentarios.ligados) && (
        <ComentariosNaJanela anuncioId={anuncioId} titulo={titulo} resumo={comentarios} pequeno={pequeno} />
      )}
      <IndicarNaJanela anuncioId={anuncioId} titulo={titulo} logado={logado} jeito={pequeno ? "pequeno" : "icone"} />
    </span>
  );
}
