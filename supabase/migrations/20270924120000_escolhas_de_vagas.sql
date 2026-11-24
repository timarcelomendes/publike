-- A comparação da escolha das vagas pela IA (24/11/2026; Marcelo: "mudar esse para o Sonnet e ver o desempenho em
-- relação ao Haiku"). Por um tempo, cada escolha das vagas no WhatsApp roda também no Haiku, ao mesmo tempo, só para
-- comparar: a resposta que vai para a pessoa é a do modelo escolhido em Admin › IA. Fica guardado o que a pessoa
-- contou, quantas vagas havia, o que cada modelo escolheu, a frase e o tempo. 30 dias.

create table if not exists privado.escolhas_de_vagas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  relato text not null,
  opcoes integer not null,
  modelo text,
  ms integer,
  escolhidas jsonb not null default '[]'::jsonb,
  abertura text,
  modelo_comparado text,
  ms_comparado integer,
  escolhidas_comparado jsonb,
  abertura_comparada text
);
create index if not exists escolhas_de_vagas_criado on privado.escolhas_de_vagas (criado_em desc);
revoke all on privado.escolhas_de_vagas from public, anon, authenticated;

create or replace function public.servidor_guardar_escolha_de_vagas(p_chave text, p_dados jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.escolhas_de_vagas
    (relato, opcoes, modelo, ms, escolhidas, abertura, modelo_comparado, ms_comparado, escolhidas_comparado,
     abertura_comparada)
  values (left(coalesce(p_dados ->> 'relato', ''), 2000), coalesce((p_dados ->> 'opcoes')::integer, 0),
          left(p_dados ->> 'modelo', 60), (p_dados ->> 'ms')::integer, coalesce(p_dados -> 'escolhidas', '[]'::jsonb),
          left(p_dados ->> 'abertura', 400), left(p_dados ->> 'modelo_comparado', 60), (p_dados ->> 'ms_comparado')::integer,
          p_dados -> 'escolhidas_comparado', left(p_dados ->> 'abertura_comparada', 400));
  delete from privado.escolhas_de_vagas e where e.criado_em < now() - interval '30 days';
end
$$;
revoke execute on function public.servidor_guardar_escolha_de_vagas(text, jsonb) from public;
grant execute on function public.servidor_guardar_escolha_de_vagas(text, jsonb) to anon, authenticated, service_role;

select privado.migracao_aplicada('20270924120000_escolhas_de_vagas');
