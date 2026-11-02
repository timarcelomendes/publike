"use client";

import { Bell, Check, ExternalLink, EyeOff, LayoutTemplate, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { apagarNovidade, publicarNovidade, salvarNovidade } from "@/lib/acoes/admin-novidades";
import { PARA_NOVIDADE, type ParaNovidade } from "@/lib/novidades";
import type { EstadoForm } from "@/lib/tipos";
import { CartaoDoPublike } from "../home/cartao-do-publike";
import { Aviso } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Novidades: escrever uma novidade do Publike uma vez, com a prévia do cartão de /novidades. Daqui ela
// sai também como banner e como recado no sino (os botões da lista abrem esses formulários já preenchidos).

export type NovidadeParaEditar = {
  id: string;
  titulo: string;
  texto: string;
  link: string | null;
  botao: string | null;
  para: ParaNovidade;
  /** "2026-11-02" */
  dia: string;
  publicada: boolean;
};

export function FormNovidade({ novidade, hoje }: { novidade?: NovidadeParaEditar; hoje: string }) {
  const id = novidade?.id ?? null;
  const salvarProtegido = useMemo(() => protegerAcao(salvarNovidade.bind(null, id)), [id]);
  const [estado, acao, enviando] = useActionState(salvarProtegido, { ok: false } as EstadoForm);
  const erros = estado.erros ?? {};
  const [titulo, setTitulo] = useState(novidade?.titulo ?? "");
  const [texto, setTexto] = useState(novidade?.texto ?? "");
  const [link, setLink] = useState(novidade?.link ?? "");
  const [botao, setBotao] = useState(novidade?.botao ?? "");
  const [para, setPara] = useState<ParaNovidade>(novidade?.para ?? "todos");
  const linkValido = /^\/(?!\/)\S*$/.test(link.trim());

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <form action={acao} noValidate className="flex flex-col gap-5">
        {estado.erro && (
          <Aviso tipo="erro" titulo="Não deu para salvar">
            {estado.erro}
          </Aviso>
        )}
        <Campo rotulo="Título" nome="titulo" erro={erros.titulo}>
          <input
            {...ligarCampo("titulo", erros.titulo)}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={80}
            placeholder="Página de vagas com a sua marca"
            className={classesEntrada}
          />
        </Campo>
        <Campo
          rotulo="Texto"
          nome="texto"
          erro={erros.texto}
          ajuda={`${texto.trim().length} de 400. No sino cabem 240: o recado leva o começo.`}
        >
          <textarea
            {...ligarCampo("texto", erros.texto, true)}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={400}
            rows={4}
            className={classesEntrada}
          />
        </Campo>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-label">Para quem</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PARA_NOVIDADE) as ParaNovidade[]).map((p) => (
              <label
                key={p}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-pill border border-line px-3 text-body-sm has-checked:border-ink has-checked:bg-surface-300"
              >
                <input
                  type="radio"
                  name="para"
                  value={p}
                  checked={para === p}
                  onChange={() => setPara(p)}
                  className="size-4 accent-[var(--pk-ink)]"
                />
                {PARA_NOVIDADE[p]}
              </label>
            ))}
          </div>
          {erros.para && <p className="text-body-sm text-danger">{erros.para}</p>}
        </fieldset>
        <Campo
          rotulo="Endereço da página"
          nome="link"
          opcional
          erro={erros.link}
          ajuda="Onde o botão leva: uma página do Publike, começando com /. Vazio: o cartão fica sem botão."
        >
          <span className="flex flex-col gap-2 sm:flex-row">
            <input
              {...ligarCampo("link", erros.link, true)}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={300}
              placeholder="/painel/links"
              className={`${classesEntrada} sm:flex-1`}
            />
            {linkValido ? (
              <a
                href={link.trim()}
                target="_blank"
                rel="noopener"
                className={classesBotao("secundario", "md", "shrink-0")}
              >
                <ExternalLink aria-hidden />
                Testar o link
              </a>
            ) : (
              <Botao variante="secundario" disabled className="shrink-0">
                <ExternalLink aria-hidden />
                Testar o link
              </Botao>
            )}
          </span>
        </Campo>
        {link.trim() && (
          <Campo rotulo="Texto do botão" nome="botao" erro={erros.botao}>
            <input
              {...ligarCampo("botao", erros.botao)}
              value={botao}
              onChange={(e) => setBotao(e.target.value)}
              maxLength={30}
              placeholder="Ver minha página"
              className={classesEntrada}
            />
          </Campo>
        )}
        <Campo
          rotulo="Dia"
          nome="dia"
          erro={erros.dia}
          ajuda="O dia que aparece no cartão. Num dia futuro, só aparece nele."
        >
          <input
            {...ligarCampo("dia", erros.dia, true)}
            type="date"
            defaultValue={novidade?.dia ?? hoje}
            className={`${classesEntrada} sm:w-56`}
          />
        </Campo>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="publicada"
            defaultChecked={novidade?.publicada ?? true}
            className="mt-0.5 size-4 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-body">Publicar em Novidades</span>
            <span className="block text-body-sm text-ink-muted">
              Desmarcada, fica guardada aqui como rascunho e não aparece em /novidades.
            </span>
          </span>
        </label>
        <div>
          <Botao type="submit" variante="primario" disabled={enviando}>
            <Check aria-hidden />
            {enviando ? "Salvando…" : novidade ? "Salvar a novidade" : "Criar a novidade"}
          </Botao>
        </div>
      </form>
      <div className="flex flex-col gap-2 lg:sticky lg:top-24">
        <p className="text-label">Como fica em /novidades</p>
        <CartaoDoPublike
          jeito="pagina"
          data={para === "todos" ? "hoje" : `hoje · ${PARA_NOVIDADE[para]}`}
          banner={{
            id: "previa",
            titulo: titulo.trim() || "O título da novidade",
            texto: texto.trim() || null,
            botao: link.trim() ? botao.trim() || "Ver" : "",
            acao: "link",
            // a prévia não sai do formulário
            link: "#previa",
            repetir_dias: null,
            paginas: [],
            atraso: 0,
            imagem: null,
            formato: "cartao",
            novidades: true,
          }}
        />
      </div>
    </div>
  );
}

/** Os botões de cada novidade da lista: fazer banner, mandar no sino, publicar ou tirar, apagar. */
export function AcoesNovidade({ id, publicada }: { id: string; publicada: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link href={`/admin/banners?aba=novo&novidade=${id}`} className={classesBotao("secundario", "sm")}>
          <LayoutTemplate aria-hidden />
          Fazer banner
        </Link>
        <Link href={`/admin/comunicados?novidade=${id}`} className={classesBotao("secundario", "sm")}>
          <Bell aria-hidden />
          Mandar no sino
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Botao
          tamanho="sm"
          variante={publicada ? "fantasma" : "sucesso"}
          disabled={pendente}
          onClick={() => rodar(() => publicarNovidade(id, !publicada))}
        >
          {publicada ? <EyeOff aria-hidden /> : <Check aria-hidden />}
          {publicada ? "Tirar de Novidades" : "Publicar"}
        </Botao>
        {confirmar ? (
          <>
            <Botao tamanho="sm" variante="perigo" disabled={pendente} onClick={() => rodar(() => apagarNovidade(id))}>
              <Trash2 aria-hidden />
              Apagar de vez
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
              Cancelar
            </Botao>
          </>
        ) : (
          <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
            <Trash2 aria-hidden />
            Apagar
          </Botao>
        )}
      </div>
      {mensagem}
    </div>
  );
}
