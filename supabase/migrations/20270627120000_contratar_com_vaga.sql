-- Quem tem vaga publicada contrata (16/11/2026, Marcelo: "se um perfil tem vaga publicada, obrigatoriamente ele
-- assume a opção de contrata no seu perfil e não consegue desmarcar; ao publicar, automaticamente assume a opção
-- contratar, mesmo tendo outra marcada"). Vaga publicada: no ar, pausada ou em análise (as que contam no limite das
-- vagas no ar).
--   * Ao publicar (ou ao voltar ao ar), "Contratar" entra nos modos da conta, junto com os que ela já tinha.
--   * salvar_meus_modos mantém "Contratar" enquanto houver vaga publicada (o perfil mostra a opção travada).
--   * As contas de hoje com vaga publicada ganham "Contratar" agora.
-- Pode rodar de novo.

create or replace function privado.conta_com_vaga_publicada(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.anuncios a
                  where a.autor_id = p_conta and a.tipo = 'vaga' and a.status in ('ativo', 'pausado', 'em_analise'))
$$;

-- Junta "Contratar" aos modos da conta, na ordem de sempre (trabalhar, servicos, contratar). Sem modos guardados: os
-- de hoje pelo tipo e pelo que a conta já fez (como na migração dos modos, 20261024120000), mais Contratar.
create or replace function privado.juntar_contratar(p_conta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text[];
begin
  if p_conta is null then
    return;
  end if;
  select case
           when p.tipo <> 'pessoa' then array['contratar']::text[]
           else array_remove(array[
             case when exists (select 1 from public.curriculos c where c.perfil_id = p.id)
                    or i.intencao in ('trabalho', 'talento') then 'trabalhar' end,
             case when exists (select 1 from public.anuncios a where a.autor_id = p.id and a.tipo = 'servico')
                    or i.intencao = 'oferecer_servico' then 'servicos' end,
             'contratar'
           ]::text[], null)
         end
    into v_base
    from public.perfis p
    left join privado.intencoes i on i.usuario_id = p.id
   where p.id = p_conta;
  if v_base is null then
    return;
  end if;
  insert into privado.modos_da_conta as m (conta_id, modos) values (p_conta, v_base)
  on conflict (conta_id) do update
     set modos = array(select x from unnest(array['trabalhar', 'servicos', 'contratar']) as x
                        where x = any (m.modos || array['contratar'])),
         atualizado_em = now()
   where not ('contratar' = any (m.modos));
end
$$;

revoke execute on function privado.conta_com_vaga_publicada(uuid), privado.juntar_contratar(uuid)
  from public, anon, authenticated;

-- Ao publicar a vaga (ou ela voltar ao ar)
create or replace function privado.vaga_poe_contratar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.juntar_contratar(new.autor_id);
  return null;
end
$$;

drop trigger if exists anuncios_zz_contratar on public.anuncios;
create trigger anuncios_zz_contratar
  after insert or update of status on public.anuncios
  for each row
  when (new.tipo = 'vaga' and new.status in ('ativo', 'pausado', 'em_analise'))
  execute function privado.vaga_poe_contratar();

-- Grava os modos (na ordem: trabalhar, servicos, contratar). Só o dono ou o admin da conta; "Procurar trabalho" só
-- para pessoa; com vaga publicada, "Contratar" fica.
create or replace function public.salvar_meus_modos(p_modos text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  tipo_conta text;
  com_vaga boolean;
  limpos text[];
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda o que ela faz.' using errcode = '42501';
  end if;
  select p.tipo into tipo_conta from public.perfis p where p.id = conta;
  if tipo_conta is null then
    raise exception 'Complete o perfil primeiro.' using errcode = '22023';
  end if;
  com_vaga := privado.conta_com_vaga_publicada(conta);
  limpos := array(
    select m from unnest(array['trabalhar', 'servicos', 'contratar']) as m
    where (m = any (coalesce(p_modos, '{}')) or (m = 'contratar' and com_vaga))
      and (m <> 'trabalhar' or tipo_conta = 'pessoa')
  );
  if cardinality(limpos) = 0 then
    raise exception 'Marque pelo menos uma opção.' using errcode = '22023';
  end if;
  insert into privado.modos_da_conta (conta_id, modos) values (conta, limpos)
  on conflict (conta_id) do update set modos = excluded.modos, atualizado_em = now();
  return limpos;
end
$$;
revoke execute on function public.salvar_meus_modos(text[]) from public, anon;
grant execute on function public.salvar_meus_modos(text[]) to authenticated;

-- Para o perfil: a conta tem vaga publicada (a opção "Contratar" fica travada)
create or replace function public.tenho_vaga_publicada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.conta_com_vaga_publicada(public.conta_atual())
$$;
revoke execute on function public.tenho_vaga_publicada() from public, anon;
grant execute on function public.tenho_vaga_publicada() to authenticated;

-- As contas de hoje com vaga publicada
do $$
begin
  perform privado.juntar_contratar(x.autor_id)
     from (select distinct a.autor_id from public.anuncios a
            where a.tipo = 'vaga' and a.status in ('ativo', 'pausado', 'em_analise')) x;
end
$$;

notify pgrst, 'reload schema';
