-- O Supabase recusa DELETE sem WHERE ("DELETE requires a WHERE clause"): o robô dos salários não conseguiu gravar o
-- que cada ramo contrata (15/11/2026). A troca da tabela passa a dizer "where true". Pode rodar de novo.

create or replace function public.servidor_ramos_salvar(p_chave text, p_linhas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0
     or jsonb_array_length(p_linhas) > 200000 then
    raise exception 'Mande a lista dos ramos.' using errcode = '22023';
  end if;
  delete from privado.ramos_funcoes where true;
  insert into privado.ramos_funcoes (cnae, cbo, contratacoes)
  select l ->> 'cnae', l ->> 'cbo', (l ->> 'contratacoes')::integer
    from jsonb_array_elements(p_linhas) l
   where (l ->> 'cnae') ~ '^[0-9]{7}$' and (l ->> 'cbo') ~ '^[0-9]{6}$' and coalesce((l ->> 'contratacoes')::integer, 0) > 0
  on conflict (cnae, cbo) do update set contratacoes = excluded.contratacoes, atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;

notify pgrst, 'reload schema';
