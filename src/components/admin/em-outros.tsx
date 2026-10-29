"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { mudarCategoria } from "@/lib/acoes/admin";
import { categoriaSugerida } from "@/lib/categoria-sugerida";
import { categoria as daCategoria, CATEGORIAS } from "@/lib/constantes";
import { formatarLugar } from "@/lib/formato";
import { Selo } from "../ui/basicos";
import { classesBotao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";

type AnuncioEmOutros = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  status: string;
  cidade: string;
  bairro: string | null;
};

/** Admin › Anúncios › Em Outros: cada anúncio com a área que o título sugere e o botão para mudar. */
export function ListaEmOutros({ anuncios }: { anuncios: AnuncioEmOutros[] }) {
  // as que têm sugestão primeiro: é o clique mais rápido
  const ordem = [...anuncios].sort(
    (a, b) => Number(!categoriaSugerida(a.titulo, a.descricao)) - Number(!categoriaSugerida(b.titulo, b.descricao)),
  );
  return (
    <ul className="flex flex-col gap-2" aria-label="Anúncios em Outros">
      {ordem.map((a) => (
        <LinhaEmOutros key={a.id} a={a} />
      ))}
    </ul>
  );
}

function LinhaEmOutros({ a }: { a: AnuncioEmOutros }) {
  const sugerida = categoriaSugerida(a.titulo, a.descricao);
  const [escolhida, setEscolhida] = useState<string>(sugerida ?? "");
  const [feita, setFeita] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Selo>{a.tipo === "vaga" ? "Vaga" : "Serviço"}</Selo>
        {a.status !== "ativo" && <Selo variante="aviso">{a.status === "pausado" ? "Pausado" : "Em análise"}</Selo>}
        <Link href={`/admin/anuncios/${a.id}`} className="text-label hover:underline">
          {a.titulo}
        </Link>
        <span className="text-body-sm text-ink-muted">{formatarLugar(a.bairro, a.cidade)}</span>
      </div>
      {feita ? (
        <p role="status" className="text-body-sm text-cerrado-text">
          Agora em {daCategoria(feita).nome}.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-ink-muted">
            {sugerida ? `Sugestão: ${daCategoria(sugerida).nome}` : "Sem sugestão pelo título"}
          </span>
          <Seletor
            aria-label={`Área de “${a.titulo}”`}
            value={escolhida}
            onChange={(e) => setEscolhida(e.target.value)}
            className={`${classesEntrada} min-h-10 py-1.5`}
            envoltorio="w-60"
          >
            <option value="">Escolher a área</option>
            {CATEGORIAS.filter((c) => c.slug !== "outros").map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </Seletor>
          <button
            type="button"
            disabled={!escolhida || pendente}
            className={classesBotao("secundario", "sm")}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await chamarAcao(() => mudarCategoria(a.id, escolhida));
                if (r.ok) setFeita(escolhida);
                else setErro(r.erro);
              })
            }
          >
            {escolhida ? `Mudar para ${daCategoria(escolhida).nome}` : "Mudar"}
          </button>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}
