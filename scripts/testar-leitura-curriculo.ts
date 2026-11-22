// A leitura do currículo (src/lib/servidor/leitura-curriculo.ts, migração 20270826120000;
// claude/plano-curriculos-qualificados.md), sem banco e sem a IA: o `fetch` é trocado por respostas prontas. Confere o
// tempo das experiências, o texto que vai para a IA (sem nome nem contato), as ocupações oferecidas, a resposta
// conferida (só códigos da lista, nota de 0 a 100) e o robô das filas (desligado não lê; ligado guarda).
// Roda com `npx tsx scripts/testar-leitura-curriculo.ts` (sai com erro se algo mudou).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.ANTHROPIC_API_KEY = "sk-ant-falsa";
process.env.OPENAI_API_KEY = "sk-falsa";
process.env.PUBLIKE_CHAVE_SERVIDOR = "chave-teste-servidor-123456";
process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (!ok) {
    falhas++;
    console.error(`✗ ${nome}${detalhe === undefined ? "" : `\n    ${JSON.stringify(detalhe)}`}`);
  }
}

let respostaIA: any = {};
let pedidosClaude: any[] = [];
let guardados: any[] = [];
let ligado = false;
const curriculoDaFila = {
  perfil_id: "11111111-2222-3333-4444-555555555555",
  impressao: "0123456789abcdef0123456789abcdef",
  titulo: null,
  experiencias: [
    { cargo: "Auxiliar de escritório", onde: "Contabilidade X", inicio: "2023-01", fim: "2024-06", descricao: "Lançava notas fiscais, controlava planilhas no Excel e atendia clientes" },
  ],
  escolaridade: "medio",
  curso: null,
  estudos: [],
  cursos: ["Excel avançado"],
  habilidades: ["Pacote Office"],
  cnh: null,
  disponibilidade: ["manha", "tarde"],
  tiradas: [],
};

