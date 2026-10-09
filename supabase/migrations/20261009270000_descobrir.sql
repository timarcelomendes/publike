-- =====================================================================
-- Descobrir: vagas para deslizar, "Para você", "No seu bairro", "Em alta" e "Salvas"
--
--   * salvas: vagas que a pessoa guardou para ver depois (só ela vê).
--   * dispensas: vagas que a pessoa passou (deslizou para a esquerda). Somem
--     do "Para você" por 30 dias.
--   * preferencias: "O que você procura?", em texto livre (só ela vê), usado
--     para ordenar as vagas.
--   * vagas_para_descobrir(): vagas no ar com o número de curtidas e de
--     salvas dos últimos 7 dias (sem dizer quem) e as marcas de quem pergunta.
--
-- Rode depois de 20261009260000_cnpj_empresas.sql.
-- =====================================================================

create table public.salvas (
  perfil_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, anuncio_id)
);
create index salvas_anuncio on public.salvas (anuncio_id, criado_em);

create table public.dispensas (
  perfil_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, anuncio_id)
);

create table public.preferencias (
  perfil_id uuid primary key default auth.uid() references public.perfis (id) on delete cascade,
  procuro text check (char_length(procuro) <= 300),
  atualizado_em timestamptz not null default now()
);

alter table public.salvas enable row level security;
alter table public.dispensas enable row level security;
alter table public.preferencias enable row level security;

create policy "cada um vê as próprias salvas" on public.salvas
  for select to authenticated using (perfil_id = (select auth.uid()));
create policy "cada um salva para si" on public.salvas
  for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "cada um tira as próprias salvas" on public.salvas
  for delete to authenticated using (perfil_id = (select auth.uid()));

create policy "cada um vê as próprias dispensas" on public.dispensas
  for select to authenticated using (perfil_id = (select auth.uid()));
create policy "cada um dispensa para si" on public.dispensas
  for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "cada um desfaz as próprias dispensas" on public.dispensas
  for delete to authenticated using (perfil_id = (select auth.uid()));

create policy "cada um vê as próprias preferências" on public.preferencias
  for select to authenticated using (perfil_id = (select auth.uid()));
create policy "cada um cria as próprias preferências" on public.preferencias
  for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "cada um muda as próprias preferências" on public.preferencias
  for update to authenticated using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));

revoke all on public.salvas, public.dispensas, public.preferencias from anon, authenticated;
grant select, delete on public.salvas, public.dispensas to authenticated;
grant insert (anuncio_id) on public.salvas, public.dispensas to authenticated;
grant select on public.preferencias to authenticated;
grant insert (procuro), update (procuro) on public.preferencias to authenticated;

create or replace function public.preferencias_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.procuro := nullif(btrim(regexp_replace(coalesce(new.procuro, ''), '\s+', ' ', 'g')), '');
  new.atualizado_em := now();
  return new;
end
$$;

create trigger preferencias_antes_de_salvar
  before insert or update on public.preferencias
  for each row execute function public.preferencias_antes_de_salvar();

-- Vagas no ar para o Descobrir. Só dados públicos do anúncio, os números da
-- semana (sem dizer quem curtiu ou salvou) e as marcas de quem pergunta.
create or replace function public.vagas_para_descobrir(p_limite integer default 300)
returns table (
  id uuid,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_verificado boolean,
  contratante text,
  contratante_confidencial boolean,
  pede_curriculo boolean,
  curtidas_7d integer,
  salvas_7d integer,
  minha_curtida text,
  salva boolean,
  dispensada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, left(a.descricao, 600), a.categoria, a.regime, a.pagamento_valor, a.pagamento_unidade,
         a.beneficios, a.horario, a.vagas, a.cidade, a.bairro,
         round(extensions.st_y(a.local::extensions.geometry)::numeric, 5)::double precision,
         round(extensions.st_x(a.local::extensions.geometry)::numeric, 5)::double precision,
         a.criado_em, a.autor_id,
         case when p.tipo = 'pessoa' then split_part(p.nome, ' ', 1) else p.nome end,
         p.tipo, p.verificado, a.contratante, a.contratante_confidencial, a.pede_curriculo,
         (select count(*) from public.curtidas c where c.anuncio_id = a.id and c.criado_em > now() - interval '7 days')::integer,
         (select count(*) from public.salvas s where s.anuncio_id = a.id and s.criado_em > now() - interval '7 days')::integer,
         (select c.status from public.curtidas c where c.anuncio_id = a.id and c.perfil_id = (select auth.uid())),
         exists (select 1 from public.salvas s where s.anuncio_id = a.id and s.perfil_id = (select auth.uid())),
         exists (select 1 from public.dispensas d where d.anuncio_id = a.id and d.perfil_id = (select auth.uid())
                    and d.criado_em > now() - interval '30 days')
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.tipo = 'vaga'
     and a.status = 'ativo'
     and a.expira_em > now()
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and a.autor_id is distinct from (select auth.uid())
     and ((select auth.uid()) is null or not privado.ha_bloqueio((select auth.uid()), a.autor_id))
   order by a.criado_em desc
   limit least(greatest(coalesce(p_limite, 300), 1), 500)
$$;

-- Salvar só vaga no ar e que não é sua
create or replace function public.salvas_antes_de_salvar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.anuncios a
                  where a.id = new.anuncio_id and a.status = 'ativo' and a.autor_id <> new.perfil_id) then
    raise exception 'Esta vaga não está mais no ar.' using errcode = 'P0001', hint = 'fora_do_ar';
  end if;
  new.criado_em := now();
  return new;
end
$$;

create trigger salvas_antes_de_salvar
  before insert on public.salvas
  for each row execute function public.salvas_antes_de_salvar();

-- Indicações da IA ("Para você"): no máximo 12 por dia por pessoa. O site guarda
-- a resposta por algumas horas, então quase sempre é uma ou duas por dia.
alter table privado.limites_uso drop constraint limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao'));

create or replace function public.usar_ia_indicacoes()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not coalesce((select c.ia_melhorar_texto from public.config_site c limit 1), false) then
    return false;
  end if;
  perform privado.exigir_conta_ativa();
  perform privado.conferir_limite('ia_indicacao', 12, 'Limite de indicações da IA por hoje.');
  return true;
end
$$;

revoke execute on function public.usar_ia_indicacoes() from public, anon;
grant execute on function public.usar_ia_indicacoes() to authenticated;

revoke execute on function public.salvas_antes_de_salvar(), public.preferencias_antes_de_salvar() from public;
revoke execute on function public.vagas_para_descobrir(integer) from public;
grant execute on function public.vagas_para_descobrir(integer) to anon, authenticated;

notify pgrst, 'reload schema';
