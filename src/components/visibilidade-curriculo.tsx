"use client";

import { Store, UserSearch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { mudarVisibilidadeCurriculo, mudarVitrineCurriculo } from "@/lib/acoes/talentos";
import { useAcao } from "./ui/usar-acao";

/**
 * O botão de ligar e desligar, com o título da opção como nome (`nivel`: o nível do título; `menor`: o título em
 * letra de texto, quando a parte já tem um título em cima).
 */
export function Opcao({
  id,
  icone: Icone,
  titulo,
  ligado,
  pendente,
  aoMudar,
  nivel = 2,
  menor = false,
  children,
}: {
  id: string;
  icone: LucideIcon;
  titulo: string;
  ligado: boolean;
  pendente: boolean;
  aoMudar: () => void;
  nivel?: 2 | 3;
  menor?: boolean;
  children: ReactNode;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <div className="flex items-start gap-3">
      <Icone aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        <Titulo id={id} className={`scroll-mt-24 ${menor ? "text-body font-semibold" : "text-h3"}`}>
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
 * "Quem vê seu currículo" (claude/plano-tela-do-curriculo.md): quem anunciou uma vaga que a pessoa curtiu vê o
 * currículo completo, com o PDF. Para as outras empresas, a pessoa escolhe:
 *   "Deixar as empresas me encontrarem": quem tem vaga vê e convida (o "Para a sua vaga" da aba Talentos).
 *   "Aparecer na aba Talentos": o resumo na busca, aberto a quem visita; as empresas que
 *   entraram veem o currículo completo. Ligar a aba liga as empresas; desligar as empresas
 *   desliga a aba.
 * `aoMudar` conta a escolha nova (a linha do alto e o cartão da tela do currículo acompanham).
 */
export function VisibilidadeCurriculo({
  visivel: visivelInicial,
  vitrine: vitrineInicial = false,
  perfilId,
  aoMudar,
}: {
  visivel: boolean;
  vitrine?: boolean;
  /** a página da pessoa na aba Talentos ("Ver como você aparece") */
  perfilId?: string;
  aoMudar?: (escolha: { visivel: boolean; vitrine: boolean }) => void;
}) {
  const empresas = useAcao();
  const aba = useAcao();
  const [visivel, setVisivel] = useState(visivelInicial);
  const [vitrine, setVitrine] = useState(vitrineInicial);
  const pendente = empresas.pendente || aba.pendente;

  return (
    <section
      id="quem-acha"
      aria-labelledby="quem-acha-titulo"
      className="flex scroll-mt-24 flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
    >
      <div>
        <h2 id="quem-acha-titulo" className="text-h3">
          Quem vê seu currículo
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Quem anunciou uma vaga que você curtiu vê o currículo completo, com o PDF. Para as outras empresas, você
          escolhe:
        </p>
      </div>
      <Opcao
        id="talentos-titulo"
        icone={UserSearch}
        titulo="Deixar as empresas me encontrarem"
        nivel={3}
        menor
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
              aoMudar?.({ visivel: novo, vitrine: novo ? vitrine : false });
            },
          );
        }}
      >
        Quem tem vaga na região vê seu currículo e pode convidar você. O nome aparece encurtado (ex.: Maria S.), e o
        telefone e o e-mail só aparecem se você curtir a vaga e a empresa aceitar.
      </Opcao>
      {empresas.mensagem}

      <div className="border-t border-line pt-5">
        <Opcao
          id="vitrine-titulo"
          icone={Store}
          titulo="Aparecer na aba Talentos"
          nivel={3}
          menor
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
                aoMudar?.({ visivel: novo ? true : visivel, vitrine: novo });
              },
            );
          }}
        >
          <p>
            Quem visita o Publike vê um resumo seu: o nome encurtado, o bairro, o que você faz, as habilidades, os
            cursos e os cargos, sem o nome das empresas. As empresas que entraram veem o currículo completo e podem
            convidar você para uma vaga. Fica fora do Google, sem o telefone, o e-mail e o PDF.
          </p>
          {vitrine && (
            <p className="mt-2">
              <Link
                href={perfilId ? `/talentos/${perfilId}` : "/talentos"}
                className="text-label text-ink underline underline-offset-2"
              >
                {perfilId ? "Ver como você aparece" : "Ver a aba Talentos"}
              </Link>
            </p>
          )}
        </Opcao>
        {aba.mensagem}
      </div>
    </section>
  );
}
