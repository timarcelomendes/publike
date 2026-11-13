"use client";

import { ExternalLink } from "lucide-react";
import { useId, useState, useTransition } from "react";
import type { ListaParaImportar, ResultadoImportacao, VagaParaImportar } from "@/lib/importar-gupy";
import { Aviso, Selo } from "../ui/basicos";
import { Botao, BotaoLink } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// "Importar da Gupy" (claude/plano-candidatura-no-site-da-empresa.md): o link da página de vagas da empresa na Gupy
// traz a lista das vagas abertas; as escolhidas saem todas de uma vez, com a candidatura no site da empresa. A
// empresa usa no Painel › Vagas; a equipe, no Admin › Publicar vaga em nome da conta.

type Lista = Extract<ListaParaImportar, { ok: true }>;
type Resultado = Extract<ResultadoImportacao, { ok: true }>;

const MOTIVO: Record<Exclude<VagaParaImportar["situacao"], "pode">, string> = {
  fora: "Fora das cidades do Publike",
  fechada: "Fechada na Gupy",
  ja: "Já está no Publike",
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** As que dá para importar, até o máximo de uma vez. */
const escolhaInicial = (l: Lista) =>
  new Set(
    l.vagas
      .filter((v) => v.situacao === "pode")
      .slice(0, l.maximo)
      .map((v) => v.link),
  );

export function ImportarDaGupy({
  listar,
  importar,
  depois,
  equipe = false,
  listaInicial = null,
}: {
  listar: (link: string) => Promise<ListaParaImportar>;
  importar: (links: string[], confirmou: boolean) => Promise<ResultadoImportacao>;
  /** para onde ir depois de publicar */
  depois: { href: string; rotulo: string };
  /** a equipe do Publike publica em nome da empresa (a confirmação é a autorização dela) */
  equipe?: boolean;
  /** a lista já buscada (o admin busca pelo campo do "Puxar do link"): sem o campo do link aqui */
  listaInicial?: Lista | null;
}) {
  const idLink = useId();
  const [link, setLink] = useState("");
  const [lista, setLista] = useState<Lista | null>(listaInicial);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() =>
    listaInicial ? escolhaInicial(listaInicial) : new Set(),
  );
  const [confirmou, setConfirmou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [buscando, iniciarBusca] = useTransition();
  const [publicando, iniciarPublicar] = useTransition();

  function buscar() {
    setErro(null);
    setResultado(null);
    iniciarBusca(async () => {
      const r = await listar(link);
      if (!r.ok) {
        setLista(null);
        setErro(r.erro);
        return;
      }
      setLista(r);
      setEscolhidas(escolhaInicial(r));
      setConfirmou(false);
    });
  }

  function alternar(v: VagaParaImportar) {
    setEscolhidas((atual) => {
      const nova = new Set(atual);
      if (nova.has(v.link)) nova.delete(v.link);
      else nova.add(v.link);
      return nova;
    });
  }

  function publicar() {
    if (!lista) return;
    setErro(null);
    const links = lista.vagas.filter((v) => escolhidas.has(v.link)).map((v) => v.link);
    iniciarPublicar(async () => {
      const r = await importar(links, confirmou);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // as que saíram passam a "Já está no Publike"; as que falharam ficam escolhidas, para tentar de novo
      const falharam = new Set(r.falhas.map((f) => f.link));
      setLista({
        ...lista,
        vagas: lista.vagas.map((v) =>
          links.includes(v.link) && !falharam.has(v.link) ? { ...v, situacao: "ja" } : v,
        ),
      });
      setEscolhidas(new Set([...falharam].filter((l) => links.includes(l))));
      setResultado(r);
    });
  }

  const tituloDe = (l: string) => lista?.vagas.find((v) => v.link === l)?.titulo ?? l;
  const podem = lista?.vagas.filter((v) => v.situacao === "pode") ?? [];
  const cheio = lista ? escolhidas.size >= lista.maximo : false;

  return (
    <div className="flex flex-col gap-4">
      {!listaInicial && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            buscar();
          }}
        >
          <label htmlFor={idLink} className="text-label">
            Link da página de vagas na Gupy
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={idLink}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              required
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://suaempresa.gupy.io"
              className={classesEntrada}
            />
            <Botao
              type="submit"
              variante={lista ? "secundario" : "primario"}
              disabled={buscando || !link.trim()}
              className="shrink-0"
            >
              {buscando ? "Buscando… (até 1 minuto)" : "Buscar as vagas"}
            </Botao>
          </div>
          <p className="text-body-sm text-ink-muted">
            É o endereço da página onde a Gupy mostra todas as vagas da empresa, como https://suaempresa.gupy.io.
          </p>
        </form>
      )}

      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}

      {resultado && (
        <Aviso
          tipo={resultado.falhas.length ? (resultado.publicadas ? "alerta" : "erro") : "sucesso"}
          titulo={
            resultado.publicadas
              ? `Pronto: ${plural(resultado.publicadas, "vaga publicada", "vagas publicadas")}.`
              : "Nenhuma vaga saiu."
          }
        >
          {resultado.publicadas > 0 && (
            <p>
              Cada uma tem o botão “Candidatar no site da empresa”, que leva à página dela na Gupy. Confira e edite pelo
              painel, se precisar.
            </p>
          )}
          {resultado.falhas.length > 0 && (
            <ul className="list-disc pl-5">
              {resultado.falhas.map((f) => (
                <li key={f.link}>
                  <span className="font-semibold">{f.titulo === f.link ? tituloDe(f.link) : f.titulo}</span>: {f.erro}
                </li>
              ))}
            </ul>
          )}
          {resultado.publicadas > 0 && (
            <div className="mt-1">
              <BotaoLink href={depois.href} tamanho="sm">
                {depois.rotulo}
              </BotaoLink>
            </div>
          )}
        </Aviso>
      )}

      {lista && (
        <section aria-label="Vagas da Gupy" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-h3">
              {plural(lista.vagas.length, "vaga", "vagas")} na Gupy{lista.empresa ? ` (${lista.empresa})` : ""}
            </h3>
            <p className="text-body-sm text-ink-muted">
              {escolhidas.size} de {podem.length} escolhidas · até {lista.maximo} de uma vez
            </p>
          </div>
          {(lista.total > lista.vagas.length + lista.naoAbriram || lista.naoAbriram > 0) && (
            <p className="text-body-sm text-ink-muted">
              {lista.naoAbriram > 0 &&
                `${plural(lista.naoAbriram, "vaga não abriu", "vagas não abriram")} agora: busque de novo daqui a pouco. `}
              {lista.total > lista.vagas.length + lista.naoAbriram &&
                `A página tem ${lista.total} vagas; aqui estão as primeiras. Publique estas e busque de novo para as outras.`}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
            {lista.vagas.map((v) => {
              const pode = v.situacao === "pode";
              const marcada = escolhidas.has(v.link);
              return (
                <li key={v.link} className="flex items-start gap-3 p-3">
                  <label className={`flex min-w-0 flex-1 items-start gap-3 ${pode ? "cursor-pointer" : ""}`}>
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={!pode || (!marcada && cheio) || publicando}
                      onChange={() => alternar(v)}
                      className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-label ${pode ? "" : "text-ink-muted"}`}>{v.titulo}</span>
                      <span className="block text-body-sm text-ink-muted">
                        {[v.lugar, v.resumo].filter(Boolean).join(" · ")}
                      </span>
                      {!pode && (
                        <Selo variante="contorno" className="mt-1.5">
                          {MOTIVO[v.situacao as Exclude<VagaParaImportar["situacao"], "pode">]}
                        </Selo>
                      )}
                    </span>
                  </label>
                  <a
                    href={v.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
                  >
                    <ExternalLink aria-hidden className="size-4" />
                    <span className="sr-only">Abrir {v.titulo} na Gupy</span>
                  </a>
                </li>
              );
            })}
          </ul>
          {podem.length > 0 ? (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface-300 p-3">
                <input
                  type="checkbox"
                  checked={confirmou}
                  onChange={(e) => setConfirmou(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
                />
                <span className="text-body-sm">
                  {equipe
                    ? "A empresa autorizou a divulgação destas vagas no Publike."
                    : "Estas vagas são da minha empresa, e eu posso divulgá-las no Publike."}
                </span>
              </label>
              <p className="text-body-sm text-ink-muted">
                Cada vaga sai com o botão “Candidatar no site da empresa”, que leva à página dela na Gupy, e com o
                salário a combinar (a Gupy quase nunca mostra; dá para editar depois). Uma vez por dia o Publike confere
                o link: a vaga que fechar na Gupy sai daqui.
              </p>
              <div>
                <Botao
                  variante="primario"
                  onClick={publicar}
                  disabled={!escolhidas.size || !confirmou || publicando}
                >
                  {publicando
                    ? "Publicando… (pode levar 1 minuto)"
                    : `Publicar ${plural(escolhidas.size, "vaga", "vagas")}`}
                </Botao>
              </div>
            </>
          ) : (
            !resultado && <p className="text-body-sm text-ink-muted">Nenhuma destas vagas dá para publicar agora.</p>
          )}
        </section>
      )}
    </div>
  );
}
