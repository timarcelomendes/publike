-- Avisos por tipo e o "parar de receber" de um toque no e-mail (25/10/2026). Pode rodar de novo.
--
-- Na página Avisos e notificações (/perfil/avisos), a conta escolhe, para cada grupo de avisos, se ele
-- chega no e-mail e no celular. O sino continua mostrando tudo. Os avisos da conta e da moderação
-- não entram em grupo nenhum: chegam sempre (como antes, o e-mail respeita o "Receber avisos por
-- e-mail" do perfil).
--   * privado.avisos_desligados: o que a conta desligou (grupo e canal). Sem linha: ligado.
--   * privado.chaves_de_aviso: uma chave por conta, para o link "parar de receber" do e-mail funcionar
--     sem entrar (o cabeçalho List-Unsubscribe, que o Gmail e o Yahoo pedem).
--   * privado.grupo_do_aviso: o grupo de cada tipo de aviso (o mesmo de src/lib/avisos.ts).
--   * enfileirar_email e notificacao_para_celular conferem o que a conta desligou; o e-mail leva a
--     chave e o grupo nos dados (o rodapé e o cabeçalho usam).
--   * meus_avisos_desligados, mudar_aviso e mudar_receber_emails: a página.
--   * sair_dos_avisos: o link do e-mail (sem conta, com a chave).

-- 1. O que a conta desligou -------------------------------------------------------------------------
create table if not exists privado.avisos_desligados (
  conta_id uuid not null references auth.users (id) on delete cascade,
  grupo text not null check (grupo in ('mensagens', 'andamento', 'conexoes', 'vagas_novas', 'semana', 'convites')),
  canal text not null check (canal in ('email', 'celular')),
  criado_em timestamptz not null default now(),
  primary key (conta_id, grupo, canal)
);
alter table privado.avisos_desligados enable row level security;
revoke all on privado.avisos_desligados from public, anon, authenticated;

-- 2. A chave do "parar de receber" ------------------------------------------------------------------
create table if not exists privado.chaves_de_aviso (
  conta_id uuid primary key references auth.users (id) on delete cascade,
  chave uuid not null unique default gen_random_uuid(),
  criada_em timestamptz not null default now()
);
alter table privado.chaves_de_aviso enable row level security;
revoke all on privado.chaves_de_aviso from public, anon, authenticated;

-- 3. O grupo de cada tipo de aviso (null: aviso da conta ou da moderação, que chega sempre) -------
create or replace function privado.grupo_do_aviso(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    else null
  end
$$;

-- A conta desligou este tipo de aviso neste canal ('email' ou 'celular')?
create or replace function privado.aviso_desligado(p_conta uuid, p_tipo text, p_canal text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from privado.avisos_desligados d
     where d.conta_id = p_conta and d.canal = p_canal and d.grupo = privado.grupo_do_aviso(p_tipo)
  )
$$;

-- A chave da conta para o "parar de receber" (cria na primeira vez)
create or replace function privado.chave_de_aviso(p_conta uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  select c.chave into v from privado.chaves_de_aviso c where c.conta_id = p_conta;
  if v is null then
    insert into privado.chaves_de_aviso (conta_id) values (p_conta) on conflict (conta_id) do nothing;
    select c.chave into v from privado.chaves_de_aviso c where c.conta_id = p_conta;
  end if;
  return v;
end
$$;

revoke execute on function privado.grupo_do_aviso(text), privado.aviso_desligado(uuid, text, text),
  privado.chave_de_aviso(uuid) from public, anon, authenticated;

-- 4. O e-mail confere o que a conta desligou e leva a chave (a de 20261017120000, mais os dois) ----
CREATE OR REPLACE FUNCTION privado.enfileirar_email(p_usuario uuid, p_modelo text, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg public.config_site;
  destino text;
  quer boolean;
  de_conta boolean := p_modelo in ('conta_suspensa', 'conta_banida', 'conta_reativada');
  v_grupo text := privado.grupo_do_aviso(p_modelo);
  v_sair jsonb := '{}'::jsonb;
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'curtida' and not cfg.email_curtida)
     or (p_modelo = 'match' and not cfg.email_match)
     or (p_modelo in ('em_analise', 'removido', 'liberado') and not cfg.email_moderacao)
     or (de_conta and not cfg.email_conta)
     or (p_modelo like 'boas\_vindas\_%' and not cfg.email_boas_vindas) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- o que a conta desligou na página Avisos e notificações (os avisos sem grupo chegam sempre)
  if v_grupo is not null and privado.aviso_desligado(p_usuario, p_modelo, 'email') then
    return;
  end if;
  -- avisos que podem se repetir: no máximo um do mesmo tipo a cada 30 minutos para a mesma pessoa
  if p_modelo in ('curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem', 'busca', 'convite') and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = p_modelo and f.criado_em > now() - interval '30 minutes'
  ) then
    return;
  end if;
  -- e no máximo 30 e-mails por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)
  if not de_conta and p_modelo not in ('em_analise', 'removido', 'liberado') and (
    select count(*) from privado.fila_emails f
     where f.usuario_id = p_usuario and f.criado_em > now() - interval '1 day'
  ) >= 30 then
    return;
  end if;
  -- só para o e-mail de login confirmado (nunca para um endereço que a pessoa só digitou)
  select nullif(btrim(u.email::text), '') into destino
    from auth.users u
   where u.id = p_usuario and u.email_confirmed_at is not null;
  if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  -- o "parar de receber" deste grupo (o rodapé e o cabeçalho List-Unsubscribe); sem a chave, o e-mail sai
  -- assim mesmo, com o rodapé de antes
  if v_grupo is not null then
    begin
      v_sair := jsonb_build_object('sair', privado.chave_de_aviso(p_usuario), 'grupo_aviso', v_grupo);
    exception
      when others then
        v_sair := '{}'::jsonb;
    end;
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb) || jsonb_strip_nulls(v_sair));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$function$;

