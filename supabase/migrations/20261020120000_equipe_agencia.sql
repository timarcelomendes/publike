-- Equipe da agência (20/10/2026). Pode rodar de novo sem problema.
--
-- Cada pessoa da equipe entra com o próprio celular e age pela agência: publica e edita vagas,
-- responde candidatos, move no quadro, marca entrevistas, conversa, cuida dos clientes. Papéis:
--   * administrador: tudo, inclusive convidar e tirar pessoas da equipe e mudar o perfil da agência;
--   * recrutador: tudo, menos a equipe e o perfil (nome, foto, contato) da agência.
-- A conta da agência continua sendo a dona. O que cada pessoa faz fica anotado com o nome dela
-- (atividades_equipe).
--
-- Como funciona: a pessoa escolhe por qual conta age (privado.conta_ativa). No login e a cada
-- renovação do token, o gancho do Auth (public.custom_access_token_hook) põe no token a conta e o
-- papel. No banco, public.conta_atual() devolve a conta da agência (conferindo, a cada chamada, que
-- a pessoa ainda é da equipe); fora da equipe, é a própria pessoa (auth.uid()). As regras que usavam
-- auth.uid() para "a minha conta" passam a usar conta_atual() (passo 7). O que é da pessoa (aceite
-- dos termos, origem, moderação, excluir a conta, a própria equipe) continua com auth.uid().
--
-- DEPOIS DE RODAR, ligue o gancho no Supabase (uma vez): Authentication > Hooks > Customize Access
-- Token (JWT) Claims > Postgres > schema public > função custom_access_token_hook > Create hook.
-- Sem o gancho, ninguém age pela agência: a equipe aparece, mas cada um fica na própria conta.
--
-- Rodou de novo uma migração antiga (que recria funções com auth.uid())? Rode esta de novo depois.
-- Migrações novas: use public.conta_atual() para "a minha conta" e auth.uid() só para a pessoa.

-- 1. A equipe, os convites, a conta escolhida e as atividades -----------------------------------

create table if not exists public.equipe_agencia (
  agencia_id uuid not null references public.perfis (id) on delete cascade,
  membro_id uuid not null references public.perfis (id) on delete cascade,
  papel text not null check (papel in ('admin', 'recrutador')),
  criado_em timestamptz not null default now(),
  convidado_por uuid references public.perfis (id) on delete set null,
  primary key (agencia_id, membro_id),
  check (agencia_id <> membro_id)
);
create index if not exists equipe_agencia_membro on public.equipe_agencia (membro_id);

create table if not exists public.convites_equipe (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  agencia_id uuid not null references public.perfis (id) on delete cascade,
  papel text not null check (papel in ('admin', 'recrutador')),
  -- quem vai entrar (só para a lista de quem convidou)
  nome text check (nome is null or char_length(nome) between 2 and 80),
  criado_por uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  cancelado_em timestamptz,
  aceito_por uuid references public.perfis (id) on delete set null,
  aceito_em timestamptz
);
create index if not exists convites_equipe_agencia on public.convites_equipe (agencia_id, criado_em desc);

-- por qual conta a pessoa está agindo (sem linha: a própria)
create table if not exists privado.conta_ativa (
  usuario_id uuid primary key references public.perfis (id) on delete cascade,
  agencia_id uuid not null references public.perfis (id) on delete cascade,
  escolhida_em timestamptz not null default now()
);

-- o texto guarda "{candidato}" no lugar do nome: o nome entra na hora de ler (a pessoa que apaga a
-- conta some do registro)
create table if not exists public.atividades_equipe (
  id bigint generated always as identity primary key,
  agencia_id uuid not null references public.perfis (id) on delete cascade,
  -- quem fez (a própria conta da agência ou alguém da equipe)
  membro_id uuid references public.perfis (id) on delete set null,
  anuncio_id uuid references public.anuncios (id) on delete set null,
  -- o candidato, quando tem
  perfil_id uuid references public.perfis (id) on delete set null,
  texto text not null check (char_length(texto) <= 300),
  criado_em timestamptz not null default now()
);
create index if not exists atividades_equipe_agencia on public.atividades_equipe (agencia_id, criado_em desc);

alter table public.equipe_agencia enable row level security;
alter table public.convites_equipe enable row level security;
alter table public.atividades_equipe enable row level security;
alter table privado.conta_ativa enable row level security;
revoke all on public.equipe_agencia, public.convites_equipe, public.atividades_equipe from anon, authenticated;
revoke all on privado.conta_ativa from anon, authenticated;
grant select on public.equipe_agencia, public.convites_equipe, public.atividades_equipe to authenticated;
grant select, insert, update, delete on public.equipe_agencia, public.convites_equipe, public.atividades_equipe
  to service_role;


