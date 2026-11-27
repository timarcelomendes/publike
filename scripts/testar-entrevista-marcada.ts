// A entrevista marcada pelo WhatsApp, fase 1 (migração 20271013120000): os horários do texto da empresa, os modelos
// da Meta, as mensagens da conversa e a lista dos horários. Sem banco e sem a Meta (o fetch é falso).
// Roda com `npx tsx scripts/testar-entrevista-marcada.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = {
  id: servidorSo,
  filename: servidorSo,
  loaded: true,
  exports: {},
} as any;
process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (!ok) {
    falhas++;
    console.error(
      `✗ ${nome}${detalhe === undefined ? "" : `\n    ${JSON.stringify(detalhe)}`}`,
    );
  }
}

async function main() {
  const h = await import("../src/lib/agenda-horarios");
  const ag = await import("../src/lib/servidor/agenda-entrevistas");
  const w = await import("../src/lib/servidor/whatsapp");

  // 1. os horários do texto (sexta, 27/11/2026, 10h em Goiânia)
  const agora = new Date("2026-11-27T10:00:00-03:00");
  const ler = (t: string, d = 30) => h.horariosDoTexto(t, d, agora);
  let r = ler("02/12 14h-17h");
  conferir(
    r.horarios.length === 6 &&
      r.horarios[0] === "2026-12-02T14:00:00-03:00" &&
      r.horarios[5] === "2026-12-02T16:30:00-03:00",
    "a faixa vira horários de 30 min",
    r,
  );
  conferir(ler("2/12 14:00 às 17:00").horarios.length === 6, "14:00 às 17:00");
  r = ler("terça e quarta 9h às 11h30");
  conferir(
    r.horarios.length === 10 &&
      r.horarios[0] === "2026-12-01T09:00:00-03:00" &&
      r.horarios.at(-1) === "2026-12-02T11:00:00-03:00",
    "dois dias da semana com a faixa",
    r,
  );
  r = ler("amanhã 9h, 10h, 11h30");
  conferir(
    JSON.stringify(r.horarios) ===
      JSON.stringify([
        "2026-11-28T09:00:00-03:00",
        "2026-11-28T10:00:00-03:00",
        "2026-11-28T11:30:00-03:00",
      ]),
    "amanhã com os horários soltos",
    r,
  );
  conferir(
    ler("sexta 14h30").horarios[0] === "2026-11-27T14:30:00-03:00",
    "sexta é hoje (é sexta)",
    ler("sexta 14h30"),
  );
  r = ler("hoje 10h30");
  conferir(
    r.horarios.length === 0 && r.erros.length === 0,
    "menos de 1 hora daqui fica de fora, sem erro",
    r,
  );
  conferir(
    ler("01/01 9h").horarios[0] === "2027-01-01T09:00:00-03:00",
    "a data que passou é do ano que vem",
  );
  conferir(ler("blabla").erros.length === 1, "linha sem dia nem hora é erro");
  conferir(
    ler("02/12 17h-14h").erros.length === 1,
    "faixa ao contrário é erro",
  );
  r = ler("02/12 14h-15h\n02/12 14h30", 30);
  conferir(r.horarios.length === 2, "sem repetir", r);
  conferir(
    ler("02/12 14h-16h", 60).horarios.length === 2,
    "entrevista de 60 min",
  );
  conferir(
    h.rotuloDoHorario("2026-12-02T14:30:00-03:00") === "qua, 02/12 às 14h30",
    "o rótulo com minutos",
  );
  conferir(
    h.rotuloDoHorario("2026-12-02T14:00:00-03:00") === "qua, 02/12 às 14h",
    "o rótulo da hora cheia",
  );
  conferir(
    h.diaDoHorario("2026-12-02T14:00:00-03:00") === "qua, 02/12",
    "o dia",
  );

  // 1b. o seletor (27/11/2026): os dias, a faixa e a lista conferida no servidor
  const dias = h.proximosDias(agora, 3);
  conferir(
    dias[0].rotulo === "hoje, 27/11" && dias[1].rotulo === "amanhã, 28/11" && dias[2].rotulo === "dom, 29/11" && dias[2].domingo,
    "os próximos dias",
    dias,
  );
  let escolha = h.horariosDaEscolha(["2026-12-02", "2026-12-01"], "09:00", "11:00", 30, agora);
  conferir(
    escolha.length === 8 && escolha[0] === "2026-12-01T09:00:00-03:00" && escolha[7] === "2026-12-02T10:30:00-03:00",
    "a escolha: 9h às 11h, de 30 em 30, nos dois dias, em ordem",
    escolha,
  );
  escolha = h.horariosDaEscolha(["2026-11-27"], "09:00", "12:00", 30, agora);
  conferir(JSON.stringify(escolha) === JSON.stringify(["2026-11-27T11:30:00-03:00"]), "hoje: só a mais de 1 hora", escolha);
  conferir(h.horariosDaEscolha(["2026-12-02"], "09:00", "10:00", 45, agora).length === 1, "45 min: o último acaba até o fim");
  conferir(
    JSON.stringify(h.horariosConferidos(["2026-12-02T10:00:00-03:00", "2026-12-02T09:00:00-03:00", "2026-12-02T09:00:00-03:00", "2026-11-27T10:30:00-03:00"], agora)) ===
      JSON.stringify(["2026-12-02T09:00:00-03:00", "2026-12-02T10:00:00-03:00"]),
    "o servidor confere: em ordem, sem repetir, sem o que já está perto",
  );
  conferir(h.horariosConferidos(["amanhã"], agora) === null && h.horariosConferidos("x", agora) === null, "o servidor recusa o que não é horário");
  conferir(h.nomeDaHora("09:00") === "9h" && h.nomeDaHora("13:30") === "13h30", "o nome da hora");

  // 2. os modelos da Meta
  const nomes = [
    ag.MODELO_CONVITE_ENTREVISTA,
    ag.MODELO_ENTREVISTA_VESPERA,
    ag.MODELO_ENTREVISTA_HOJE,
    ag.MODELO_ENTREVISTA_HOJE_VIDEO,
  ];
  for (const n of nomes) {
    const m = w.MODELOS.find((x) => x.nome === n);
    conferir(
      Boolean(m) && !m!.categoria,
      `o modelo ${n} existe e é de utilidade`,
    );
    if (!m) continue;
    conferir(
      !/^\{\{|\}\}[.!?]?$/.test(m.corpo.trim()),
      `${n}: o corpo não começa nem termina com variável`,
      m.corpo,
    );
    conferir(
      m.botoes.every((b) => b.texto.length <= 25),
      `${n}: os botões cabem`,
    );
    const vars = [...m.corpo.matchAll(/\{\{(\w+)\}\}/g)].map((x) => x[1]);
    conferir(
      vars.every((v) => v in m.exemplo),
      `${n}: cada variável tem exemplo`,
      vars,
    );
  }
  const video = w.MODELOS.find(
    (x) => x.nome === ag.MODELO_ENTREVISTA_HOJE_VIDEO,
  )!;
  const cad = w.cadastroDoModelo(video) as any;
  const btn = cad.components.find((c: any) => c.type === "BUTTONS").buttons;
  conferir(
    btn[0].type === "URL" && btn[1].type === "QUICK_REPLY",
    "o do vídeo: Entrar na sala e Não vou mais",
    btn,
  );

  // 3. o envio: os códigos nos botões e a lista
  let corpo: any = null;
  globalThis.fetch = (async (_url: string, init: any) => {
    corpo = JSON.parse(init.body);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;
  const cfg = {
    token: "t",
    phoneId: "1",
    wabaId: "2",
    appSecret: "s",
    webhookToken: "x",
    base: "https://graph.facebook.com/v21.0",
  };
  const tok = "a".repeat(32);
  const convite = w.MODELOS.find(
    (x) => x.nome === ag.MODELO_CONVITE_ENTREVISTA,
  )!;
  await w.enviarModelo(
    cfg as any,
    "5562988887777",
    convite,
    {
      nome: "Ana",
      empresa: "Padaria",
      vaga: "Atendente",
      formato: "presencial",
    },
    {
      respostas: [`g:sim:${tok}`, `g:nao:${tok}`],
    },
  );
  const qr = corpo.template.components.filter(
    (c: any) => c.sub_type === "quick_reply",
  );
  conferir(
    qr[0].parameters[0].payload === `g:sim:${tok}` &&
      qr[1].parameters[0].payload === `g:nao:${tok}`,
    "o convite leva o código nos dois botões",
    qr,
  );
  conferir(
    ag.PAYLOAD_AGENDA.exec(`g:sim:${tok}`)?.[1] === "sim",
    "o botão volta reconhecido",
  );
  await w.enviarModelo(
    cfg as any,
    "5562988887777",
    video,
    { nome: "Ana", empresa: "P", vaga: "V", hora: "14h" },
    {
      link: "entrar/whatsapp?t=abc",
      respostas: ["", `g:cancelar:${tok}`],
    },
  );
  const comps = corpo.template.components;
  conferir(
    comps.find((c: any) => c.sub_type === "url")?.parameters[0].text ===
      "entrar/whatsapp?t=abc" &&
      comps.find((c: any) => c.sub_type === "quick_reply")?.parameters[0]
        .payload === `g:cancelar:${tok}`,
    "o do vídeo: o link de entrar e o Não vou mais",
    comps,
  );
  await w.enviarLista(cfg as any, "5562988887777", "Escolha", {
    botao: "Ver horários",
    secao: "Horários livres",
    linhas: [{ id: `g:h:12:${tok}`, titulo: "Qua, 02/12 às 14h30" }],
  });
  conferir(
    corpo.interactive.type === "list" &&
      corpo.interactive.action.button === "Ver horários" &&
      corpo.interactive.action.sections[0].rows[0].id === `g:h:12:${tok}`,
    "a lista dos horários",
    corpo.interactive,
  );

  // 4. as mensagens da conversa
  const base = {
    empresa: "Padaria Pão de Ouro",
    vaga: "Atendente",
    como: "presencial, na Rua 10, 250",
    local: "Rua 10, 250",
  };
  const esc = ag.mensagemDaAgenda(
    {
      ...base,
      situacao: "escolher",
      formato: "presencial",
      horarios: [
        {
          id: 7,
          rotulo: "Qua, 02/12 às 14h",
          quando: "2026-12-02T14:00:00-03:00",
        },
        {
          id: 8,
          rotulo: "Qua, 02/12 às 14h30",
          quando: "2026-12-02T14:30:00-03:00",
        },
      ],
    },
    tok,
  );
  conferir(
    esc.texto.includes(ag.MARCA_DOS_HORARIOS) &&
      esc.lista?.linhas.length === 2 &&
      ag.PAYLOAD_HORARIO.exec(esc.lista.linhas[1].id)?.[1] === "8" &&
      esc.lista.linhas.every((l) => l.titulo.length <= 24),
    "escolher: a lista com os códigos dos horários",
    esc,
  );
  const formatos: [string, string][] = [
    ["presencial", "na Rua 10, 250"],
    ["telefone", "vai te ligar"],
    ["video", "link da chamada"],
    ["publike", "entrar na sala"],
  ];
  for (const [formato, trecho] of formatos) {
    const m = ag.mensagemDaAgenda(
      {
        ...base,
        local: formato === "video" ? "https://meet.google.com/x" : base.local,
        situacao: "marcado",
        formato,
        quando: "qua, 02/12 às 14h",
      },
      tok,
    );
    conferir(
      m.texto.startsWith("Marcado ✅") &&
        m.texto.includes(trecho) &&
        m.botoes?.length === 2,
      `marcado ${formato}`,
      m.texto,
    );
  }
  const trocado = ag.mensagemDaAgenda(
    {
      ...base,
      situacao: "marcado",
      formato: "presencial",
      quando: "qua, 02/12 às 15h",
      remarcou: true,
    },
    tok,
  );
  conferir(
    trocado.texto.startsWith("Horário trocado ✅"),
    "a troca diz que trocou",
  );
  conferir(
    !ag.mensagemDaAgenda({ ...base, situacao: "ocupado", horarios: [] }, tok)
      .lista,
    "ocupado sem outro: sem lista",
  );
  conferir(
    Boolean(
      ag.mensagemDaAgenda(
        {
          ...base,
          situacao: "ocupado",
          formato: "presencial",
          horarios: esc.lista
            ? [{ id: 9, rotulo: "Qua, 02/12 às 16h", quando: "" }]
            : [],
        },
        tok,
      ).lista,
    ),
    "ocupado com outro: a lista de novo",
  );
  conferir(
    ag
      .mensagemDaAgenda({ ...base, situacao: "cancelado" }, tok)
      .texto.includes("avisei a empresa"),
    "cancelado",
  );
  conferir(
    ag
      .mensagemDaAgenda({ ...base, situacao: "qualquer" }, tok)
      .texto.includes("já mudou"),
    "situação desconhecida",
  );

  console.log(
    falhas
      ? `\n${falhas} de ${total} conferências falharam.`
      : `${total} conferências, todas certas.`,
  );
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
