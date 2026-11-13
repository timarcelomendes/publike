-- A IA no ato de impulsionar (13/11/2026, pedido do Marcelo: "a IA olhar e ver se tem oportunidade de melhorar... isso
-- é padrão"). Uma vez por impulso, a IA lê a vaga e as buscas que o Publike montou (`buscasDaVaga`) e devolve o que
-- falta, o que traz gente errada e as palavras negativas do grupo (src/lib/servidor/impulso-ia.ts). O robô confere,
-- guarda aqui e aplica a cada conferência das palavras, sem chamar a IA de novo.
--
-- `palavras_ia`: {acrescentar, tirar, negativas (listas de texto), porque, modelo, em} ou, quando a IA falhou,
-- {..., erro, em} (a IA tenta de novo depois de 1 dia). Guardar a revisão manda conferir as palavras na medida seguinte.
-- A funcionalidade "impulso" entra em Admin › IA (o modelo de cada funcionalidade).

alter table privado.impulsos add column if not exists palavras_ia jsonb;
-- a data da conferência das palavras (da 20270507120000; aqui também, se ela ainda não rodou)
alter table privado.impulsos add column if not exists palavras_em timestamptz;

-- a revisão guardada (null: ainda não teve)
create or replace function public.servidor_impulso_palavras_ia(p_chave text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select i.palavras_ia from privado.impulsos i where i.id = p_id);
end
$$;

-- guarda a revisão e manda conferir as palavras na medida seguinte (até 30 kB)
create or replace function public.servidor_impulso_salvar_palavras_ia(p_chave text, p_id uuid, p_ia jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_ia is null or jsonb_typeof(p_ia) <> 'object' or octet_length(p_ia::text) > 30000 then
    raise exception 'Revisão inválida.' using errcode = '22023';
  end if;
  update privado.impulsos set palavras_ia = p_ia, palavras_em = null where id = p_id;
end
$$;

revoke execute on function public.servidor_impulso_palavras_ia(text, uuid),
  public.servidor_impulso_salvar_palavras_ia(text, uuid, jsonb) from public;
grant execute on function public.servidor_impulso_palavras_ia(text, uuid),
  public.servidor_impulso_salvar_palavras_ia(text, uuid, jsonb) to anon, authenticated, service_role;

-- Admin › IA: o modelo da funcionalidade "impulso" (a mesma função de 20270208120000, com ela na lista)
create or replace function public.admin_salvar_ia_por_funcionalidade(p_modelos jsonb, p_apelido text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text;
  v_modelo text;
  v_apelido text := nullif(btrim(regexp_replace(coalesce(p_apelido, ''), '\s+', ' ', 'g')), '');
begin
  perform privado.exigir_admin();
  if p_modelos is null or jsonb_typeof(p_modelos) <> 'object' then
    raise exception 'Modelos inválidos.' using errcode = '22023';
  end if;
  for v_chave, v_modelo in select key, value from jsonb_each_text(p_modelos) loop
    if v_chave not in ('chat', 'revisao', 'ler', 'textos', 'funcao', 'empresa', 'descobrir', 'admin', 'impulso')
       or coalesce(v_modelo, '') !~ '^[a-z0-9][a-z0-9.-]{2,60}$' then
      raise exception 'Modelo inválido para %.', v_chave using errcode = '22023';
    end if;
  end loop;
  if v_apelido is not null and char_length(v_apelido) > 20 then
    raise exception 'O apelido tem até 20 letras.' using errcode = '22023';
  end if;
  update public.config_site
     set ia_modelos = p_modelos,
         ia_apelido = v_apelido,
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'ia', 'IA',
                            jsonb_build_object('modelos', p_modelos, 'apelido', v_apelido));
end
$$;
revoke execute on function public.admin_salvar_ia_por_funcionalidade(jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_salvar_ia_por_funcionalidade(jsonb, text) to service_role;

notify pgrst, 'reload schema';