-- 2. A conta atual e o papel ---------------------------------------------------------------------

-- A conta pela qual a pessoa age: a agência (se o token diz e ela ainda é da equipe) ou ela mesma.
create or replace function public.conta_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.agencia_id
       from public.equipe_agencia e
      where e.membro_id = (select auth.uid())
        and e.agencia_id::text = (select auth.jwt() ->> 'conta')),
    (select auth.uid()))
$$;

-- O papel de quem está logado na conta atual: dono (a própria conta), admin, recrutador (ou null).
create or replace function public.papel_na_conta()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when (select auth.uid()) is null then null
           when (select public.conta_atual()) = (select auth.uid()) then 'dono'
           else (select e.papel from public.equipe_agencia e
                  where e.agencia_id = (select public.conta_atual()) and e.membro_id = (select auth.uid()))
         end
$$;

revoke execute on function public.conta_atual(), public.papel_na_conta() from public;
grant execute on function public.conta_atual(), public.papel_na_conta() to anon, authenticated, service_role;

drop policy if exists "a equipe se vê" on public.equipe_agencia;
create policy "a equipe se vê" on public.equipe_agencia
  for select to authenticated
  using (agencia_id = (select public.conta_atual()) or membro_id = (select auth.uid()));

drop policy if exists "quem administra vê os convites" on public.convites_equipe;
create policy "quem administra vê os convites" on public.convites_equipe
  for select to authenticated
  using (agencia_id = (select public.conta_atual()) and (select public.papel_na_conta()) in ('dono', 'admin'));

drop policy if exists "a equipe vê as atividades" on public.atividades_equipe;
create policy "a equipe vê as atividades" on public.atividades_equipe
  for select to authenticated
  using (agencia_id = (select public.conta_atual()));


-- 3. Avisos e limites novos ----------------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe'));

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato', 'convite_equipe']));

-- O aviso da equipe também vai por e-mail (quem entrou ou saiu; para quem foi tirado).
create or replace function privado.notificacao_por_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
  v_entrevista jsonb;
begin
  select a.titulo, a.nota_moderacao, a.autor_id into v_titulo, v_nota, v_autor
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  if new.tipo = 'match_desfeito' then
    select public.rotulo_motivo_desfeito(d.motivo), d.futuro into v_motivo, v_futuro
      from public.matches_desfeitos d
     where d.anuncio_id = new.anuncio_id and d.desfeito_por = new.ator_id
     order by d.id desc limit 1;
    if v_futuro then
      v_depois := coalesce(v_quem, 'A outra pessoa') || ' disse que topa negociar com você em outro momento. '
                  || case when new.destinatario_id = v_autor
                          then 'Se quiser, dá para dar match de novo na lista de interessados.'
                          else 'Se ainda tiver interesse, dá para curtir o anúncio de novo.' end;
    end if;
  end if;
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta') then
    select jsonb_build_object(
             'id', e.id,
             'quando', e.quando,
             'duracao_min', e.duracao_min,
             'formato', e.formato,
             'local', e.local,
             'obs', e.obs,
             'situacao', e.situacao,
             'atualizado_em', e.atualizado_em,
             'anuncio_id', e.anuncio_id,
             'perfil_id', e.perfil_id,
             'vaga', a.titulo,
             'empresa', pa.nome,
             'candidato', pc.nome,
             'para', case when new.destinatario_id = a.autor_id then 'empresa' else 'candidato' end)
      into v_entrevista
      from public.entrevistas e
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pc on pc.id = e.perfil_id
     where e.anuncio_id = new.anuncio_id
       and e.perfil_id = case when new.destinatario_id = a.autor_id then new.ator_id else new.destinatario_id end
     order by e.atualizado_em desc
     limit 1;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
                 when 'match' then '/painel/matches'
                 when 'liberado' then '/anuncio/' || new.anuncio_id
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then '/painel/conversas/' || new.anuncio_id || '/' || new.ator_id
                 when 'seguindo' then '/anuncio/' || new.anuncio_id
                 when 'busca' then '/anuncio/' || new.anuncio_id
                 when 'convite' then '/anuncio/' || new.anuncio_id
                 when 'vaga_preenchida' then '/?tipo=vaga'
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 when 'entrevista' then '/anuncio/' || new.anuncio_id
                 when 'entrevista_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 when 'finalistas' then '/painel/anuncio/' || new.anuncio_id || '/finalistas'
                 when 'convite_candidato' then '/painel/anuncio/' || new.anuncio_id || '/convidar'
                 when 'equipe' then '/painel/equipe'
                 else '/painel'
               end)
    || case when v_entrevista is null then '{}'::jsonb else jsonb_build_object('entrevista', v_entrevista) end);
  return null;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('equipe', 'usuarios', 26, 'Equipe da agência',
     'Quando alguém entra ou sai da equipe da agência (vai para a agência) e quando a agência tira alguém (vai para a pessoa).',
     array['nome', 'motivo', 'link'],
     'Novidade na equipe',
     'Oi, {{nome}}.

{{motivo}}

Veja a equipe no Publike.',
     'Ver a equipe')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;


