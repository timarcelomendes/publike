"use client";

import { IA } from "@/components/apelido-da-ia";
import {
  Camera,
  CheckCircle2,
  Circle,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  apagarMinhaEntrevistaVideo,
  enviarEntrevistaVideo,
  registrarResposta,
  responderPorTexto,
  verPergunta,
} from "@/lib/acoes/entrevista-video";
import {
  BITS_AUDIO,
  BITS_VIDEO,
  BUCKET_VIDEO,
  formatoDeGravacao,
  textoDoTempo,
  type MinhaEntrevistaVideo,
} from "@/lib/entrevista-video";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Avatar, Aviso, Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// O candidato responde a entrevista em vídeo (migração 20270105120000): testa a câmera, abre cada pergunta (o
// tempo conta a partir da gravação), grava, confere e envia. Quem não pode gravar responde por texto quando a
// empresa deixa. As gravações sobem direto para o bucket privado, com o login da pessoa.

type Pergunta = MinhaEntrevistaVideo["perguntas"][number];

function quandoAcaba(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ResponderEntrevistaVideo({
  entrevista,
  anuncioId,
  euId,
  logo = null,
}: {
  entrevista: MinhaEntrevistaVideo;
  anuncioId: string;
  euId: string;
  /** o logo de quem contrata (no alto do modo foco) */
  logo?: string | null;
}) {
  const router = useRouter();
  const [perguntas, setPerguntas] = useState<Pergunta[]>(entrevista.perguntas);
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const e = entrevista;
  const todas = perguntas.every((p) => p.respondida);

  if (e.situacao === "enviada") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="sucesso" titulo="Entrevista enviada">
          {e.empresa} recebeu as suas respostas. Quando a empresa responder, o aviso chega no sino e por e-mail.
        </Aviso>
        <ApagarTudo id={e.id} />
      </div>
    );
  }
  if (e.situacao === "vencida") {
    return (
      <Aviso tipo="alerta" titulo="O prazo desta entrevista acabou">
        Se ainda tiver interesse, mande uma mensagem para {e.empresa} pela conversa da vaga.
      </Aviso>
    );
  }
  if (e.situacao === "apagada") {
    return (
      <Aviso tipo="info" titulo="Você apagou esta entrevista">
        Os vídeos e as respostas foram apagados.
      </Aviso>
    );
  }

  const atualizar = (id: string, mudanca: Partial<Pergunta>) =>
    setPerguntas((l) => l.map((p) => (p.id === id ? { ...p, ...mudanca } : p)));

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
        <p className="text-body">
          {e.empresa} quer conhecer você melhor: são {perguntas.length} perguntas, e você grava cada resposta pelo
          celular, com até {textoDoTempo(e.segundos)}.{" "}
          {e.segunda_chance ? "Dá para gravar cada uma de novo, uma vez." : "Cada resposta é gravada uma vez só."}
        </p>
        <p className="text-body-sm text-ink-muted">Responda até {quandoAcaba(e.prazo)}.</p>
      </section>

      <section
        aria-labelledby="aviso-gravacao"
        className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-100 p-4 text-body-sm"
      >
        <h2 id="aviso-gravacao" className="flex items-center gap-2 text-label">
          <ShieldCheck aria-hidden className="size-4 text-cerrado-text" />
          Antes de gravar
        </h2>
        <ul className="ml-5 list-disc text-ink-muted">
          <li>Os vídeos são gravados e só {e.empresa} e você veem.</li>
          <li>
            <IA forma="Nome" /> transcreve e resume só o que você disse, sem avaliar o seu rosto, a sua voz, o seu jeito
            de falar nem nada além da resposta. Quem decide é uma pessoa da empresa.
          </li>
          <li>Os vídeos ficam guardados até 6 meses depois que a vaga sai do ar. Dá para apagar quando quiser.</li>
          {e.aceita_texto && <li>Se não puder gravar, dá para responder por escrito.</li>}
        </ul>
        <a href="/privacidade#entrevista-video" className="mt-1 self-start text-label underline underline-offset-2">
          Como funciona
        </a>
      </section>

      <ol className="flex flex-col gap-3">
        {perguntas.map((p) => (
          <li key={p.id}>
            <CartaoPergunta
              p={p}
              logo={logo}
              entrevista={e}
              euId={euId}
              aberta={aberta === p.id}
              abrir={() => setAberta(p.id)}
              fechar={() => setAberta(null)}
              atualizar={(m) => atualizar(p.id, m)}
            />
          </li>
        ))}
      </ol>

      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="text-body-sm text-cerrado-text">
          {aviso}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Botao
          variante="primario"
          disabled={!todas || pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => enviarEntrevistaVideo(e.id, anuncioId));
              if (!r.ok) return setErro(r.erro);
              setAviso(r.mensagem ?? "Entrevista enviada.");
              router.refresh();
            })
          }
          className="self-start"
        >
          <Send aria-hidden />
          {pendente ? "Enviando…" : "Enviar a entrevista"}
        </Botao>
        {!todas && (
          <p className="text-body-sm text-ink-muted">
            Faltam {perguntas.filter((p) => !p.respondida).length} de {perguntas.length} respostas.
          </p>
        )}
      </div>
    </div>
  );
}

