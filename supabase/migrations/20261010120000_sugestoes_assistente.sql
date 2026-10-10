-- Sugestões, erros, elogios e melhorias + assistente (chat de ajuda).
--
-- 1. Qualquer pessoa, com ou sem conta, manda um erro, uma sugestão, um elogio
--    ou uma ideia de melhoria (página /sugerir). O admin organiza tudo num
--    quadro (kanban): Novo, Em análise, Fazendo, Feito e Descartado.
-- 2. O assistente de ajuda (chat) fica ligado por padrão e pode ser desligado no
--    admin. O servidor do site conta as mensagens de cada pessoa por hora, para
--    a conta da OpenAI não disparar.
--
-- Rode depois de 20261009290000_logo_emails.sql (pode rodar de novo sem problema).

-- 1. Sugestões --------------------------------------------------------------------

create table if not exists public.sugestoes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('erro', 'sugestao', 'elogio', 'melhoria')),
  texto text not null check (char_length(texto) between 10 and 2000),
  -- página onde a pessoa estava (só o caminho, sem o domínio)
  pagina text check (pagina is null or (char_length(pagina) <= 300 and pagina ~ '^/')),
  -- para responder quem não tem conta (opcional)
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  autor_id uuid references auth.users (id) on delete set null,
  status text not null default 'novo' check (status in ('novo', 'analise', 'fazendo', 'feito', 'descartado')),
  -- ordem dentro da coluna (menor em cima); a mais nova entra no topo
  posicao double precision not null default (-extract(epoch from clock_timestamp())),
  nota text check (nota is null or char_length(nota) <= 2000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists sugestoes_status_idx on public.sugestoes (status, posicao);
create index if not exists sugestoes_autor_idx on public.sugestoes (autor_id, criado_em desc);

-- Ninguém lê nem grava direto pela API: só pelas funções abaixo.
alter table public.sugestoes enable row level security;
revoke all on public.sugestoes from anon, authenticated;

-- Com ou sem conta. Limites contra enxurrada: 10 por hora para quem tem conta,
-- 60 por hora somando todos sem conta, e nada de mandar o mesmo texto de novo.
create or replace function public.enviar_sugestao(p_tipo text, p_texto text, p_pagina text, p_email text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '[[:space:]]+$', ''));
  v_pagina text := nullif(btrim(coalesce(p_pagina, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  novo bigint;
begin
  if p_tipo is null or p_tipo not in ('erro', 'sugestao', 'elogio', 'melhoria') then
    raise exception 'Escolha o que você quer mandar: erro, sugestão, elogio ou melhoria.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 10 then
    raise exception 'Conte um pouco mais (pelo menos 10 letras).' using errcode = 'P0001';
  end if;
  if char_length(v_texto) > 2000 then
    raise exception 'O texto passou de 2.000 letras. Resuma um pouco.' using errcode = 'P0001';
  end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Confira o e-mail.' using errcode = 'P0001';
  end if;
  if v_pagina is not null and (char_length(v_pagina) > 300 or v_pagina !~ '^/' or v_pagina ~ '^//') then
    v_pagina := null;
  end if;

  if usuario is not null then
    if (select count(*) from public.sugestoes s
         where s.autor_id = usuario and s.criado_em > now() - interval '1 hour') >= 10 then
      raise exception 'Você mandou muitas mensagens na última hora. Tente de novo mais tarde.' using errcode = 'P0001';
    end if;
  elsif (select count(*) from public.sugestoes s
          where s.autor_id is null and s.criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'Recebemos muitas mensagens agora. Tente de novo daqui a pouco.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sugestoes s
              where s.texto = v_texto and s.criado_em > now() - interval '1 day'
                and s.autor_id is not distinct from usuario) then
    raise exception 'Essa mensagem já chegou. Obrigado!' using errcode = 'P0001';
  end if;

  insert into public.sugestoes (tipo, texto, pagina, email, autor_id)
  values (p_tipo, v_texto, v_pagina, v_email, usuario)
  returning id into novo;
  return novo;
end
$$;

-- Admin: o quadro inteiro (as descartadas e feitas há mais de 90 dias saem da lista).
create or replace function public.admin_listar_sugestoes()
returns table (
  id bigint,
  tipo text,
  texto text,
  pagina text,
  email text,
  autor_id uuid,
  autor_nome text,
  autor_email text,
  status text,
  posicao double precision,
  nota text,
  criado_em timestamptz,
  atualizado_em timestamptz
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
  select s.id, s.tipo, s.texto, s.pagina, s.email, s.autor_id, p.nome, u.email::text, s.status, s.posicao, s.nota,
         s.criado_em, s.atualizado_em
    from public.sugestoes s
    left join public.perfis p on p.id = s.autor_id
    left join auth.users u on u.id = s.autor_id
   where s.status not in ('feito', 'descartado') or s.atualizado_em > now() - interval '90 days'
   order by s.posicao, s.id
   limit 1000;
end
$$;

-- Admin: muda de coluna e/ou de lugar na coluna.
create or replace function public.admin_mover_sugestao(p_id bigint, p_status text, p_posicao double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_status is null or p_status not in ('novo', 'analise', 'fazendo', 'feito', 'descartado') then
    raise exception 'Coluna inválida.' using errcode = '22023';
  end if;
  if p_posicao is null or p_posicao = 'NaN'::double precision or abs(p_posicao) > 1e12 then
    raise exception 'Posição inválida.' using errcode = '22023';
  end if;
  update public.sugestoes
     set status = p_status, posicao = p_posicao, atualizado_em = now()
   where id = p_id;
  if not found then
    raise exception 'Essa mensagem não existe mais. Atualize a página.' using errcode = 'P0001';
  end if;
end
$$;

-- Admin: anotação interna (quem mandou não vê).
create or replace function public.admin_anotar_sugestao(p_id bigint, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  perform privado.exigir_admin();
  if char_length(v_nota) > 2000 then
    raise exception 'A anotação passou de 2.000 letras.' using errcode = 'P0001';
  end if;
  update public.sugestoes set nota = v_nota, atualizado_em = now() where id = p_id;
  if not found then
    raise exception 'Essa mensagem não existe mais. Atualize a página.' using errcode = 'P0001';
  end if;
end
$$;

-- Admin: apaga de vez (spam, por exemplo).
create or replace function public.admin_apagar_sugestao(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  delete from public.sugestoes where id = p_id;
end
$$;


-- 2. Assistente --------------------------------------------------------------------

alter table public.config_site add column if not exists chat_ativo boolean not null default true;

-- Mensagens por pessoa (conta ou endereço de internet, guardado embaralhado) e por hora.
create table if not exists privado.uso_chat (
  quem text not null,
  hora timestamptz not null,
  total integer not null default 0,
  primary key (quem, hora)
);
alter table privado.uso_chat enable row level security;
revoke all on privado.uso_chat from public, anon, authenticated;

-- Sem login: o site mostra o botão do assistente só se ele estiver ligado.
create or replace function public.assistente_ligado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.chat_ativo from public.config_site c limit 1), false)
$$;

-- Servidor do site: conta mais uma mensagem e diz se ainda está dentro do limite da hora.
create or replace function public.servidor_usar_assistente(p_chave text, p_quem text, p_limite integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamptz := date_trunc('hour', now());
  v_total integer;
begin
  perform privado.exigir_servidor(p_chave);
  if p_quem is null or p_quem !~ '^(u|ip):[0-9a-f-]{8,64}$' then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce((select c.chat_ativo from public.config_site c limit 1), false) then
    return false;
  end if;
  -- de vez em quando, limpa as contas antigas
  if random() < 0.02 then
    delete from privado.uso_chat u where u.hora < now() - interval '2 days';
  end if;
  insert into privado.uso_chat as u (quem, hora, total) values (p_quem, agora, 1)
  on conflict (quem, hora) do update set total = u.total + 1
  returning u.total into v_total;
  return v_total <= least(greatest(coalesce(p_limite, 15), 1), 500);
end
$$;

create or replace function public.admin_salvar_config_assistente(p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update public.config_site
     set chat_ativo = coalesce(p_ativo, true), atualizado_em = now(), atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'assistente', 'Assistente',
                            jsonb_build_object('ligado', coalesce(p_ativo, true)));
end
$$;


-- 3. Permissões ------------------------------------------------------------------------

revoke execute on function public.enviar_sugestao(text, text, text, text) from public;
grant execute on function public.enviar_sugestao(text, text, text, text) to anon, authenticated;

revoke execute on function public.assistente_ligado() from public;
grant execute on function public.assistente_ligado() to anon, authenticated, service_role;

revoke execute on function public.servidor_usar_assistente(text, text, integer) from public;
grant execute on function public.servidor_usar_assistente(text, text, integer) to anon, authenticated, service_role;

revoke execute on function
  public.admin_listar_sugestoes(),
  public.admin_mover_sugestao(bigint, text, double precision),
  public.admin_anotar_sugestao(bigint, text),
  public.admin_apagar_sugestao(bigint),
  public.admin_salvar_config_assistente(boolean)
from public, anon, authenticated;
grant execute on function
  public.admin_listar_sugestoes(),
  public.admin_mover_sugestao(bigint, text, double precision),
  public.admin_anotar_sugestao(bigint, text),
  public.admin_apagar_sugestao(bigint),
  public.admin_salvar_config_assistente(boolean)
to service_role;

notify pgrst, 'reload schema';