-- 4. O gancho do Auth: a conta e o papel no token ------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_conta uuid;
  v_papel text;
begin
  select e.agencia_id, e.papel into v_conta, v_papel
    from privado.conta_ativa c
    join public.equipe_agencia e on e.agencia_id = c.agencia_id and e.membro_id = c.usuario_id
   where c.usuario_id = (event ->> 'user_id')::uuid;
  v_claims := v_claims - 'conta' - 'papel';
  if v_conta is not null then
    v_claims := v_claims || jsonb_build_object('conta', v_conta, 'papel', v_papel);
  end if;
  return jsonb_set(event, '{claims}', v_claims);
exception
  when others then
    -- nunca trava o login: sem a conta da equipe, a pessoa entra na própria
    return event;
end
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
  end if;
end
$$;


-- 5. A equipe: convidar, entrar, trocar de conta, mudar o papel, tirar e sair --------------------

create or replace function privado.exigir_quem_administra()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta uuid := public.conta_atual();
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if public.papel_na_conta() not in ('dono', 'admin') then
    raise exception 'Só quem administra a agência cuida da equipe.' using errcode = '42501', hint = 'papel';
  end if;
  if not exists (select 1 from public.perfis p where p.id = v_conta and p.tipo = 'agencia') then
    raise exception 'A equipe é para agência de emprego e RH.' using errcode = 'P0001', hint = 'tipo';
  end if;
  return v_conta;
end
$$;

create or replace function public.criar_convite_equipe(p_papel text, p_nome text default null)
returns table (id uuid, token text, expira_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
begin
  v_conta := privado.exigir_quem_administra();
  perform privado.exigir_conta_ativa();
  if coalesce(p_papel, '') not in ('admin', 'recrutador') then
    raise exception 'Escolha o papel: administrador ou recrutador.' using errcode = '22023', hint = 'papel';
  end if;
  if v_nome is not null and (char_length(v_nome) not between 2 and 80 or public.tem_contato(v_nome)) then
    raise exception 'Escreva só o nome da pessoa (de 2 a 80 letras).' using errcode = '22023', hint = 'nome';
  end if;
  if (select count(*) from public.equipe_agencia e where e.agencia_id = v_conta)
     + (select count(*) from public.convites_equipe k
         where k.agencia_id = v_conta and k.aceito_em is null and k.cancelado_em is null and k.expira_em > now())
     >= 30 then
    raise exception 'A equipe pode ter até 30 pessoas (contando os convites esperando resposta).'
      using errcode = 'P0001', hint = 'limite_equipe';
  end if;
  perform privado.conferir_limite('convite_equipe', 30, 'Você criou muitos convites hoje. Tente de novo amanhã.');
  return query
    insert into public.convites_equipe as k (token, agencia_id, papel, nome, criado_por)
    values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            v_conta, p_papel, v_nome, (select auth.uid()))
    returning k.id, k.token, k.expira_em;
end
$$;

