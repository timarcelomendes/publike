"use client";

import { Store, UserSearch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { mudarVisibilidadeCurriculo, mudarVitrineCurriculo } from "@/lib/acoes/talentos";
import { useAcao } from "./ui/usar-acao";

/** O botão de ligar e desligar, com o título da opção como nome (`nivel`: o nível do título). */
export function Opcao({
  id,
  icone: Icone,
  titulo,
  ligado,
  pendente,
  aoMudar,
  nivel = 2,
  children,
}: {
  id: string;
  icone: LucideIcon;
  titulo: string;
  ligado: boolean;
  pendente: boolean;
  aoMudar: () => void;
  nivel?: 2 | 3;
  children: ReactNode;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <div className="flex items-start gap-3">
      <Icone aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        <Titulo id={id} className="scroll-mt-24 text-h3">
          {titulo}
        </Titulo>
        <div className="mt-1 text-body-sm text-ink-muted">{children}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-labelledby={id}
        disabled={pendente}
        onClick={aoMudar}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors disabled:opacity-60 ${
          ligado ? "border-transparent bg-cerrado" : "border-line-strong bg-surface-300"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform ${
            ligado ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Quem acha o currículo, além de quem anunciou uma vaga que a pessoa curtiu:
 *   "Deixar as empresas me encontrarem": quem tem vaga na cidade vê e convida (Talentos do painel).
 *   "Aparecer na aba Talentos": o resumo na busca, aberto a quem visita; as empresas que
 *   entraram veem o currículo completo. Ligar a aba liga as empresas; desligar as empresas
 *   desliga a aba.
 */
export function VisibilidadeCurriculo({
  visivel: visivelInicial,
  vitrine: vitrineInicial = false,
}: {
  visivel: boolean;
  vitrine?: boolean;
}) {
  const empresas = useAcao();
  const aba = useAcao();
  const [visivel, setVisivel] = useState(visivelInicial);
  const [vitrine, setVitrine] = useState(vitrineInicial);
  const pendente = empresas.pendente || aba.pendente;

  return (
    <section
      id="quem-acha"
      aria-label="Quem acha seu currículo"
      className="mt-6 flex scroll-mt-24 flex-col gap-5 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
    >
      <Opcao
        id="talentos-titulo"
        icone={UserSearch}
        titulo="Deixar as empresas me encontrarem"
        ligado={visivel}
        pendente={pendente}
        aoMudar={() => {
          const novo = !visivel;
          empresas.rodar(
            () => mudarVisibilidadeCurriculo(novo),
            (r) => {
              if (!r.ok) return;
              setVisivel(novo);
              if (!novo) setVitrine(false);
            },
          );
        }}
      >
        Quem tem vaga na sua cidade vê seu currículo e pode convidar você. Telefone e e-mail continuam escondidos, e o
        nome aparece encurtado (ex.: Maria S.). O contato só sai se você curtir a vaga e a empresa aceitar.
      </Opcao>
      {empresas.mensagem}

      <div className="border-t border-line pt-5">
        <Opcao
          id="vitrine-titulo"
          icone={Store}
          titulo="Aparecer na aba Talentos"
          ligado={vitrine}
          pendente={pendente}
          aoMudar={() => {
            const novo = !vitrine;
            aba.rodar(
              () => mudarVitrineCurriculo(novo),
              (r) => {
                if (!r.ok) return;
                setVitrine(novo);
                if (novo) setVisivel(true);
              },
            );
          }}
        >
          <p>
            Quem visita o Publike vê um resumo seu na aba Talentos da busca: o nome encurtado, o bairro, o que você faz,
            as habilidades, os cursos e os cargos (sem o nome das empresas). Empresas, comércios e agências que entraram
            na conta veem o currículo completo e podem convidar você para uma vaga, de qualquer cidade da região.
          </p>
          <p className="mt-1">Fica fora do Google. Telefone, e-mail e o PDF continuam escondidos.</p>
          {vitrine && (
            <p className="mt-2">
              <Link href="/talentos" className="text-label text-ink underline underline-offset-2">
                Ver a aba Talentos
              </Link>
            </p>
          )}
        </Opcao>
        {aba.mensagem}
      </div>
    </section>
  );
}
