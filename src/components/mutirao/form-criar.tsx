"use client";

import { CalendarPlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { criarMutirao } from "@/lib/acoes/mutirao";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada } from "../ui/campo";

/**
 * Criar o mutirão (migração 20270417120000): o dia, das que horas às que horas, de quanto em quanto tempo, quantas
 * pessoas por horário, o endereço, o que trazer e as vagas. Mostra na hora quantos lugares o dia tem.
 */
export function FormCriarMutirao({
  vagas,
  hoje,
  enderecoPadrao,
}: {
  vagas: { id: string; titulo: string }[];
  hoje: string;
  enderecoPadrao: string;
}) {
  const router = useRouter();
  const [dia, setDia] = useState("");
  const [inicio, setInicio] = useState("09:00");
  const [fim, setFim] = useState("12:00");
  const [intervalo, setIntervalo] = useState(20);
  const [porHorario, setPorHorario] = useState(2);
  const [local, setLocal] = useState(enderecoPadrao);
  const [trazer, setTrazer] = useState("Documento com foto e o currículo, se tiver.");
  const [escolhidas, setEscolhidas] = useState<string[]>(vagas.length === 1 ? [vagas[0].id] : []);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const minutos = (h: string) => {
    const [a, b] = h.split(":").map(Number);
    return a * 60 + (b || 0);
  };
  const horarios = Math.max(0, Math.floor((minutos(fim) - minutos(inicio)) / intervalo));
  const lugares = horarios * porHorario;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() =>
        criarMutirao({ dia, inicio, fim, intervalo, porHorario, local, trazer, vagas: escolhidas }),
      );
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.push(`/painel/mutiroes/${r.id}`);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 shadow-card" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Dia" nome="mut-dia">
          <input
            id="mut-dia"
            type="date"
            min={hoje}
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            className={classesEntrada}
            required
          />
        </Campo>
        <Campo rotulo="Das" nome="mut-inicio">
          <input
            id="mut-inicio"
            type="time"
            step={300}
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Às" nome="mut-fim">
          <input
            id="mut-fim"
            type="time"
            step={300}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className={classesEntrada}
          />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Uma entrevista a cada" nome="mut-intervalo">
          <select
            id="mut-intervalo"
            value={intervalo}
            onChange={(e) => setIntervalo(Number(e.target.value))}
            className={classesEntrada}
          >
            <option value={15}>15 minutos</option>
            <option value={20}>20 minutos</option>
            <option value={30}>30 minutos</option>
          </select>
        </Campo>
        <Campo rotulo="Pessoas por horário" nome="mut-por" ajuda="Quantas pessoas vocês atendem ao mesmo tempo.">
          <select
            id="mut-por"
            value={porHorario}
            onChange={(e) => setPorHorario(Number(e.target.value))}
            aria-describedby="mut-por-ajuda"
            className={classesEntrada}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <p className="text-body-sm text-ink-muted" aria-live="polite">
        {horarios > 0
          ? `${horarios} ${horarios === 1 ? "horário" : "horários"}, ${lugares} ${lugares === 1 ? "lugar" : "lugares"} no dia.`
          : "O fim precisa ser depois do começo."}
      </p>
      <Campo rotulo="Endereço" nome="mut-local">
        <input
          id="mut-local"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          maxLength={300}
          placeholder="Rua, número, bairro e uma referência"
          className={classesEntrada}
        />
      </Campo>
      <Campo rotulo="O que trazer" nome="mut-trazer" opcional>
        <input
          id="mut-trazer"
          value={trazer}
          onChange={(e) => setTrazer(e.target.value)}
          maxLength={300}
          className={classesEntrada}
        />
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Vagas do mutirão</legend>
        {vagas.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Publique uma vaga primeiro: o mutirão chama quem curtiu as suas vagas.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {vagas.map((v) => (
              <li key={v.id}>
                <label className="flex min-h-10 items-center gap-3 text-body">
                  <input
                    type="checkbox"
                    checked={escolhidas.includes(v.id)}
                    onChange={(e) =>
                      setEscolhidas((x) => (e.target.checked ? [...x, v.id] : x.filter((y) => y !== v.id)))
                    }
                    className="size-4 accent-terra"
                  />
                  {v.titulo}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      <Botao type="submit" variante="primario" disabled={pendente || !escolhidas.length} className="self-start">
        {pendente ? <LoaderCircle aria-hidden className="animate-spin" /> : <CalendarPlus aria-hidden />}
        Criar o mutirão
      </Botao>
    </form>
  );
}