create or replace function public.cancelar_convite_equipe(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := privado.exigir_quem_administra();
begin
  update public.convites_equipe k
     set cancelado_em = coalesce(k.cancelado_em, now())
   where k.id = p_id and k.agencia_id = v_conta and k.aceito_em is null;
end
$$;

-- O que a página do convite mostra (sem conta também).
create or replace function public.convite_equipe_do_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.convites_equipe;
  eu uuid := (select auth.uid());
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into k from public.convites_equipe x where x.token = p_token;
  if not found then
    return null;
  end if;
  return (
    select jsonb_build_object(
             'situacao', case
                           when k.aceito_em is not null then 'aceito'
                           when k.cancelado_em is not null then 'cancelado'
                           when k.expira_em <= now() then 'vencido'
                           else 'valido'
                         end,
             'papel', k.papel,
             'nome', k.nome,
             'expira_em', k.expira_em,
             'agencia', jsonb_build_object('id', a.id, 'nome', a.nome, 'foto', a.foto, 'verificado', a.verificado),
             'sou_a_agencia', eu is not null and eu = k.agencia_id,
             'aceitei', eu is not null and eu = k.aceito_por,
             'ja_sou_da_equipe', eu is not null and exists (
               select 1 from public.equipe_agencia e where e.agencia_id = k.agencia_id and e.membro_id = eu))
      from public.perfis a
     where a.id = k.agencia_id
  );
end
$$;

-- Entrar na equipe: a pessoa (com o próprio login) passa a agir pela agência.
create or replace function public.aceitar_convite_equipe(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  k public.convites_equipe;
  v_nome text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if exists (select 1 from public.suspensoes s
              where s.usuario_id = eu and s.encerrada_em is null and s.fim > now()) then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Este convite não existe. Confira o link.' using errcode = 'P0001', hint = 'convite';
  end if;
  select * into k from public.convites_equipe x where x.token = p_token for update;
  if not found then
    raise exception 'Este convite não existe. Confira o link.' using errcode = 'P0001', hint = 'convite';
  end if;
  if k.agencia_id = eu then
    raise exception 'Este convite é para outra pessoa entrar na sua equipe: mande o link para ela.'
      using errcode = 'P0001', hint = 'convite';
  end if;
  if exists (select 1 from public.equipe_agencia e where e.agencia_id = k.agencia_id and e.membro_id = eu) then
    insert into privado.conta_ativa (usuario_id, agencia_id) values (eu, k.agencia_id)
    on conflict (usuario_id) do update set agencia_id = excluded.agencia_id, escolhida_em = now();
    return k.agencia_id;
  end if;
  if k.aceito_em is not null then
    raise exception 'Este convite já foi usado. Peça outro para a agência.' using errcode = 'P0001', hint = 'convite';
  end if;
  if k.cancelado_em is not null then
    raise exception 'Este convite foi cancelado.' using errcode = 'P0001', hint = 'convite';
  end if;
  if k.expira_em <= now() then
    raise exception 'Este convite venceu. Peça outro para a agência.' using errcode = 'P0001', hint = 'convite';
  end if;
  select p.nome into v_nome from public.perfis p where p.id = eu;
  if v_nome is null then
    raise exception 'Complete seu cadastro antes de entrar na equipe.' using errcode = 'P0001', hint = 'perfil';
  end if;
  insert into public.equipe_agencia (agencia_id, membro_id, papel, convidado_por)
  values (k.agencia_id, eu, k.papel, k.criado_por);
  update public.convites_equipe x set aceito_por = eu, aceito_em = now() where x.id = k.id;
  insert into privado.conta_ativa (usuario_id, agencia_id) values (eu, k.agencia_id)
  on conflict (usuario_id) do update set agencia_id = excluded.agencia_id, escolhida_em = now();
  insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
  values (k.agencia_id, 'equipe', eu,
          left(v_nome || ' entrou na equipe como ' || case k.papel when 'admin' then 'administrador.' else 'recrutador.' end, 300));
  return k.agencia_id;
end
$$;

-- Trocar de conta: a agência (sendo da equipe) ou a própria (null). O token novo traz a conta.
create or replace function public.escolher_conta(p_conta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_conta is null or p_conta = eu then
    delete from privado.conta_ativa c where c.usuario_id = eu;
    return;
  end if;
  if not exists (select 1 from public.equipe_agencia e where e.agencia_id = p_conta and e.membro_id = eu) then
    raise exception 'Você não é da equipe desta conta.' using errcode = '42501', hint = 'equipe';
  end if;
  insert into privado.conta_ativa (usuario_id, agencia_id) values (eu, p_conta)
  on conflict (usuario_id) do update set agencia_id = excluded.agencia_id, escolhida_em = now();
end
$$;

create or replace function public.mudar_papel_equipe(p_membro uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := privado.exigir_quem_administra();
begin
  if coalesce(p_papel, '') not in ('admin', 'recrutador') then
    raise exception 'Escolha o papel: administrador ou recrutador.' using errcode = '22023', hint = 'papel';
  end if;
  update public.equipe_agencia e set papel = p_papel where e.agencia_id = v_conta and e.membro_id = p_membro;
  if not found then
    raise exception 'Essa pessoa não é da equipe.' using errcode = 'P0001', hint = 'membro';
  end if;
end
$$;

create or replace function public.tirar_da_equipe(p_membro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := privado.exigir_quem_administra();
  v_agencia text;
begin
  delete from public.equipe_agencia e where e.agencia_id = v_conta and e.membro_id = p_membro;
  if not found then
    raise exception 'Essa pessoa não é da equipe.' using errcode = 'P0001', hint = 'membro';
  end if;
  delete from privado.conta_ativa c where c.usuario_id = p_membro and c.agencia_id = v_conta;
  select p.nome into v_agencia from public.perfis p where p.id = v_conta;
  insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
  values (p_membro, 'equipe', v_conta, left('Você não faz mais parte da equipe de ' || coalesce(v_agencia, 'uma agência') || '.', 300));
end
$$;

create or replace function public.sair_da_equipe(p_agencia uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_nome text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  delete from public.equipe_agencia e where e.agencia_id = p_agencia and e.membro_id = eu;
  if not found then
    return;
  end if;
  delete from privado.conta_ativa c where c.usuario_id = eu and c.agencia_id = p_agencia;
  select p.nome into v_nome from public.perfis p where p.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
  values (p_agencia, 'equipe', eu, left(coalesce(v_nome, 'Uma pessoa') || ' saiu da equipe.', 300));
end
$$;

-- As contas pelas quais a pessoa pode agir: a dela e as das equipes de que faz parte.
create or replace function public.minhas_contas()
returns table (conta_id uuid, nome text, foto text, tipo text, papel text, atual boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.foto, p.tipo, 'dono'::text, (select public.conta_atual()) = p.id
    from public.perfis p
   where p.id = (select auth.uid())
  union all
  select a.id, a.nome, a.foto, a.tipo, e.papel, (select public.conta_atual()) = a.id
    from public.equipe_agencia e
    join public.perfis a on a.id = e.agencia_id
   where e.membro_id = (select auth.uid())
$$;

-- A equipe da conta atual (quem é da equipe vê; quem administra também vê os convites, pela tabela).
create or replace function public.equipe_da_conta()
returns table (membro_id uuid, nome text, foto text, papel text, desde timestamptz,
               ultima_atividade timestamptz, sou_eu boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.membro_id, p.nome, p.foto, e.papel, e.criado_em,
         (select max(a.criado_em) from public.atividades_equipe a
           where a.agencia_id = e.agencia_id and a.membro_id = e.membro_id),
         e.membro_id = (select auth.uid())
    from public.equipe_agencia e
    join public.perfis p on p.id = e.membro_id
   where e.agencia_id = (select public.conta_atual())
     and (select public.papel_na_conta()) is not null
   order by e.criado_em
$$;

create or replace function public.atividades_da_equipe(p_limite integer default 60)
returns table (id bigint, criado_em timestamptz, membro_id uuid, quem text, texto text,
               anuncio_id uuid, perfil_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.criado_em, a.membro_id,
         case when a.membro_id = a.agencia_id then 'Conta da agência' else coalesce(m.nome, 'Ex-integrante') end,
         replace(a.texto, '{candidato}', coalesce(c.nome, 'um candidato')), a.anuncio_id, a.perfil_id
    from public.atividades_equipe a
    left join public.perfis m on m.id = a.membro_id
    left join public.perfis c on c.id = a.perfil_id
   where a.agencia_id = (select public.conta_atual())
   order by a.criado_em desc, a.id desc
   limit least(greatest(coalesce(p_limite, 60), 1), 200)
$$;

revoke execute on function privado.exigir_quem_administra() from public;
revoke execute on function public.criar_convite_equipe(text, text), public.cancelar_convite_equipe(uuid),
                          public.aceitar_convite_equipe(text), public.escolher_conta(uuid),
                          public.mudar_papel_equipe(uuid, text), public.tirar_da_equipe(uuid),
                          public.sair_da_equipe(uuid), public.minhas_contas(), public.equipe_da_conta(),
                          public.atividades_da_equipe(integer) from public, anon;
grant execute on function public.criar_convite_equipe(text, text), public.cancelar_convite_equipe(uuid),
                          public.aceitar_convite_equipe(text), public.escolher_conta(uuid),
                          public.mudar_papel_equipe(uuid, text), public.tirar_da_equipe(uuid),
                          public.sair_da_equipe(uuid), public.minhas_contas(), public.equipe_da_conta(),
                          public.atividades_da_equipe(integer) to authenticated;
revoke execute on function public.convite_equipe_do_token(text) from public;
grant execute on function public.convite_equipe_do_token(text) to anon, authenticated;


-- 6. O que cada um fez (só nas contas com equipe) ------------------------------------------------

create or replace function privado.anotar_atividade(p_agencia uuid, p_texto text, p_anuncio uuid default null,
                                                    p_perfil uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
begin
  if eu is null or p_agencia is null or p_texto is null then
    return;
  end if;
  if not exists (select 1 from public.equipe_agencia e where e.agencia_id = p_agencia) then
    return;
  end if;
  if eu <> p_agencia and not exists (
    select 1 from public.equipe_agencia e where e.agencia_id = p_agencia and e.membro_id = eu) then
    return;
  end if;
  insert into public.atividades_equipe (agencia_id, membro_id, anuncio_id, perfil_id, texto)
  values (p_agencia, eu, p_anuncio, p_perfil, left(p_texto, 300));
exception
  when others then
    raise warning 'Publike: atividade da equipe não anotada (%).', sqlerrm;
end
$$;
revoke execute on function privado.anotar_atividade(uuid, text, uuid, uuid) from public;


create or replace function privado.equipe_anota_vaga()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo <> 'vaga' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform privado.anotar_atividade(new.autor_id, 'publicou a vaga “' || new.titulo || '”', new.id);
  elsif new.status is distinct from old.status and new.status in ('encerrado', 'pausado', 'ativo') then
    perform privado.anotar_atividade(new.autor_id,
      case new.status when 'encerrado' then 'encerrou' when 'pausado' then 'pausou' else 'pôs no ar de novo' end
      || ' a vaga “' || new.titulo || '”', new.id);
  end if;
  return null;
end
$$;
drop trigger if exists anuncios_equipe_anota on public.anuncios;
create trigger anuncios_equipe_anota
  after insert or update of status on public.anuncios
  for each row execute function privado.equipe_anota_vaga();

create or replace function privado.equipe_anota_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_titulo text;
  v_nome text := '{candidato}';
  v_texto text;
begin
  select a.autor_id, a.titulo into v_autor, v_titulo
    from public.anuncios a where a.id = new.anuncio_id and a.tipo = 'vaga';
  if v_autor is null then
    return null;
  end if;
  if new.status is distinct from old.status then
    v_texto := case new.status
                 when 'match' then 'deu match com ' || v_nome
                 when 'dispensada' then 'dispensou ' || v_nome
                 when 'desfeito' then 'desfez o match com ' || v_nome
               end;
  elsif new.aceita_em is not null and old.aceita_em is null and new.status = 'pendente' then
    v_texto := 'aceitou ' || v_nome || ' (falta o currículo)';
  end if;
  if v_texto is not null then
    perform privado.anotar_atividade(v_autor, v_texto || ' em “' || v_titulo || '”', new.anuncio_id, new.perfil_id);
  end if;
  return null;
end
$$;
drop trigger if exists curtidas_equipe_anota on public.curtidas;
create trigger curtidas_equipe_anota
  after update of status, aceita_em on public.curtidas
  for each row execute function privado.equipe_anota_curtida();

create or replace function privado.equipe_anota_etapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_titulo text;
begin
  if tg_op = 'UPDATE' and new.etapa is not distinct from old.etapa then
    return null;
  end if;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = new.anuncio_id;
  perform privado.anotar_atividade(v_autor,
    'moveu {candidato} para '
    || case new.etapa when 'novo' then 'Novos' when 'analise' then 'Em análise' when 'entrevista' then 'Entrevista'
                      when 'contratado' then 'Contratados' when 'nao_seguiu' then 'Não seguiu' else new.etapa end
    || ' em “' || v_titulo || '”', new.anuncio_id, new.perfil_id);
  return null;
end
$$;
drop trigger if exists etapas_equipe_anota on public.etapas_candidatos;
create trigger etapas_equipe_anota
  after insert or update of etapa on public.etapas_candidatos
  for each row execute function privado.equipe_anota_etapa();

create or replace function privado.equipe_anota_entrevista()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_nome text := '{candidato}';
  v_texto text;
begin
  select a.autor_id into v_autor from public.anuncios a where a.id = new.anuncio_id;
  if tg_op = 'INSERT' then
    v_texto := 'marcou entrevista com ' || v_nome;
  elsif new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada' then
    v_texto := 'cancelou a entrevista com ' || v_nome;
  elsif new.quando is distinct from old.quando then
    v_texto := 'remarcou a entrevista com ' || v_nome;
  end if;
  if v_texto is not null then
    perform privado.anotar_atividade(v_autor, v_texto, new.anuncio_id, new.perfil_id);
  end if;
  return null;
end
$$;
drop trigger if exists entrevistas_equipe_anota on public.entrevistas;
create trigger entrevistas_equipe_anota
  after insert or update of quando, situacao on public.entrevistas
  for each row execute function privado.equipe_anota_entrevista();

-- conversa: uma anotação por conversa a cada 30 minutos (não uma por mensagem)
create or replace function privado.equipe_anota_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_titulo text;
begin
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = new.anuncio_id;
  if v_autor is null or new.autor_id is distinct from v_autor then
    return null;
  end if;
  if exists (select 1 from public.atividades_equipe x
              where x.agencia_id = v_autor and x.anuncio_id = new.anuncio_id and x.perfil_id = new.perfil_id
                and x.membro_id = (select auth.uid()) and x.texto like 'conversou com %'
                and x.criado_em > now() - interval '30 minutes') then
    return null;
  end if;
  perform privado.anotar_atividade(v_autor,
    'conversou com {candidato} sobre “' || v_titulo || '”',
    new.anuncio_id, new.perfil_id);
  return null;
end
$$;
drop trigger if exists mensagens_equipe_anota on public.mensagens;
create trigger mensagens_equipe_anota
  after insert on public.mensagens
  for each row execute function privado.equipe_anota_mensagem();

create or replace function privado.equipe_anota_outros()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_titulo text;
begin
  if tg_table_name = 'clientes_agencia' then
    perform privado.anotar_atividade(new.agencia_id, 'cadastrou o cliente ' || new.nome);
    return null;
  end if;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = new.anuncio_id;
  if tg_table_name = 'finalistas' then
    perform privado.anotar_atividade(v_autor,
      'mandou {candidato} para o cliente (“' || v_titulo || '”)',
      new.anuncio_id, new.perfil_id);
  elsif tg_table_name = 'colocacoes' then
    if tg_op = 'INSERT' then
      perform privado.anotar_atividade(v_autor,
        'registrou a colocação de {candidato}', new.anuncio_id, new.perfil_id);
    elsif new.saiu_em is not null and old.saiu_em is null then
      perform privado.anotar_atividade(v_autor,
        'marcou a saída de {candidato}', new.anuncio_id, new.perfil_id);
    end if;
  elsif tg_table_name = 'convites_candidato' then
    perform privado.anotar_atividade(v_autor, 'chamou ' || new.nome || ' de fora para “' || v_titulo || '”',
                                     new.anuncio_id);
  end if;
  return null;
end
$$;
drop trigger if exists clientes_equipe_anota on public.clientes_agencia;
create trigger clientes_equipe_anota
  after insert on public.clientes_agencia
  for each row execute function privado.equipe_anota_outros();
drop trigger if exists finalistas_equipe_anota on public.finalistas;
create trigger finalistas_equipe_anota
  after insert on public.finalistas
  for each row execute function privado.equipe_anota_outros();
drop trigger if exists colocacoes_equipe_anota on public.colocacoes;
create trigger colocacoes_equipe_anota
  after insert or update of saiu_em on public.colocacoes
  for each row execute function privado.equipe_anota_outros();
drop trigger if exists convites_candidato_equipe_anota on public.convites_candidato;
create trigger convites_candidato_equipe_anota
  after insert on public.convites_candidato
  for each row execute function privado.equipe_anota_outros();


-- 7. "A minha conta" passa a ser a conta atual ---------------------------------------------------
-- Troca auth.uid() por public.conta_atual() nas funções, nas regras de acesso (RLS) e nos valores
-- padrão das colunas, menos no que é da pessoa (a lista abaixo e as funções do admin).

do $$
declare
  fn record;
  pol record;
  col record;
  da_pessoa text[] := array[
    -- a equipe e o token
    'public.conta_atual', 'public.papel_na_conta', 'public.custom_access_token_hook',
    'privado.exigir_quem_administra', 'public.criar_convite_equipe', 'public.cancelar_convite_equipe',
    'public.convite_equipe_do_token', 'public.aceitar_convite_equipe', 'public.escolher_conta',
    'public.mudar_papel_equipe', 'public.tirar_da_equipe', 'public.sair_da_equipe', 'public.minhas_contas',
    'public.equipe_da_conta', 'public.atividades_da_equipe', 'privado.anotar_atividade',
    'privado.equipe_anota_vaga', 'privado.equipe_anota_curtida', 'privado.equipe_anota_etapa',
    'privado.equipe_anota_entrevista', 'privado.equipe_anota_mensagem', 'privado.equipe_anota_outros',
    -- a moderação e o registro da equipe do Publike
    'privado.registrar', 'privado.anuncio_editado_pela_equipe', 'privado.anuncio_para_revisao_ia',
    'public.eh_moderador', 'public.moderar_anuncio', 'public.moderar_avaliacao',
    -- a própria pessoa
    'public.excluir_minha_conta', 'public.minha_conta_suspensa', 'public.registrar_aceite',
    'public.aceite_pendente', 'public.registrar_origem', 'public.salvar_intencao', 'public.minha_intencao',
    'public.enviar_sugestao', 'public.contar_acesso'];
  v_caminho text := current_setting('search_path');
begin
  -- sem search_path, as definições saem com o schema de tudo (e voltam iguais)
  perform set_config('search_path', '', true);
  for fn in
    select pr.oid, ns.nspname || '.' || pr.proname as nome
      from pg_catalog.pg_proc pr
      join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
     where ns.nspname in ('public', 'privado') and pr.prokind = 'f' and pr.prosrc like '%auth.uid()%'
  loop
    continue when fn.nome = any (da_pessoa) or fn.nome like 'public.admin\_%';
    execute replace(pg_catalog.pg_get_functiondef(fn.oid), 'auth.uid()', 'public.conta_atual()');
  end loop;

  for pol in
    select * from pg_catalog.pg_policies pp
     where (pp.qual like '%auth.uid()%' or pp.with_check like '%auth.uid()%')
       and not (pp.schemaname = 'public' and pp.tablename in ('equipe_agencia', 'convites_equipe', 'atividades_equipe'))
  loop
    execute format('alter policy %I on %I.%I%s%s', pol.policyname, pol.schemaname, pol.tablename,
                   case when pol.qual is not null
                        then ' using (' || replace(pol.qual, 'auth.uid()', 'public.conta_atual()') || ')' else '' end,
                   case when pol.with_check is not null
                        then ' with check (' || replace(pol.with_check, 'auth.uid()', 'public.conta_atual()') || ')'
                        else '' end);
  end loop;

  for col in
    select ic.table_schema, ic.table_name, ic.column_name
      from information_schema.columns ic
     where ic.table_schema = 'public' and ic.column_default like '%auth.uid()%'
  loop
    execute format('alter table %I.%I alter column %I set default public.conta_atual()',
                   col.table_schema, col.table_name, col.column_name);
  end loop;
  perform set_config('search_path', v_caminho, true);
end
$$;

-- Suspensa: a pessoa ou a conta pela qual ela age.
create or replace function public.minha_conta_suspensa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.suspensoes s
     where s.usuario_id in ((select auth.uid()), (select public.conta_atual()))
       and s.encerrada_em is null and s.fim > now()
  )
$$;

-- Excluir a conta é só da própria pessoa, na própria conta.
create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para excluí-la.' using errcode = '42501';
  end if;
  if public.conta_atual() is distinct from usuario then
    raise exception 'Você está agindo pela equipe de uma agência. Troque para a sua conta para excluí-la.'
      using errcode = 'P0001', hint = 'equipe';
  end if;
  perform privado.exigir_conta_ativa();
  delete from auth.users where id = usuario;
end
$$;

-- O perfil e o contato da agência: só a própria conta e quem administra mudam.
alter policy "cada um edita o próprio perfil" on public.perfis
  using (id = (select public.conta_atual()) and (select public.papel_na_conta()) in ('dono', 'admin'))
  with check (id = (select public.conta_atual()) and (select public.papel_na_conta()) in ('dono', 'admin'));
alter policy "cada um cria o próprio contato" on public.contatos
  with check (perfil_id = (select public.conta_atual()) and (select public.papel_na_conta()) in ('dono', 'admin'));
alter policy "cada um edita o próprio contato" on public.contatos
  using (perfil_id = (select public.conta_atual()) and (select public.papel_na_conta()) in ('dono', 'admin'))
  with check (perfil_id = (select public.conta_atual()) and (select public.papel_na_conta()) in ('dono', 'admin'));


-- 8. Limpeza: as atividades ficam 180 dias -------------------------------------------------------

create or replace function privado.limpar_atividades_equipe()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.atividades_equipe a where a.criado_em < now() - interval '180 days';
  delete from public.convites_equipe k
   where k.aceito_em is null and k.expira_em < now() - interval '30 days';
$$;
revoke execute on function privado.limpar_atividades_equipe() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('publike-limpar-atividades-equipe', '45 6 * * *',
                          'select privado.limpar_atividades_equipe()');
  end if;
exception
  when others then
    raise notice 'pg_cron indisponível (%). A limpeza das atividades fica para quando ativar.', sqlerrm;
end
$$;

notify pgrst, 'reload schema';
