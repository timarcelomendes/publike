// O convite das vagas vistas (components/convite-das-vagas-vistas.tsx): ao entrar, a pessoa volta para a vaga com
// ?avisar_area=1 e o aviso da área é criado ali mesmo.
//
// Fica fora do arquivo "use client" (17/11/2026): importada pela página da vaga (servidor) de um módulo de cliente,
// a constante virava uma referência ao módulo, não o texto, e a conta `sp[PARAMETRO_DA_VOLTA]` nunca achava o
// parâmetro (quem voltava do convite já com a conta não via o aviso da área ser criado).
export const PARAMETRO_DA_VOLTA = "avisar_area";
