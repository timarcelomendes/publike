-- O uso da IA (20270210120000) ganha as buscas na internet, que são cobradas à parte (cerca de US$ 10 a cada mil,
-- na OpenAI e no Claude). A transcrição de áudio passa a contar também (funcionalidade "transcricao"). Pode rodar
-- de novo.

alter table privado.uso_da_ia add column if not exists buscas integer not null default 0;

drop function if exists public.servidor_contar_uso_da_ia(text, text, text, boolean, integer, integer);
create or replace function public.servidor_contar_uso_da_ia(
  p_chave text,
  p_funcionalidade text,
  p_modelo text,
  p_falhou boolean default false,
  p_entrada integer default 0,
  p_saida integer default 0,
  p_buscas integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_funcionalidade, '') !~ '^[a-z]{2,20}$' or char_length(coalesce(p_modelo, '')) not between 1 and 60 then
    raise exception 'Uso inválido.' using errcode = '22023';
  end if;
  insert into privado.uso_da_ia as u (dia, funcionalidade, modelo, chamadas, falhas, tokens_entrada, tokens_saida, buscas)
  values (
    hoje, p_funcionalidade, p_modelo,
    case when p_falhou then 0 else 1 end, case when p_falhou then 1 else 0 end,
    greatest(coalesce(p_entrada, 0), 0), greatest(coalesce(p_saida, 0), 0), least(greatest(coalesce(p_buscas, 0), 0), 100)
  )
  on conflict (dia, funcionalidade, modelo) do update
     set chamadas = u.chamadas + excluded.chamadas,
         falhas = u.falhas + excluded.falhas,
         tokens_entrada = u.tokens_entrada + excluded.tokens_entrada,
         tokens_saida = u.tokens_saida + excluded.tokens_saida,
         buscas = u.buscas + excluded.buscas;
  if random() < 0.01 then
    delete from privado.uso_da_ia where dia < hoje - 400;
  end if;
end
$$;

drop function if exists public.admin_uso_da_ia(integer);
create or replace function public.admin_uso_da_ia(p_dias integer default 30)
returns table (
  funcionalidade text,
  modelo text,
  chamadas bigint,
  falhas bigint,
  tokens_entrada bigint,
  tokens_saida bigint,
  buscas bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select u.funcionalidade, u.modelo, sum(u.chamadas)::bigint, sum(u.falhas)::bigint,
         sum(u.tokens_entrada)::bigint, sum(u.tokens_saida)::bigint, sum(u.buscas)::bigint
    from privado.uso_da_ia u
   where u.dia > (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(p_dias, 30), 1), 400)
   group by u.funcionalidade, u.modelo;
end
$$;

revoke execute on function public.servidor_contar_uso_da_ia(text, text, text, boolean, integer, integer, integer),
  public.admin_uso_da_ia(integer) from public;
grant execute on function public.servidor_contar_uso_da_ia(text, text, text, boolean, integer, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.admin_uso_da_ia(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