const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
(globalThis as any).fetch = async (url: any, init: any) => {
  const u = String(url);
  const corpo = init?.body ? JSON.parse(String(init.body)) : null;
  if (u.includes("anthropic.com")) {
    pedidosClaude.push(corpo);
    return json({ content: [{ type: "text", text: JSON.stringify(respostaIA) }], stop_reason: "end_turn", usage: { input_tokens: 2400, output_tokens: 500 } });
  }
  if (u.includes("/rpc/funcoes_das_experiencias")) return json([{ chave: "x", cbo: "411005" }]);
  if (u.includes("/rpc/servidor_config_leitura")) return json({ ligado, modelo: null });
  if (u.includes("/rpc/servidor_curriculos_para_leitura")) return json([curriculoDaFila]);
  if (u.includes("/rpc/servidor_guardar_leitura")) {
    guardados.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/ia_reserva")) return json(false);
  if (u.includes("/rpc/servidor_contar_uso_da_ia")) return json(null);
  return json(null);
};

(async () => {
  const s = await import("../src/lib/servidor/leitura-curriculo");
  const ia = await import("../src/lib/ia/leitura-curriculo");

  // o tempo das experiências (a IA não faz conta de datas)
  const cv = s.paraLer(
    {
      titulo: "Auxiliar administrativa",
      experiencias: [
        { cargo: "Auxiliar de escritório", onde: "X", inicio: "2023-01", fim: "2024-06", descricao: "notas" },
        { cargo: "Recepcionista", onde: "Y", inicio: "2026-05", fim: null, descricao: "" },
        { cargo: "Caixa", onde: "Z", inicio: "", fim: null, descricao: "" },
        { cargo: "  ", onde: "W", inicio: "2020-01", fim: "2020-02", descricao: "" },
      ],
      escolaridade: "tecnico",
      curso: "Técnico em administração",
      estudos: [{ nivel: "superior_incompleto", curso: "Contabilidade" }],
      cursos: ["Excel"],
      habilidades: [],
      cnh: "B",
      disponibilidade: ["manha", "fim_de_semana"],
    },
    new Date(2026, 10, 21),
  );
  conferir(
    cv.experiencias.length === 3 &&
      cv.experiencias[0].meses === 18 &&
      cv.experiencias[1].meses === 7 &&
      cv.experiencias[1].atual &&
      cv.experiencias[2].meses === null,
    "o tempo de cada experiência (18 meses, atual com 7, sem data)",
    cv.experiencias,
  );
  conferir(
    cv.escolaridade === "Técnico" && cv.estudos[0].includes("Contabilidade") && cv.disponibilidade.includes("Fim de semana"),
    "escolaridade, outros estudos e horários com os nomes",
    cv,
  );

  // o texto que vai para a IA: sem nome nem contato, com o tempo pronto e a lista de ocupações
  const opcoes = [
    { cbo: "411005", nome: "Auxiliar de escritório, em geral", sinonimos: ["Auxiliar administrativo"] },
    { cbo: "422105", nome: "Recepcionista, em geral", sinonimos: [] },
  ];
  const msg = ia.mensagemDaLeitura(cv, opcoes);
  conferir(
    msg.includes("1 ano e 6 meses") && msg.includes("7 meses, atual") && msg.includes("411005: Auxiliar de escritório") && msg.includes("<curriculo>") && !/@|\(62\)|\d{4}-\d{4}/.test(msg),
    "a mensagem para a IA",
    msg,
  );

  // a resposta conferida
  const r = ia.conferirLeitura(
    {
      funcoes: [
        { cbo: "411005", nivel: "pronto", porque: "1 ano e 6 meses com notas fiscais" },
        { cbo: "999999", nivel: "pronto", porque: "inventado" },
        { cbo: "411005", nivel: "treinamento", porque: "repetido" },
        { cbo: "422105", nivel: "talvez", porque: "nível errado" },
      ],
      nota: 140,
      melhorar: ["Conte o que fazia como recepcionista", "ok", "Informe a CNH", "Ponha os horários", "a mais"],
    },
    opcoes,
  );
  conferir(
    r !== null && r.funcoes.length === 1 && r.funcoes[0].cbo === "411005" && r.nota === 100 && r.melhorar.length === 3 && !r.melhorar.includes("ok"),
    "só códigos da lista, sem repetir, nível válido, nota até 100, até 3 frases",
    r,
  );
  conferir(ia.conferirLeitura({ funcoes: [], melhorar: [] }, opcoes) === null, "sem nota, a resposta não serve");

  // as ocupações oferecidas: as do robô das experiências e as do texto, sem repetir
  const ofertas = await s.opcoesDaLeitura(cv);
  conferir(
    ofertas.length > 2 && ofertas.length <= 25 && ofertas[0].cbo === "411005" && new Set(ofertas.map((o) => o.cbo)).size === ofertas.length,
    "as ocupações para a IA escolher",
    ofertas.slice(0, 5),
  );
  conferir(s.nomeDaFuncao("411005").length > 3, "o nome da função", s.nomeDaFuncao("411005"));

  // o robô: desligado, não lê
  ligado = false;
  pedidosClaude = [];
  let rodada = await s.leiturasDosCurriculos(3);
  conferir(rodada.lidos === 0 && pedidosClaude.length === 0, "desligado: nada vai para a IA", rodada);

  // ligado: lê com o Sonnet e guarda
  ligado = true;
  respostaIA = { funcoes: [{ cbo: "411005", nivel: "pronto", porque: "1 ano e 6 meses lançando notas" }], nota: 72, melhorar: ["Ponha o que você faz"] };
  guardados = [];
  rodada = await s.leiturasDosCurriculos(3);
  const pedido = pedidosClaude[0];
  const texto = JSON.stringify(pedido?.messages ?? "");
  conferir(
    rodada.lidos === 1 &&
      pedido?.model === "claude-sonnet-5-5" &&
      guardados[0]?.p_nota === 72 &&
      guardados[0]?.p_funcoes?.[0]?.nome &&
      guardados[0]?.p_impressao === curriculoDaFila.impressao &&
      !texto.includes(curriculoDaFila.perfil_id),
    "ligado: lê com o Sonnet, guarda com o nome da função e sem mandar quem é",
    { rodada, modelo: pedido?.model, guardado: guardados[0] },
  );

  // a IA responde com um código fora da lista: a função fica de fora, a leitura é guardada
  respostaIA = { funcoes: [{ cbo: "123456", nivel: "pronto", porque: "x" }], nota: 40, melhorar: [] };
  guardados = [];
  await s.leiturasDosCurriculos(3);
  conferir(guardados[0]?.p_funcoes?.length === 0 && guardados[0]?.p_nota === 40, "código inventado fica de fora", guardados[0]);

  console.log(falhas ? `${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
})();