-- 5. O celular confere o que a conta desligou (a de 20261112120000, mais a conferência) ------------
create or replace function privado.notificacao_para_celular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from privado.inscricoes_push i where i.conta_id = new.destinatario_id) then
    return new;
  end if;
  -- o que a conta desligou na página Avisos e notificações: fica só no sino
  if privado.aviso_desligado(new.destinatario_id, new.tipo, 'celular') then
    return new;
  end if;
  -- até 8 por hora por conta: o resto fica só no sino
  if (select count(*) from privado.fila_push f
       where f.conta_id = new.destinatario_id and f.criado_em > now() - interval '1 hour') >= 8 then
    return new;
  end if;
  insert into privado.fila_push (notificacao_id, conta_id, tipo, texto, anuncio_id, ator_id, recado_id)
  values (new.id, new.destinatario_id, new.tipo, left(new.texto, 300), new.anuncio_id, new.ator_id, new.recado_id);
  return new;
exception
  when others then
    raise warning 'Publike: notificação % não entrou na fila do celular (%).', new.id, sqlerrm;
    return new;
end
$$;

-- 6. A página Avisos e notificações ------------------------------------------------------------------
-- O que a conta pela qual a pessoa age desligou.
create or replace function public.meus_avisos_desligados()
returns table (grupo text, canal text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.grupo, d.canal from privado.avisos_desligados d where d.conta_id = (select public.conta_atual())
$$;

-- Liga ou desliga um grupo num canal. Só o dono ou o admin da conta.
create or replace function public.mudar_aviso(p_grupo text, p_canal text, p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  if coalesce(p_grupo, '') not in ('mensagens', 'andamento', 'conexoes', 'vagas_novas', 'semana', 'convites')
     or coalesce(p_canal, '') not in ('email', 'celular') then
    raise exception 'Aviso desconhecido.' using errcode = '22023';
  end if;
  if coalesce(p_ligado, true) then
    delete from privado.avisos_desligados d
     where d.conta_id = conta and d.grupo = p_grupo and d.canal = p_canal;
  else
    insert into privado.avisos_desligados (conta_id, grupo, canal) values (conta, p_grupo, p_canal)
    on conflict do nothing;
  end if;
end
$$;

-- O "Receber avisos por e-mail" do perfil (todos os e-mails, menos os da conta), pela página também.
create or replace function public.mudar_receber_emails(p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  update public.contatos set receber_emails = coalesce(p_ligado, true) where perfil_id = conta;
end
$$;

revoke execute on function public.meus_avisos_desligados(), public.mudar_aviso(text, text, boolean),
  public.mudar_receber_emails(boolean) from public, anon;
grant execute on function public.meus_avisos_desligados(), public.mudar_aviso(text, text, boolean),
  public.mudar_receber_emails(boolean) to authenticated;

-- 7. O link do e-mail: desliga o e-mail do grupo ('todos': os seis grupos), sem entrar, com a chave.
-- Devolve o grupo desligado ou null (chave ou grupo desconhecido).
create or replace function public.sair_dos_avisos(p_chave uuid, p_grupo text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid;
  grupos text[] := array['mensagens', 'andamento', 'conexoes', 'vagas_novas', 'semana', 'convites'];
begin
  select c.conta_id into conta from privado.chaves_de_aviso c where c.chave = p_chave;
  if conta is null then
    return null;
  end if;
  if coalesce(p_grupo, 'todos') = 'todos' then
    insert into privado.avisos_desligados (conta_id, grupo, canal)
    select conta, g, 'email' from unnest(grupos) as g
    on conflict do nothing;
    return 'todos';
  end if;
  if not (p_grupo = any (grupos)) then
    return null;
  end if;
  insert into privado.avisos_desligados (conta_id, grupo, canal) values (conta, p_grupo, 'email')
  on conflict do nothing;
  return p_grupo;
end
$$;

revoke execute on function public.sair_dos_avisos(uuid, text) from public;
grant execute on function public.sair_dos_avisos(uuid, text) to anon, authenticated, service_role;
