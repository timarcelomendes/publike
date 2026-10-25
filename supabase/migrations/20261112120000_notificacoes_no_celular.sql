-- Notificações no celular (12/11/2026): os avisos do sino também chegam como notificação (Web Push),
-- mesmo com o Publike fechado, para quem tocou em "Ativar notificações" naquele aparelho. Vale para o
-- site instalado (Android e iPhone) e para o app da Play. Pode rodar de novo.
--   * privado.inscricoes_push: um aparelho por linha (o endereço de entrega e as chaves públicas dele).
--   * salvar_inscricao_push / remover_inscricao_push: a conta liga e desliga naquele aparelho.
--   * privado.fila_push: o gatilho do sino põe na fila (só os tipos que pedem atenção, até 8 por hora
--     por conta); o servidor do site esvazia (servidor_pegar_push / servidor_marcar_push /
--     servidor_inscricao_expirada), junto com os e-mails.

create table if not exists privado.inscricoes_push (
  id bigint generated always as identity primary key,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  pessoa_id uuid references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 80 and 100),
  auth text not null check (char_length(auth) between 16 and 40),
  navegador text check (navegador is null or char_length(navegador) <= 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviada_em timestamptz
);
create index if not exists inscricoes_push_conta_idx on privado.inscricoes_push (conta_id);
alter table privado.inscricoes_push enable row level security;
revoke all on privado.inscricoes_push from public, anon, authenticated;

create table if not exists privado.fila_push (
  id bigint generated always as identity primary key,
  notificacao_id bigint references public.notificacoes (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null,
  texto text not null,
  anuncio_id uuid,
  ator_id uuid,
  recado_id uuid,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou')),
  tentativas integer not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  tentar_depois timestamptz not null default now()
);
create index if not exists fila_push_pendentes_idx on privado.fila_push (tentar_depois) where status in ('pendente', 'enviando');
create index if not exists fila_push_conta_idx on privado.fila_push (conta_id, criado_em desc);
alter table privado.fila_push enable row level security;
revoke all on privado.fila_push from public, anon, authenticated;

-- A conta liga a notificação neste aparelho (o mesmo endereço passa para a conta que entrou por último).
create or replace function public.salvar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text,
                                                        p_navegador text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null or not exists (select 1 from public.perfis p where p.id = conta) then
    raise exception 'Entre na sua conta para ativar as notificações.' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(char_length(p_p256dh), 0) not between 80 and 100
     or coalesce(char_length(p_auth), 0) not between 16 and 40 then
    raise exception 'Este navegador mandou uma inscrição inválida.' using errcode = '22023';
  end if;
  insert into privado.inscricoes_push (conta_id, pessoa_id, endpoint, p256dh, auth, navegador)
  values (conta, (select auth.uid()), p_endpoint, p_p256dh, p_auth, left(nullif(btrim(p_navegador), ''), 120))
  on conflict (endpoint) do update
    set conta_id = excluded.conta_id, pessoa_id = excluded.pessoa_id, p256dh = excluded.p256dh,
        auth = excluded.auth, navegador = excluded.navegador, atualizado_em = now();
  -- no máximo 10 aparelhos por conta: sai o mais antigo
  delete from privado.inscricoes_push i
   where i.conta_id = conta
     and i.id not in (select x.id from privado.inscricoes_push x where x.conta_id = conta
                       order by x.atualizado_em desc limit 10);
end
$$;

create or replace function public.remover_inscricao_push(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from privado.inscricoes_push i
   where i.endpoint = p_endpoint and i.conta_id = (select public.conta_atual());
$$;

revoke execute on function public.salvar_inscricao_push(text, text, text, text), public.remover_inscricao_push(text)
  from public, anon;
grant execute on function public.salvar_inscricao_push(text, text, text, text), public.remover_inscricao_push(text)
  to authenticated;

-- O gatilho do sino: só o que pede atenção vira notificação no celular
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

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe'))
  execute function privado.notificacao_para_celular();

-- O servidor do site: pega o que está na fila, com os aparelhos de cada conta
create or replace function public.servidor_pegar_push(p_chave text, p_limite integer default 20)
returns table (id bigint, tipo text, texto text, anuncio_id uuid, ator_id uuid, recado_id uuid,
               conta_id uuid, inscricoes jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- notificação velha não serve mais
  update privado.fila_push f set status = 'falhou', erro = coalesce(f.erro, 'Ficou mais de 1 dia na fila.')
   where f.status in ('pendente', 'enviando') and f.criado_em < now() - interval '1 day';
  return query
  with escolhidos as (
    select f.id from privado.fila_push f
     where f.tentar_depois <= now() and f.status in ('pendente', 'enviando') and f.tentativas < 3
     order by f.id
     limit least(greatest(coalesce(p_limite, 20), 1), 100)
     for update skip locked
  ), marcados as (
    update privado.fila_push f
       set status = 'enviando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '10 minutes'
      from escolhidos e
     where f.id = e.id
    returning f.*
  )
  select m.id, m.tipo, m.texto, m.anuncio_id, m.ator_id, m.recado_id, m.conta_id,
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth))
                     from privado.inscricoes_push i where i.conta_id = m.conta_id), '[]'::jsonb)
    from marcados m
   order by m.id;
end
$$;

create or replace function public.servidor_marcar_push(p_chave text, p_id bigint, p_ok boolean, p_erro text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.fila_push f
     set status = case when p_ok then 'enviado' when f.tentativas >= 3 then 'falhou' else 'pendente' end,
         erro = case when p_ok then null else left(p_erro, 400) end,
         tentar_depois = case when p_ok then f.tentar_depois else now() + interval '5 minutes' end
   where f.id = p_id;
  if p_ok then
    update privado.inscricoes_push i set enviada_em = now()
      from privado.fila_push f where f.id = p_id and i.conta_id = f.conta_id;
  end if;
end
$$;

-- O serviço do navegador disse que a inscrição não vale mais (a pessoa desligou ou desinstalou)
create or replace function public.servidor_inscricao_expirada(p_chave text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  delete from privado.inscricoes_push i where i.endpoint = p_endpoint;
end
$$;

revoke execute on function public.servidor_pegar_push(text, integer), public.servidor_marcar_push(text, bigint, boolean, text),
  public.servidor_inscricao_expirada(text, text) from public;
grant execute on function public.servidor_pegar_push(text, integer), public.servidor_marcar_push(text, bigint, boolean, text),
  public.servidor_inscricao_expirada(text, text) to anon, authenticated, service_role;
