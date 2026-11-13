"use client";

import { useState } from "react";
import { EXEMPLOS_DE_SITES, lerLinkDeCandidatura, MAX_LINK_CANDIDATURA, type Candidatura } from "@/lib/candidatura";
import { Aviso } from "../ui/basicos";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";

// "Como receber os candidatos", no formulário da vaga (claude/plano-candidatura-no-site-da-empresa.md, parte 1):
// pelo Publike (o padrão) ou no site da empresa, com o link da vaga lá. No site, o formulário esconde o que é da
// candidatura pelo Publike (currículo, perguntas, contato direto) e o servidor tira de novo.

const JEITOS: { valor: Candidatura; nome: string; ajuda: string }[] = [
  {
    valor: "publike",
    nome: "Pelo Publike",
    ajuda: "Quem se interessa curte a vaga. Você vê quem curtiu, aceita e conversa pelo chat ou pelo WhatsApp.",
  },
  {
    valor: "site",
    nome: "No site da empresa",
    ajuda: "A vaga aparece no Publike, e o botão leva para a página dela no seu site de vagas (Gupy, Inhire, Sólides…).",
  },
];

export function CandidaturaDaVaga({
  valor,
  aoMudar,
  link,
  erro,
  eraNoSite,
  equipe,
}: {
  valor: Candidatura;
  aoMudar: (v: Candidatura) => void;
  /** o link que a vaga já tem (editar, ou puxado da Gupy pelo admin) */
  link: string;
  /** o erro do servidor no link */
  erro?: string;
  /** editando uma vaga que já recebia no site: voltar ao Publike precisa ir para o servidor */
  eraNoSite: boolean;
  /** a equipe do Publike (admin e moderação) pode usar o link de qualquer site */
  equipe: boolean;
}) {
  const [erroAqui, setErroAqui] = useState<string | null>(null);
  const erroDoLink = erro ?? erroAqui ?? undefined;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label">Como receber os candidatos</legend>
      {eraNoSite && <input type="hidden" name="candidatura_era_site" value="1" />}
      <div className="grid gap-2 sm:grid-cols-2">
        {JEITOS.map((o) => (
          <label
            key={o.valor}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-200 p-4 transition-colors has-[:checked]:border-ink has-[:checked]:shadow-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name="candidatura"
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => aoMudar(o.valor)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
            />
            <span>
              <span className="block text-label">{o.nome}</span>
              <span className="block text-body-sm text-ink-muted">{o.ajuda}</span>
            </span>
          </label>
        ))}
      </div>
      {valor === "site" && (
        <div className="mt-2 flex flex-col gap-3">
          <Campo
            rotulo="Link da vaga no site da empresa"
            nome="link_candidatura"
            erro={erroDoLink}
            ajuda={
              equipe
                ? "Qualquer site com https://. Pelo próprio painel, quem publica usa só os sites de vagas conhecidos."
                : `O endereço da página da vaga na ${EXEMPLOS_DE_SITES} ou em outro site de vagas.`
            }
          >
            <input
              {...ligarCampo("link_candidatura", erroDoLink, true)}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              defaultValue={link}
              maxLength={MAX_LINK_CANDIDATURA}
              placeholder="https://suaempresa.gupy.io/jobs/1234567"
              onChange={() => setErroAqui(null)}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                const r = v.trim() ? lerLinkDeCandidatura(v, { equipe }) : null;
                setErroAqui(r && !r.ok ? r.erro : null);
              }}
              className={classesEntrada}
            />
          </Campo>
          <Aviso tipo="info" titulo="A candidatura é feita no seu site">
            <p>
              No Publike, a vaga aparece na busca, no mapa e nos avisos, com o botão “Candidatar no site da empresa”.
              Você não vê aqui quem se candidatou, e o currículo, as perguntas e o contato direto ficam de fora.
            </p>
            <p>O Publike confere o link uma vez por dia: se a vaga fechar lá, ela sai daqui.</p>
          </Aviso>
        </div>
      )}
    </fieldset>
  );
}
