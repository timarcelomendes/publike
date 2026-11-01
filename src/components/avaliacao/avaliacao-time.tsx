"use client";

import { Pencil, Plus, Save, Users, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { avaliarCandidato, carregarAvaliacoes, salvarFicha } from "@/lib/acoes/avaliacao-time";
import {
  MAX_COMPETENCIAS,
  mediaDasNotas,
  RECOMENDACOES,
  textoDaMedia,
  type AvaliacoesDoCandidato,
  type Competencia,
  type Recomendacao,
} from "@/lib/avaliacao-time";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

/**
 * A avaliação do time na ficha do candidato (quadro): a minha nota em cada competência, a recomendação e um
 * comentário; depois de dar a minha, as dos outros e a média. A ficha (as competências) vale para a vaga toda.
 */
export function AvaliacaoDoTime({
  anuncioId,
  perfilId,
  nome,
  ficha,
  sugestoes,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  /** as competências salvas da vaga (vazia: começa pelas sugestões) */
  ficha: Competencia[];
  sugestoes: string[];
}) {
  const [competencias, setCompetencias] = useState<Competencia[]>(() =>
    ficha.length ? ficha : sugestoes.map((s, i) => ({ id: `c${i + 1}`, nome: s })),
  );
  const [fichaSalva, setFichaSalva] = useState(ficha.length > 0);
  const [editando, setEditando] = useState(false);
  const [dados, setDados] = useState<AvaliacoesDoCandidato | null>(null);
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [recomendacao, setRecomendacao] = useState<Recomendacao | null>(null);
  const [comentario, setComentario] = useState("");
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const primeiro = nome.split(" ")[0];

  useEffect(() => {
    let vivo = true;
    chamarAcao(() => carregarAvaliacoes(anuncioId, perfilId)).then((r) => {
      if (!vivo || !r.ok) return;
      setDados(r.dados);
      const minha = r.dados.avaliacoes.find((a) => a.minha);
      if (minha) {
        setNotas(minha.notas);
        setRecomendacao(minha.recomendacao);
        setComentario(minha.comentario ?? "");
      }
    });
    return () => {
      vivo = false;
    };
  }, [anuncioId, perfilId]);

  function salvar() {
    if (!recomendacao) return setAviso({ ok: false, texto: "Escolha: Seguir, Talvez ou Não seguir." });
    setAviso(null);
    iniciar(async () => {
      if (!fichaSalva) {
        const f = await chamarAcao(() =>
          salvarFicha(
            anuncioId,
            competencias.map((c) => c.nome),
          ),
        );
        if (!f.ok) return setAviso({ ok: false, texto: f.erro });
        setFichaSalva(true);
      }
      const r = await chamarAcao(() => avaliarCandidato(anuncioId, perfilId, { notas, recomendacao, comentario }));
      if (!r.ok) return setAviso({ ok: false, texto: r.erro });
      setDados(r.dados);
      setAviso({ ok: true, texto: "Avaliação salva." });
    });
  }

  if (editando) {
    return (
      <EditarFicha
        anuncioId={anuncioId}
        inicial={competencias}
        aoSalvar={(lista) => {
          setCompetencias(lista);
          setFichaSalva(true);
          setEditando(false);
        }}
        cancelar={() => setEditando(false)}
      />
    );
  }

  const outras = dados?.avaliacoes.filter((a) => !a.minha) ?? [];
  const todas = dados?.avaliacoes ?? [];
  return (
    <div className="flex flex-col gap-4 text-body-sm">
      <p className="text-ink-muted">
        {dados && dados.total > 0 && !dados.avaliei
          ? `${dados.total === 1 ? "1 pessoa já avaliou" : `${dados.total} pessoas já avaliaram`} ${primeiro}. Você vê as notas depois de dar a sua.`
          : `De 1 a 5 em cada ponto. Cada pessoa da equipe avalia sem ver as notas dos outros antes.`}
      </p>
      <ul className="flex flex-col gap-3">
        {competencias.map((c) => (
          <li key={c.id} className="flex flex-col gap-1.5">
            <span className="text-label">{c.nome}</span>
            <div role="radiogroup" aria-label={c.nome} className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={notas[c.id] === n}
                  aria-label={`${c.nome}: ${n}`}
                  onClick={() => setNotas((x) => ({ ...x, [c.id]: n }))}
                  className={`inline-flex size-10 items-center justify-center rounded-md border text-label tabular-nums ${
                    notas[c.id] === n
                      ? "border-ink bg-ink text-surface-100"
                      : "border-line bg-surface-100 text-ink hover:border-line-strong"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-label">Sua recomendação</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RECOMENDACOES) as Recomendacao[]).map((r) => (
            <label
              key={r}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-pill border border-line bg-surface-300 px-3.5 text-label has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name={`recomendacao-${perfilId}`}
                checked={recomendacao === r}
                onChange={() => setRecomendacao(r)}
                className="sr-only"
              />
              {RECOMENDACOES[r].nome}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`comentario-${perfilId}`} className="text-label">
          Comentário <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <textarea
          id={`comentario-${perfilId}`}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          maxLength={1000}
          className={`${classesEntrada} resize-y`}
        />
      </div>
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "text-cerrado-text" : "text-danger"}>
          {aviso.texto}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={salvar}>
          <Save aria-hidden />
          {pendente ? "Salvando…" : dados?.avaliei ? "Atualizar a minha avaliação" : "Salvar a minha avaliação"}
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(true)}>
          <Pencil aria-hidden />
          Mudar os pontos
        </Botao>
      </div>

      {dados?.avaliei && todas.length > 0 && (
        <section aria-label="As avaliações do time" className="flex flex-col gap-3 rounded-md bg-surface-300 p-3">
          <p className="flex items-center gap-1.5 text-label">
            <Users aria-hidden className="size-4" />O time ({todas.length})
          </p>
          <MediasDoTime competencias={competencias} avaliacoes={todas} />
          {outras.length === 0 ? (
            <p className="text-ink-muted">Só você avaliou até agora.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {outras.map((a, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-label">{a.quem}</span>
                    {a.pelo_link && <span className="text-caption text-ink-muted">pelo link</span>}
                    <Selo variante={RECOMENDACOES[a.recomendacao].tom}>{RECOMENDACOES[a.recomendacao].nome}</Selo>
                    <span className="text-ink-muted">média {textoDaMedia(mediaDasNotas(a.notas))}</span>
                  </p>
                  {a.comentario && <p className="text-ink">“{a.comentario}”</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MediasDoTime({
  competencias,
  avaliacoes,
}: {
  competencias: Competencia[];
  avaliacoes: AvaliacoesDoCandidato["avaliacoes"];
}) {
  const conta = (r: Recomendacao) => avaliacoes.filter((a) => a.recomendacao === r).length;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap gap-2">
        {(Object.keys(RECOMENDACOES) as Recomendacao[])
          .filter((r) => conta(r) > 0)
          .map((r) => (
            <Selo key={r} variante={RECOMENDACOES[r].tom}>
              {conta(r)} {RECOMENDACOES[r].nome}
            </Selo>
          ))}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {competencias.map((c) => {
          const v = avaliacoes.map((a) => a.notas[c.id]).filter((n): n is number => typeof n === "number");
          const media = v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null;
          return (
            <div key={c.id} className="contents">
              <dt>{c.nome}</dt>
              <dd className="text-right text-label tabular-nums">{textoDaMedia(media)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function EditarFicha({
  anuncioId,
  inicial,
  aoSalvar,
  cancelar,
}: {
  anuncioId: string;
  inicial: Competencia[];
  aoSalvar: (lista: Competencia[]) => void;
  cancelar: () => void;
}) {
  const [lista, setLista] = useState(inicial.map((c) => c.nome));
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 text-body-sm">
      <p className="text-ink-muted">
        Os pontos da ficha valem para todos os candidatos desta vaga. Mudar depois não apaga o que já foi avaliado.
      </p>
      <ul className="flex flex-col gap-2">
        {lista.map((c, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              aria-label={`Ponto ${i + 1}`}
              value={c}
              onChange={(e) => setLista((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={60}
              className={`${classesEntrada} flex-1`}
            />
            {lista.length > 1 && (
              <button
                type="button"
                onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
                aria-label={`Tirar o ponto ${i + 1}`}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {lista.length < MAX_COMPETENCIAS && (
        <Botao tamanho="sm" variante="fantasma" className="self-start" onClick={() => setLista((l) => [...l, ""])}>
          <Plus aria-hidden />
          Mais um ponto
        </Botao>
      )}
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const limpa = lista.map((x) => x.trim()).filter(Boolean);
              const r = await chamarAcao(() => salvarFicha(anuncioId, limpa));
              if (!r.ok) return setErro(r.erro);
              aoSalvar(limpa.map((nome, i) => ({ id: `c${i + 1}`, nome })));
            })
          }
        >
          <Save aria-hidden />
          {pendente ? "Salvando…" : "Salvar os pontos"}
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={cancelar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
