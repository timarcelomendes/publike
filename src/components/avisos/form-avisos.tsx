"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ligarEmails, mudarAviso } from "@/lib/acoes/avisos";
import { GRUPOS_DE_AVISO, grupoParaConta, type CanalDeAviso, type GrupoDeAviso } from "@/lib/avisos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

const NOME_DO_CANAL: Record<CanalDeAviso, string> = { email: "Por e-mail", celular: "No celular" };

/** O botão de ligar e desligar um grupo num canal (o mesmo desenho do "Deixar as empresas me encontrarem"). */
function Chave({
  nome,
  canal,
  ligado,
  desligada,
  aoMudar,
}: {
  nome: string;
  canal: CanalDeAviso;
  ligado: boolean;
  desligada: boolean;
  aoMudar: () => void;
}) {
  return (
    <span className="flex w-14 shrink-0 justify-center">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={`${NOME_DO_CANAL[canal]}: ${nome}`}
        disabled={desligada}
        onClick={aoMudar}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors disabled:opacity-50 ${
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
    </span>
  );
}

/**
 * Os grupos de avisos, cada um com o e-mail e o celular (ligados até a conta desligar). Muda na hora e
 * volta atrás se não salvar. `pode`: quem é recrutador na equipe de uma agência só vê.
 */
export function FormAvisos({
  desligados,
  empresa,
  emailsLigados: emailsDoPerfil,
  semEmail,
  pode,
}: {
  desligados: { grupo: string; canal: string }[];
  empresa: boolean;
  /** o "Receber avisos por e-mail" do perfil: desmarcado, nenhum e-mail destes sai */
  emailsLigados: boolean;
  /** a conta sem e-mail: nada chega no e-mail até cadastrar um */
  semEmail: boolean;
  pode: boolean;
}) {
  const acao = useAcao();
  const geral = useAcao();
  const [fora, setFora] = useState(() => new Set(desligados.map((d) => `${d.grupo}:${d.canal}`)));
  const [emailsLigados, setEmailsLigados] = useState(emailsDoPerfil);

  function mudar(grupo: GrupoDeAviso, canal: CanalDeAviso) {
    const chave = `${grupo}:${canal}`;
    const ligar = fora.has(chave);
    const trocar = (desligar: boolean) =>
      setFora((atual) => {
        const novo = new Set(atual);
        if (desligar) novo.add(chave);
        else novo.delete(chave);
        return novo;
      });
    trocar(!ligar);
    // não salvou: volta como estava
    acao.rodar(
      () => mudarAviso(grupo, canal, ligar),
      (r) => !r.ok && trocar(ligar),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!emailsLigados && !semEmail && (
        <Aviso tipo="alerta" titulo="Os avisos por e-mail estão desligados">
          <p>No seu perfil, “Receber avisos por e-mail” está desmarcado: nenhum destes chega no e-mail.</p>
          {pode && (
            <div className="mt-3 flex flex-col gap-2">
              <span>
                <Botao
                  tamanho="sm"
                  disabled={geral.pendente}
                  onClick={() => geral.rodar(ligarEmails, (r) => r.ok && setEmailsLigados(true))}
                >
                  <MailCheck aria-hidden />
                  {geral.pendente ? "Ligando…" : "Ligar os avisos por e-mail"}
                </Botao>
              </span>
              {geral.mensagem}
            </div>
          )}
        </Aviso>
      )}
      {semEmail && (
        <Aviso tipo="info" titulo="Sua conta ainda não tem e-mail">
          Para receber os avisos por e-mail, cadastre um e-mail na{" "}
          <Link href="/perfil#perfil-conta" className="font-semibold underline underline-offset-2">
            sua conta
          </Link>
          .
        </Aviso>
      )}
      {!pode && (
        <Aviso tipo="info" titulo="Só quem administra a agência escolhe os avisos da conta">
          Você vê o que está ligado. Para mudar, peça para quem administra a agência.
        </Aviso>
      )}
      <section
        aria-labelledby="avisos-titulo"
        className="overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
      >
        <div className="flex items-end gap-2 border-b border-line px-4 pt-4 pb-3 sm:px-5">
          <h2 id="avisos-titulo" className="min-w-0 flex-1 text-h3">
            O que chega para você
          </h2>
          <span aria-hidden className="w-14 shrink-0 text-center text-body-sm font-semibold text-ink-muted">
            E-mail
          </span>
          <span aria-hidden className="w-14 shrink-0 text-center text-body-sm font-semibold text-ink-muted">
            Celular
          </span>
        </div>
        <ul className="divide-y divide-line">
          {GRUPOS_DE_AVISO.map(({ valor }) => {
            const g = grupoParaConta(valor, empresa);
            return (
              <li key={valor} className="flex items-center gap-2 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-label">{g.nome}</p>
                  <p className="mt-0.5 text-body-sm text-ink-muted">{g.ajuda}</p>
                </div>
                {g.email ? (
                  <Chave
                    nome={g.nome}
                    canal="email"
                    ligado={!fora.has(`${valor}:email`)}
                    desligada={!pode || acao.pendente || !emailsLigados || semEmail}
                    aoMudar={() => mudar(valor, "email")}
                  />
                ) : (
                  <span className="w-14 shrink-0 text-center text-body-sm text-ink-muted">
                    <span aria-hidden>—</span>
                    <span className="sr-only">Não chega no e-mail</span>
                  </span>
                )}
                {g.celular ? (
                  <Chave
                    nome={g.nome}
                    canal="celular"
                    ligado={!fora.has(`${valor}:celular`)}
                    desligada={!pode || acao.pendente}
                    aoMudar={() => mudar(valor, "celular")}
                  />
                ) : (
                  <span className="w-14 shrink-0 text-center text-body-sm text-ink-muted">
                    <span aria-hidden>—</span>
                    <span className="sr-only">Não chega no celular</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {acao.mensagem}
    </div>
  );
}
