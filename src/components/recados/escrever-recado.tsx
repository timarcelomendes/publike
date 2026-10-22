"use client";

import { Briefcase, ImagePlus, Quote, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { escreverRecado, procurarParaCitar, type Citavel } from "@/lib/acoes/recados";
import { reduzirImagem } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

const MAXIMO = 280;
const FOTO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * O campo do "agora", no topo da linha do tempo: o recado (até 280 letras), uma foto (reduzida no
 * navegador e enviada para recados/<pessoa>/) e, se quiser, uma vaga ou um serviço citado.
 */
export function EscreverRecado({
  pessoaId,
  autorTipo,
  avatar = null,
  focar = 0,
}: {
  pessoaId: string;
  autorTipo: string | null;
  /** no topo da home: a foto da conta ao lado do campo (com a câmera para trocar) */
  avatar?: ReactNode;
  /** muda quando o "Recado" do celular abre o campo: o cursor vai para ele */
  focar?: number;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<{ caminho: string; url: string } | null>(null);
  const [citado, setCitado] = useState<Citavel | null>(null);
  const [citando, setCitando] = useState(false);
  const [busca, setBusca] = useState("");
  const [minhas, setMinhas] = useState(autorTipo !== null && autorTipo !== "pessoa");
  // o resultado guarda de qual busca veio (para não mostrar o da busca anterior)
  const [achados, setAchados] = useState<{ chave: string; itens: Citavel[] } | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  // tocou no campo (ou num dos botões): abre; saiu de tudo, vazio: fecha
  const [ativo, setAtivo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const contratando = autorTipo !== null && autorTipo !== "pessoa";
  const restam = MAXIMO - texto.length;
  const termo = busca.trim();
  const chaveDaBusca = `${minhas ? "minhas" : "todas"}|${termo}`;
  // em Todas, só com 2 letras ou mais; em Minhas vagas, já lista tudo o que está no ar
  const podeProcurar = minhas || termo.length >= 2;
  const pronto = podeProcurar && achados?.chave === chaveDaBusca;
  const lista = pronto ? achados.itens : [];

  useEffect(() => {
    if (focar) campo.current?.focus();
  }, [focar]);

  // a caixa cresce com o texto (até umas 6 linhas)
  useEffect(() => {
    const t = campo.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  }, [texto]);

  // "Citar vaga": procura pelo cargo ou pela empresa, um pouco depois de parar de digitar
  useEffect(() => {
    if (!citando || !podeProcurar) return;
    const espera = setTimeout(() => {
      procurarParaCitar(termo, minhas)
        .then((itens) => setAchados({ chave: chaveDaBusca, itens }))
        .catch(() => setAchados({ chave: chaveDaBusca, itens: [] }));
    }, 300);
    return () => clearTimeout(espera);
  }, [citando, podeProcurar, termo, minhas, chaveDaBusca]);

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return setAviso({ ok: false, texto: "Escolha uma imagem (JPG ou PNG)." });
    if (arquivo.size > FOTO_MAX_BYTES) return setAviso({ ok: false, texto: "A foto passa de 8 MB. Escolha outra." });
    setEnviandoFoto(true);
    setAviso(null);
    try {
      const imagem = await reduzirImagem(arquivo, 1280);
      const caminho = `${pessoaId}/${Date.now()}.jpg`;
      const { error } = await criarClienteNavegador()
        .storage.from("recados")
        .upload(caminho, imagem, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      if (foto) void tirarFoto(foto.caminho);
      setFoto({ caminho, url: URL.createObjectURL(imagem) });
    } catch {
      setAviso({ ok: false, texto: "Não foi possível enviar a foto. Tente outra imagem." });
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function tirarFoto(caminho: string) {
    await criarClienteNavegador()
      .storage.from("recados")
      .remove([caminho])
      .catch(() => {});
  }

  function publicar() {
    if (!texto.trim()) return setAviso({ ok: false, texto: "Escreva o recado." });
    const dados = new FormData();
    dados.set("texto", texto);
    if (foto) dados.set("foto", foto.caminho);
    if (citado) dados.set("anuncio_id", citado.id);
    setAviso(null);
    iniciar(async () => {
      const r = await escreverRecado(dados);
      if (!r.ok) {
        setAviso({ ok: false, texto: r.erro });
        if (r.ir) router.push(r.ir);
        return;
      }
      setTexto("");
      setFoto(null);
      setCitado(null);
      setCitando(false);
      setBusca("");
      setAviso({ ok: true, texto: r.mensagem ?? "Recado enviado." });
    });
  }

  const aberto = ativo || Boolean(texto) || Boolean(foto) || Boolean(citado) || citando || pendente || enviandoFoto;
  const botaoIcone =
    "grid size-10 shrink-0 cursor-pointer place-items-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink";

  // Fechado: uma linha só (a foto, "Conte o que você procura…" e os ícones de foto e de citar).
  // Ao tocar, abre: a foto escolhida, a vaga citada e o "Enviar recado".
  return (
    <div
      onFocus={() => setAtivo(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAtivo(false);
      }}
      className={`min-w-0 border border-line bg-surface-200 p-1.5 shadow-card transition-[border-radius] ${
        aberto ? "rounded-lg sm:p-2" : "rounded-[28px]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {avatar}
        <label htmlFor={`${id}-texto`} className="sr-only">
          Escrever um recado para quem está perto
        </label>
        <textarea
          id={`${id}-texto`}
          ref={campo}
          rows={1}
          maxLength={MAXIMO}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={contratando ? "Conte quem você está contratando…" : "Conte o que você procura…"}
          className="block min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 text-ink outline-none placeholder:text-ink-muted"
        />
        <label
          className={`${botaoIcone} ${enviandoFoto ? "opacity-60" : ""} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus`}
        >
          <ImagePlus aria-hidden className="size-5" />
          <span className="sr-only">{enviandoFoto ? "Enviando a foto" : "Pôr foto no recado"}</span>
          <input type="file" accept="image/*" onChange={escolherFoto} disabled={enviandoFoto} className="sr-only" />
        </label>
        <button
          type="button"
          aria-expanded={citando}
          onClick={() => setCitando((c) => !c)}
          disabled={Boolean(citado)}
          className={`${botaoIcone} disabled:opacity-50`}
        >
          <Quote aria-hidden className="size-5" />
          <span className="sr-only">Citar vaga</span>
        </button>
      </div>

      {foto && (
        <div className="relative mt-2.5 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt="" className="max-h-44 rounded-[12px] object-cover" />
          <button
            type="button"
            onClick={() => {
              void tirarFoto(foto.caminho);
              setFoto(null);
            }}
            className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-pill bg-[rgb(23_19_15/0.7)] text-on-hero"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Tirar a foto</span>
          </button>
        </div>
      )}

      {citado && (
        <p className="mt-2.5 flex w-fit max-w-full items-center gap-2 rounded-pill bg-surface-300 py-1 pr-1 pl-3 text-body-sm">
          {citado.tipo === "servico" ? (
            <Wrench aria-hidden className="size-4 shrink-0 text-cerrado-text" />
          ) : (
            <Briefcase aria-hidden className="size-4 shrink-0 text-terra-text" />
          )}
          <span className="truncate">
            Citando <b className="font-semibold">{citado.titulo}</b> · {citado.autor}
          </span>
          <button
            type="button"
            onClick={() => setCitado(null)}
            className="grid size-7 shrink-0 place-items-center rounded-pill hover:bg-surface-100"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Tirar a vaga citada</span>
          </button>
        </p>
      )}

      {citando && !citado && (
        <div className="mt-2.5 rounded-md border border-line bg-surface-100 p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-sm font-semibold">Qual vaga ou serviço?</p>
            <div role="group" aria-label="Onde procurar" className="flex gap-1">
              {[
                { valor: false, nome: "Todas" },
                { valor: true, nome: "Minhas vagas" },
              ].map((o) => (
                <button
                  key={o.nome}
                  type="button"
                  aria-pressed={minhas === o.valor}
                  onClick={() => setMinhas(o.valor)}
                  className={`min-h-8 rounded-pill px-3 text-[13px] font-semibold ${
                    minhas === o.valor ? "bg-ink text-surface-100" : "bg-surface-300 text-ink hover:bg-line"
                  }`}
                >
                  {o.nome}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="sr-only">
              {minhas ? "Procurar nas suas vagas" : "Procurar pelo cargo ou pela empresa"}
            </span>
            <input
              type="search"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={
                minhas ? "Procure nas suas vagas e serviços…" : "Procure pelo cargo ou pela empresa: garçom, Padaria…"
              }
              className="min-h-10 w-full rounded-md border border-line-strong bg-surface-200 px-3 text-body"
            />
          </label>
          {lista.length > 0 && (
            <ul className="mt-1.5 flex flex-col" aria-label="Vagas e serviços para citar">
              {lista.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCitado(a);
                      setCitando(false);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-body-sm hover:bg-surface-300"
                  >
                    {a.tipo === "servico" ? (
                      <Wrench aria-hidden className="size-4 shrink-0 text-cerrado-text" />
                    ) : (
                      <Briefcase aria-hidden className="size-4 shrink-0 text-terra-text" />
                    )}
                    <span className="truncate">
                      <b className="font-semibold">{a.titulo}</b> · {a.autor}
                      {a.bairro && <span className="text-ink-muted"> · {a.bairro}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pronto && lista.length === 0 && (
            <p className="mt-1.5 px-1 text-body-sm text-ink-muted">
              {minhas && !termo
                ? "Você não tem vaga nem serviço no ar agora."
                : minhas
                  ? "Nenhuma vaga sua com esse nome."
                  : "Nada no ar com esse cargo ou empresa."}
            </p>
          )}
        </div>
      )}

      {aberto && (
        <div className="mt-1.5 flex items-center justify-end gap-2 border-t border-line px-1 pt-2">
          <span
            aria-live="polite"
            className={`pr-1 text-body-sm tabular-nums ${restam < 20 ? "font-semibold text-danger" : "text-ink-muted"}`}
          >
            {texto.length > 0 && `${texto.length}/${MAXIMO}`}
          </span>
          <button
            type="button"
            onClick={publicar}
            disabled={pendente || enviandoFoto || !texto.trim()}
            className="inline-flex min-h-9 items-center rounded-pill bg-ink px-4 text-label font-bold text-surface-100 disabled:opacity-45"
          >
            {pendente ? "Enviando…" : "Enviar recado"}
          </button>
        </div>
      )}
      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`mt-1.5 px-2.5 pb-1 text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
