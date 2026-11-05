-- Um modelo de IA para cada funcionalidade e o apelido da IA (05/11/2026; claude/plano-ia-por-funcionalidade.md).
-- Em Admin › IA, cada funcionalidade (o chat, a revisão, ler currículo e vaga, melhorar textos, a função da vaga,
-- a triagem e o copiloto, o Descobrir e o admin) pode ter o seu modelo; sem escolha, vale o padrão (ia_modelo).
-- O apelido é o nome com que a IA aparece no site ("Melhorar com Ipê"); vazio, "a IA". Pode rodar de novo.

alter table public.config_site add column if not exists ia_modelos jsonb not null default '{}'::jsonb;
alter table public.config_site add column if not exists ia_apelido text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'config_site_ia_modelos_objeto') then
    alter table public.config_site
      add constraint config_site_ia_modelos_objeto check (jsonb_typeof(ia_modelos) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'config_site_ia_apelido_curto') then
    alter table public.config_site
      add constraint config_site_ia_apelido_curto check (ia_apelido is null or char_length(ia_apelido) between 1 and 20);
  end if;
end
$$;

-- a de 20261008120000, mais as escolhas por funcionalidade e o apelido (nada disso é segredo)
drop function if exists public.config_publica();
create or replace function public.config_publica()
returns table (ia_melhorar_texto boolean, ia_modelo text, ia_modelos jsonb, ia_apelido text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.ia_melhorar_texto, c.ia_modelo, c.ia_modelos, c.ia_apelido from public.config_site c
$$;
revoke execute on function public.config_publica() from public;
grant execute on function public.config_publica() to anon, authenticated, service_role;

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
    if v_chave not in ('chat', 'revisao', 'ler', 'textos', 'funcao', 'empresa', 'descobrir', 'admin')
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