function CartaoPergunta({
  p,
  logo,
  entrevista,
  euId,
  aberta,
  abrir,
  fechar,
  atualizar,
}: {
  p: Pergunta;
  logo: string | null;
  entrevista: MinhaEntrevistaVideo;
  euId: string;
  aberta: boolean;
  abrir: () => void;
  fechar: () => void;
  atualizar: (m: Partial<Pergunta>) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"video" | "texto">("video");
  const limite = entrevista.segunda_chance ? 2 : 1;

  function verAPergunta() {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => verPergunta(entrevista.id, p.id));
      if (!r.ok) return setErro(r.erro);
      atualizar({ texto: r.texto, vista: true });
      abrir();
    });
  }

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border p-4 ${aberta ? "border-ink bg-surface-200" : "border-line bg-surface-200"}`}
    >
      <div className="flex items-start gap-3">
        {p.respondida ? (
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
        ) : (
          <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-label">
            Pergunta {p.ordem}
            {p.respondida && (
              <span className="ml-2 font-normal text-ink-muted">
                {p.tipo === "texto"
                  ? "respondida por escrito"
                  : `gravada${p.duracao ? `, ${textoDoTempo(p.duracao)}` : ""}`}
              </span>
            )}
          </h2>
          {p.texto ? (
            <p className="mt-1 text-body">{p.texto}</p>
          ) : (
            <p className="mt-1 text-body-sm text-ink-muted">A pergunta aparece quando você abrir.</p>
          )}
        </div>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      {!p.vista ? (
        <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={verAPergunta} className="self-start">
          <Video aria-hidden />
          {pendente ? "Abrindo…" : "Ver a pergunta e responder"}
        </Botao>
      ) : !aberta ? (
        (!p.respondida || (p.tipo === "video" && p.tentativas < limite) || p.tipo === "texto") && (
          <Botao tamanho="sm" variante={p.respondida ? "fantasma" : "primario"} onClick={abrir} className="self-start">
            {p.respondida ? <RotateCcw aria-hidden /> : <Video aria-hidden />}
            {p.respondida ? "Responder de novo" : "Responder"}
          </Botao>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {entrevista.aceita_texto && (
            <div role="tablist" aria-label="Como responder" className="flex gap-1">
              {(["video", "texto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={modo === m}
                  onClick={() => setModo(m)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3 text-label ${
                    modo === m ? "bg-ink text-surface-100" : "bg-surface-300 text-ink"
                  }`}
                >
                  {m === "video" ? (
                    <Camera aria-hidden className="size-4" />
                  ) : (
                    <Pencil aria-hidden className="size-4" />
                  )}
                  {m === "video" ? "Gravar" : "Escrever"}
                </button>
              ))}
            </div>
          )}
          {modo === "video" ? (
            p.tipo === "video" && p.tentativas >= limite ? (
              <p className="text-body-sm text-ink-muted">Você já gravou esta resposta.</p>
            ) : (
              <Gravador
                logo={logo}
                entrevista={entrevista}
                pergunta={p}
                euId={euId}
                podeRegravar={entrevista.segunda_chance && p.tentativas === 0}
                aoGuardar={(duracao) => {
                  atualizar({ respondida: true, tipo: "video", duracao, tentativas: p.tentativas + 1 });
                  fechar();
                }}
              />
            )
          ) : (
            <ResponderTexto
              entrevistaId={entrevista.id}
              pergunta={p}
              aoGuardar={(texto) => {
                atualizar({ respondida: true, tipo: "texto", resposta_texto: texto, duracao: null });
                fechar();
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}

function ResponderTexto({
  entrevistaId,
  pergunta,
  aoGuardar,
}: {
  entrevistaId: string;
  pergunta: Pergunta;
  aoGuardar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(pergunta.resposta_texto ?? "");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const id = `texto-${pergunta.id}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label">
        Sua resposta
      </label>
      <textarea
        id={id}
        value={texto}
        onChange={(ev) => setTexto(ev.target.value)}
        rows={5}
        maxLength={2000}
        className={`${classesEntrada} resize-y`}
      />
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      <Botao
        tamanho="sm"
        variante="primario"
        disabled={pendente || texto.trim().length < 10}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await chamarAcao(() => responderPorTexto(entrevistaId, pergunta.id, texto));
            if (!r.ok) return setErro(r.erro);
            aoGuardar(texto.trim());
          })
        }
        className="self-start"
      >
        {pendente ? "Guardando…" : "Guardar a resposta"}
      </Botao>
    </div>
  );
}

type Estado = "parado" | "preparando" | "contando" | "gravando" | "conferindo" | "enviando";

/** A câmera da frente, a contagem de 3 s, a gravação com o relógio e a conferência antes de enviar. */
function Gravador({
  logo,
  entrevista,
  pergunta,
  euId,
  podeRegravar,
  aoGuardar,
}: {
  logo: string | null;
  entrevista: MinhaEntrevistaVideo;
  pergunta: Pergunta;
  euId: string;
  /** antes de enviar, dá para gravar de novo uma vez (quando a empresa deixa a segunda chance) */
  podeRegravar: boolean;
  aoGuardar: (duracao: number) => void;
}) {
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [contagem, setContagem] = useState(3);
  const [gravacao, setGravacao] = useState<{ blob: Blob; url: string; duracao: number; ext: string } | null>(null);
  const [regravou, setRegravou] = useState(false);
  const [ligada, setLigada] = useState(false);
  const ao_vivo = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const partes = useRef<Blob[]>([]);
  const inicio = useRef(0);
  const relogio = useRef<number | null>(null);
  const formato = useRef<{ mime: string; ext: string } | null>(null);

  function desligar() {
    if (relogio.current) window.clearInterval(relogio.current);
    relogio.current = null;
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    setLigada(false);
  }
  useEffect(() => () => desligar(), []);
  useEffect(
    () => () => {
      if (gravacao) URL.revokeObjectURL(gravacao.url);
    },
    [gravacao],
  );

  async function ligarCamera() {
    setErro(null);
    formato.current = formatoDeGravacao();
    if (!formato.current || !navigator.mediaDevices?.getUserMedia) {
      setErro(
        "Este navegador não grava vídeo. Abra pelo Chrome (Android) ou pelo Safari (iPhone)" +
          (entrevista.aceita_texto ? ", ou responda por escrito." : "."),
      );
      return false;
    }
    setEstado("preparando");
    try {
      fluxo.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (ao_vivo.current) {
        ao_vivo.current.srcObject = fluxo.current;
        await ao_vivo.current.play().catch(() => undefined);
      }
      setLigada(true);
      setEstado("parado");
      return true;
    } catch {
      setEstado("parado");
      setErro(
        "Não deu para abrir a câmera e o microfone. Toque no cadeado ao lado do endereço do site e permita a câmera e o microfone" +
          (entrevista.aceita_texto ? ", ou responda por escrito." : "."),
      );
      return false;
    }
  }

  async function comecar() {
    if (!fluxo.current && !(await ligarCamera())) return;
    setEstado("contando");
    setContagem(3);
    let n = 3;
    const t = window.setInterval(() => {
      n -= 1;
      setContagem(n);
      if (n <= 0) {
        window.clearInterval(t);
        gravar();
      }
    }, 1000);
  }

  function gravar() {
    if (!fluxo.current || !formato.current) return;
    partes.current = [];
    const r = new MediaRecorder(fluxo.current, {
      mimeType: formato.current.mime,
      videoBitsPerSecond: BITS_VIDEO,
      audioBitsPerSecond: BITS_AUDIO,
    });
    r.ondataavailable = (ev) => {
      if (ev.data.size) partes.current.push(ev.data);
    };
    r.onstop = () => {
      const duracao = Math.max(1, Math.round((Date.now() - inicio.current) / 1000));
      const tipo = (formato.current?.mime ?? "video/webm").split(";")[0];
      const blob = new Blob(partes.current, { type: tipo });
      setGravacao({ blob, url: URL.createObjectURL(blob), duracao, ext: formato.current?.ext ?? "webm" });
      setEstado("conferindo");
      desligar();
    };
    gravador.current = r;
    inicio.current = Date.now();
    setSegundos(0);
    r.start(1000);
    setEstado("gravando");
    relogio.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - inicio.current) / 1000);
      setSegundos(s);
      if (s >= entrevista.segundos) parar();
    }, 250);
  }

  function parar() {
    if (relogio.current) window.clearInterval(relogio.current);
    relogio.current = null;
    if (gravador.current?.state === "recording") gravador.current.stop();
  }

  async function enviar() {
    if (!gravacao) return;
    setErro(null);
    setEstado("enviando");
    const caminho = `${euId}/${entrevista.id}/${pergunta.id}-${Date.now()}.${gravacao.ext}`;
    const { error } = await criarClienteNavegador()
      .storage.from(BUCKET_VIDEO)
      .upload(caminho, gravacao.blob, { contentType: gravacao.blob.type || "video/webm", upsert: false });
    if (error) {
      setEstado("conferindo");
      setErro("Não deu para enviar o vídeo. Confira a internet e toque em Enviar de novo.");
      return;
    }
    const r = await chamarAcao(() => registrarResposta(entrevista.id, pergunta.id, caminho, gravacao.duracao));
    if (!r.ok) {
      setEstado("conferindo");
      setErro(r.erro);
      return;
    }
    aoGuardar(gravacao.duracao);
  }

  const falta = Math.max(0, entrevista.segundos - segundos);
  // Modo foco (01/11/2026): com a câmera ligada (e até enviar), a gravação ocupa a tela toda, no celular e no
  // computador, com a página parada atrás. Fechar desliga a câmera (não durante a gravação nem o envio).
  const foco = ligada || estado !== "parado";
  const podeFechar = estado === "parado" || estado === "conferindo";
  function fecharFoco() {
    desligar();
    setGravacao(null);
    setEstado("parado");
  }
  const fecharComEsc = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.key === "Escape" && podeFechar) fecharFoco();
  });
  useEffect(() => {
    if (!foco) return;
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    const esc = (ev: KeyboardEvent) => fecharComEsc(ev);
    window.addEventListener("keydown", esc);
    return () => {
      html.style.overflow = antes;
      window.removeEventListener("keydown", esc);
    };
  }, [foco]);

  return (
    <div
      role={foco ? "dialog" : undefined}
      aria-modal={foco ? true : undefined}
      aria-label={foco ? `Gravar a resposta da pergunta ${pergunta.ordem}` : undefined}
      className={
        foco
          ? "fixed inset-0 z-[90] flex flex-col bg-surface-100 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6"
          : "flex flex-col gap-3"
      }
    >
      <div className={foco ? "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3" : "contents"}>
        {foco && (
          <div className="flex items-start gap-3">
            <Avatar nome={entrevista.empresa} foto={logo} tamanho={44} forma="quadrada" />
            <div className="min-w-0 flex-1">
              <p className="text-label text-ink-muted">
                {entrevista.empresa} · Pergunta {pergunta.ordem}
              </p>
              {pergunta.texto && <p className="text-body-lg">{pergunta.texto}</p>}
            </div>
            {podeFechar && (
              <button
                type="button"
                onClick={fecharFoco}
                aria-label="Fechar a câmera"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink hover:bg-surface-200"
              >
                <X aria-hidden className="size-5" />
              </button>
            )}
          </div>
        )}
        <div
          className={`relative overflow-hidden rounded-md bg-ink ${foco ? "min-h-0 flex-1" : "aspect-[4/3] w-full"}`}
        >
          {estado === "conferindo" || estado === "enviando" ? (
            <video src={gravacao?.url} controls playsInline className="size-full bg-ink object-contain" />
          ) : (
            <video
              ref={ao_vivo}
              muted
              playsInline
              aria-label="A sua câmera"
              className="size-full -scale-x-100 bg-ink object-cover"
            />
          )}
          {!ligada && (estado === "parado" || estado === "preparando") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-300 p-4 text-center">
              <Botao
                tamanho="sm"
                variante="primario"
                disabled={estado === "preparando"}
                onClick={() => void ligarCamera()}
              >
                <Camera aria-hidden />
                {estado === "preparando" ? "Abrindo a câmera…" : "Ativar a câmera"}
              </Botao>
              <p className="max-w-xs text-body-sm text-ink-muted">
                O navegador vai pedir a câmera e o microfone: toque em Permitir.
              </p>
            </div>
          )}
          {estado === "contando" && (
            <span
              aria-live="assertive"
              className="absolute inset-0 flex items-center justify-center text-[64px] font-semibold text-surface-100"
            >
              {contagem}
            </span>
          )}
          {estado === "gravando" && (
            <span
              role="timer"
              aria-live="off"
              className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-pill bg-danger px-2.5 py-1 text-caption text-surface-100 tabular-nums"
            >
              <span aria-hidden className="size-2 rounded-pill bg-surface-100" />
              Gravando · falta {textoDoTempo(falta)}
            </span>
          )}
        </div>
        {erro && (
          <p role="alert" className="text-body-sm text-danger">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {estado === "parado" && ligada && (
            <Botao tamanho="sm" variante="primario" onClick={comecar}>
              <Video aria-hidden />
              Começar a gravar
            </Botao>
          )}
          {estado === "gravando" && (
            <Botao tamanho="sm" variante="primario" onClick={parar}>
              <Square aria-hidden />
              Parar
            </Botao>
          )}
          {(estado === "conferindo" || estado === "enviando") && (
            <>
              <Botao tamanho="sm" variante="primario" disabled={estado === "enviando"} onClick={enviar}>
                <Send aria-hidden />
                {estado === "enviando" ? "Enviando o vídeo…" : "Enviar esta resposta"}
              </Botao>
              {podeRegravar && !regravou && estado === "conferindo" && (
                <Botao
                  tamanho="sm"
                  variante="fantasma"
                  onClick={() => {
                    setRegravou(true);
                    setGravacao(null);
                    setEstado("parado");
                    void ligarCamera();
                  }}
                >
                  <RotateCcw aria-hidden />
                  Gravar de novo
                </Botao>
              )}
            </>
          )}
        </div>
        <p className="text-caption text-ink-muted">
          Até {textoDoTempo(entrevista.segundos)}. Fale olhando para a câmera, num lugar com luz e sem barulho.
        </p>
      </div>
    </div>
  );
}

function ApagarTudo({ id }: { id: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  if (!confirmando) {
    return (
      <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmando(true)} className="self-start">
        <Trash2 aria-hidden />
        Apagar meus vídeos
      </Botao>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3 text-body-sm">
      <p>
        Os vídeos, as respostas e o resumo desta entrevista somem para você e para a empresa. Não dá para desfazer.{" "}
        <Selo variante="contorno">A candidatura continua</Selo>
      </p>
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="perigo"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await chamarAcao(() => apagarMinhaEntrevistaVideo(id));
              if (!r.ok) return setErro(r.erro);
              router.refresh();
            })
          }
        >
          Apagar
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmando(false)}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
