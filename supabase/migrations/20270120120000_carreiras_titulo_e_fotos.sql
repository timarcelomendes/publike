-- Página de carreiras: o título próprio ("Vem construir com a gente!") e até 3 fotos no alto, no lugar da capa
-- só (pedido do usuário, 02/11/2026, olhando a página de carreiras da Gupy). A capa de antes vira a primeira foto,
-- e a coluna capa continua com a primeira (o que lia a capa segue funcionando). Pode rodar de novo.
-- Rode depois de 20270119120000_contas_no_app.sql.

alter table public.paginas_de_vagas add column if not exists titulo text;
alter table public.paginas_de_vagas add column if not exists fotos text[] not null default '{}';
alter table public.paginas_de_vagas drop constraint if exists paginas_de_vagas_titulo_check;
alter table public.paginas_de_vagas add constraint paginas_de_vagas_titulo_check
  check (titulo is null or char_length(titulo) between 3 and 80);
alter table public.paginas_de_vagas drop constraint if exists paginas_de_vagas_fotos_check;
alter table public.paginas_de_vagas add constraint paginas_de_vagas_fotos_check check (cardinality(fotos) <= 3);

update public.paginas_de_vagas set fotos = array[capa] where capa is not null and fotos = '{}';

-- a leitura pública ganha o título e as fotos (muda o que devolve: sai e entra de novo)
drop function if exists public.pagina_de_vagas_publica(uuid);
create function public.pagina_de_vagas_publica(p_conta uuid)
returns table (cor text, capa text, texto text, beneficios text[], apelido text, titulo text, fotos text[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.cor, p.capa, p.texto, p.beneficios, p.apelido, p.titulo, p.fotos
    from public.paginas_de_vagas p
   where p.conta_id = p_conta and privado.pagina_de_vagas_liberada(p_conta)
$$;
revoke all on function public.pagina_de_vagas_publica(uuid) from public;
grant execute on function public.pagina_de_vagas_publica(uuid) to anon, authenticated;

-- gravar: o título e as fotos no lugar da capa
drop function if exists public.salvar_pagina_de_vagas(text, text, text, text[], text);
create or replace function public.salvar_pagina_de_vagas(
  p_cor text, p_titulo text, p_fotos text[], p_texto text, p_beneficios text[], p_apelido text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v_apelido text := nullif(lower(btrim(coalesce(p_apelido, ''))), '');
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_fotos text[];
  v_beneficios text[];
  v_fotos_antes text[];
begin
  if v_conta is null then
    raise exception 'Entre na sua conta.' using errcode = 'P0001', hint = 'sem_login';
  end if;
  perform privado.exigir_conta_ativa();
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda a página de vagas.' using errcode = 'P0001', hint = 'sem_papel';
  end if;
  if not privado.pagina_de_vagas_liberada(v_conta) then
    raise exception 'A página personalizada libera com mais de 10 vagas publicadas ou com uma assinatura.'
      using errcode = 'P0001', hint = 'nao_liberada';
  end if;
  if p_cor is not null and p_cor !~ '^#[0-9a-f]{6}$' then
    raise exception 'Escolha uma cor da lista.' using errcode = 'P0001', hint = 'cor';
  end if;
  if v_titulo is not null and char_length(v_titulo) not between 3 and 80 then
    raise exception 'O título vai de 3 a 80 letras.' using errcode = 'P0001', hint = 'titulo';
  end if;
  select coalesce(p.fotos, '{}') into v_fotos_antes from public.paginas_de_vagas p where p.conta_id = v_conta;
  select coalesce(array_agg(f order by o), '{}') into v_fotos
    from (select x as f, min(o) as o from unnest(coalesce(p_fotos, '{}')) with ordinality as t(x, o)
           where coalesce(x, '') <> '' group by x) s;
  if cardinality(v_fotos) > 3 then
    raise exception 'Escolha até 3 fotos.' using errcode = 'P0001', hint = 'fotos';
  end if;
  -- foto nova: só da pasta de quem está enviando (as de antes podem continuar)
  if exists (select 1 from unnest(v_fotos) f
              where f <> all (coalesce(v_fotos_antes, '{}'))
                and (f !~ '^[0-9a-f-]{36}/capa/[0-9]{10,16}\.jpg$'
                     or split_part(f, '/', 1) <> (select auth.uid())::text)) then
    raise exception 'Envie as fotos de novo.' using errcode = 'P0001', hint = 'fotos';
  end if;
  if v_texto is not null and char_length(v_texto) > 600 then
    raise exception 'O texto passa de 600 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  select coalesce(array_agg(b order by o), '{}') into v_beneficios
    from (select btrim(x) as b, min(o) as o
            from unnest(coalesce(p_beneficios, '{}')) with ordinality as t(x, o)
           where btrim(x) <> ''
           group by btrim(x)) s;
  if cardinality(v_beneficios) > 6 then
    raise exception 'Escolha até 6 benefícios.' using errcode = 'P0001', hint = 'beneficios';
  end if;
  if exists (select 1 from unnest(v_beneficios) b where char_length(b) > 60) then
    raise exception 'Cada benefício com até 60 letras.' using errcode = 'P0001', hint = 'beneficios';
  end if;
  if v_apelido is not null then
    if v_apelido !~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$' or v_apelido like '%--%' then
      raise exception 'O endereço usa de 3 a 30 letras sem acento, números e hífen.' using errcode = 'P0001', hint = 'apelido';
    end if;
    if v_apelido in ('admin', 'api', 'ajuda', 'app', 'contato', 'equipe', 'login', 'painel', 'publike', 'suporte',
                     'vaga', 'vagas', 'emprego', 'empregos', 'entrar', 'sair', 'teste', 'www') then
      raise exception 'Esse endereço é reservado. Escolha outro.' using errcode = 'P0001', hint = 'apelido_em_uso';
    end if;
    if exists (select 1 from public.paginas_de_vagas p where p.apelido = v_apelido and p.conta_id <> v_conta) then
      raise exception 'Esse endereço já é de outra conta. Escolha outro.' using errcode = 'P0001', hint = 'apelido_em_uso';
    end if;
  end if;

  insert into public.paginas_de_vagas as p (conta_id, cor, titulo, fotos, capa, texto, beneficios, apelido, atualizada_em)
  values (v_conta, p_cor, v_titulo, v_fotos, v_fotos[1], v_texto, v_beneficios, v_apelido, now())
  on conflict (conta_id) do update
    set cor = excluded.cor, titulo = excluded.titulo, fotos = excluded.fotos, capa = excluded.capa,
        texto = excluded.texto, beneficios = excluded.beneficios, apelido = excluded.apelido, atualizada_em = now();
exception
  when unique_violation then
    raise exception 'Esse endereço já é de outra conta. Escolha outro.' using errcode = 'P0001', hint = 'apelido_em_uso';
end
$$;
revoke all on function public.salvar_pagina_de_vagas(text, text, text[], text, text[], text) from public, anon;
grant execute on function public.salvar_pagina_de_vagas(text, text, text[], text, text[], text) to authenticated;
