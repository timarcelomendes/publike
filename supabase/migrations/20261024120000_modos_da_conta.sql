-- O que a conta faz no Publike: um ou mais modos (Procurar trabalho, Oferecer serviços,
-- Contratar). "Você é" (o tipo da conta) continua uma escolha só; os modos dizem o que aparece
-- no painel e na home. Fica numa tabela privada, como a intenção: só as funções leem e gravam.
--   trabalhar ... vagas curtidas, currículo e entrevistas (só pessoa)
--   servicos .... vitrine, pedidos e avaliações
--   contratar ... vagas, candidatos e entrevistas

create table if not exists privado.modos_da_conta (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  modos text[] not null,
  atualizado_em timestamptz not null default now(),
  constraint modos_validos check (
    cardinality(modos) between 1 and 3
    and modos <@ array['trabalhar', 'servicos', 'contratar']::text[]
  )
);

alter table privado.modos_da_conta enable row level security;
revoke all on privado.modos_da_conta from public, anon, authenticated;

-- Contas que já existem: pelo tipo e pelo que já fizeram.
--   comércio, empresa e agência: Contratar
--   pessoa: Procurar trabalho (currículo ou "procuro trabalho"), Oferecer serviços (serviço
--   publicado ou "ofereço serviços"), Contratar (vaga publicada ou "procuro funcionário");
--   sem nada disso, Procurar trabalho.
insert into privado.modos_da_conta (conta_id, modos)
select p.id,
       case
         when p.tipo <> 'pessoa' then array['contratar']::text[]
         else coalesce(
           nullif(
             array_remove(array[
               case when exists (select 1 from public.curriculos c where c.perfil_id = p.id)
                      or i.intencao in ('trabalho', 'talento') then 'trabalhar' end,
               case when exists (select 1 from public.anuncios a where a.autor_id = p.id and a.tipo = 'servico')
                      or i.intencao = 'oferecer_servico' then 'servicos' end,
               case when exists (select 1 from public.anuncios a where a.autor_id = p.id and a.tipo = 'vaga')
                      or i.intencao = 'contratar_pessoa' then 'contratar' end
             ]::text[], null),
             '{}'::text[]
           ),
           array['trabalhar']::text[]
         )
       end
from public.perfis p
left join privado.intencoes i on i.usuario_id = p.id
on conflict (conta_id) do nothing;

-- Os modos da conta pela qual a pessoa age (a dela ou a da agência). Sem escolha: null.
create or replace function public.meus_modos()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select m.modos from privado.modos_da_conta m where m.conta_id = (select public.conta_atual())
$$;

-- Grava os modos (na ordem: trabalhar, servicos, contratar). Só o dono ou o admin da conta;
-- "Procurar trabalho" só para pessoa.
create or replace function public.salvar_meus_modos(p_modos text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  tipo_conta text;
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
  limpos := array(
    select m from unnest(array['trabalhar', 'servicos', 'contratar']) as m
    where m = any (coalesce(p_modos, '{}'))
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

revoke execute on function public.meus_modos() from public, anon;
grant execute on function public.meus_modos() to authenticated;
revoke execute on function public.salvar_meus_modos(text[]) from public, anon;
grant execute on function public.salvar_meus_modos(text[]) to authenticated;
