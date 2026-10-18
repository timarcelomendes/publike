-- Notícias com foto de verdade: uma foto de banco livre (Pexels), escolhida pelo assunto,
-- com o nome de quem fotografou. Sem foto, a notícia segue com a capa desenhada.

alter table public.noticias
  add column if not exists foto_url text check (foto_url ~ '^https://' and char_length(foto_url) <= 600),
  add column if not exists foto_autor text check (char_length(foto_autor) <= 120),
  add column if not exists foto_autor_url text check (foto_autor_url ~ '^https://' and char_length(foto_autor_url) <= 600),
  add column if not exists foto_link text check (foto_link ~ '^https://' and char_length(foto_link) <= 600),
  add column if not exists foto_alt text check (char_length(foto_alt) <= 300);

-- O contexto da busca leva também as notícias ainda sem foto (para completar) e as fotos já usadas
-- (para não repetir a mesma foto em duas notícias).
create or replace function public.servidor_noticias_contexto(p_chave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.config_site;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from public.config_site limit 1;
  return jsonb_build_object(
    'ligada', coalesce(cfg.ia_noticias, false),
    'modelo', cfg.ia_modelo,
    'ultima_busca', cfg.noticias_ultima_busca,
    -- o que já está na lista (para a IA não trazer de novo)
    'recentes', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', n.titulo, 'fonte_url', n.fonte_url) order by n.criado_em desc)
        from (select titulo, fonte_url, criado_em from public.noticias
               where criado_em > now() - interval '45 days' order by criado_em desc limit 80) n
    ), '[]'::jsonb),
    'sem_foto', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'titulo', n.titulo, 'tema', n.tema))
        from (select id, titulo, tema from public.noticias
               where foto_url is null and status <> 'descartada'
               order by criado_em desc limit 12) n
    ), '[]'::jsonb),
    'fotos_usadas', coalesce((
      select jsonb_agg(n.foto_link)
        from (select foto_link from public.noticias where foto_link is not null
               order by criado_em desc limit 200) n
    ), '[]'::jsonb)
  );
end
$$;

-- Guarda os rascunhos que a IA escreveu, já com a foto (os repetidos ficam de fora).
create or replace function public.servidor_salvar_noticias(p_chave text, p_itens jsonb, p_erro text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  novos integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  for item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) limit 10 loop
    begin
      insert into public.noticias (slug, titulo, resumo, corpo, pratico, tema, cidade, fonte_nome, fonte_url, fonte_data,
                                   foto_url, foto_autor, foto_autor_url, foto_link, foto_alt)
      values (
        item ->> 'slug', btrim(item ->> 'titulo'), btrim(item ->> 'resumo'), btrim(item ->> 'corpo'),
        nullif(btrim(item ->> 'pratico'), ''), coalesce(item ->> 'tema', 'mercado'), nullif(btrim(item ->> 'cidade'), ''),
        btrim(item ->> 'fonte_nome'), btrim(item ->> 'fonte_url'), nullif(item ->> 'fonte_data', '')::date,
        nullif(item ->> 'foto_url', ''), left(nullif(btrim(item ->> 'foto_autor'), ''), 120),
        nullif(item ->> 'foto_autor_url', ''), nullif(item ->> 'foto_link', ''), left(nullif(btrim(item ->> 'foto_alt'), ''), 300)
      )
      on conflict do nothing;
      if found then
        novos := novos + 1;
      end if;
    exception when others then
      raise warning 'Publike: notícia não entrou (%).', sqlerrm;
    end;
  end loop;
  update public.config_site
     set noticias_ultima_busca = now(), noticias_ultimo_erro = left(p_erro, 400)
   where true;
  return novos;
end
$$;

-- As fotos das notícias que ainda não tinham.
create or replace function public.servidor_fotos_noticias(p_chave text, p_fotos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  feitas integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  for f in select * from jsonb_array_elements(coalesce(p_fotos, '[]'::jsonb)) limit 20 loop
    begin
      update public.noticias
         set foto_url = f ->> 'foto_url',
             foto_autor = left(nullif(btrim(f ->> 'foto_autor'), ''), 120),
             foto_autor_url = nullif(f ->> 'foto_autor_url', ''),
             foto_link = nullif(f ->> 'foto_link', ''),
             foto_alt = left(nullif(btrim(f ->> 'foto_alt'), ''), 300)
       where id = (f ->> 'id')::uuid and foto_url is null;
      if found then
        feitas := feitas + 1;
      end if;
    exception when others then
      raise warning 'Publike: foto da notícia não entrou (%).', sqlerrm;
    end;
  end loop;
  return feitas;
end
$$;

revoke execute on function public.servidor_noticias_contexto(text), public.servidor_salvar_noticias(text, jsonb, text),
  public.servidor_fotos_noticias(text, jsonb) from public;
grant execute on function public.servidor_noticias_contexto(text), public.servidor_salvar_noticias(text, jsonb, text),
  public.servidor_fotos_noticias(text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
