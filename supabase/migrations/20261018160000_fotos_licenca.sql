-- Fotos das notícias pelo Openverse (fotos livres do Flickr e da Wikimedia, sem chave): a foto
-- guarda também de onde veio e a licença (CC BY e afins pedem o crédito com a licença).

alter table public.noticias
  add column if not exists foto_fonte text check (char_length(foto_fonte) <= 60),
  add column if not exists foto_licenca text check (char_length(foto_licenca) <= 40),
  add column if not exists foto_licenca_url text check (foto_licenca_url ~ '^https://' and char_length(foto_licenca_url) <= 300);

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
                                   foto_url, foto_autor, foto_autor_url, foto_link, foto_alt,
                                   foto_fonte, foto_licenca, foto_licenca_url)
      values (
        item ->> 'slug', btrim(item ->> 'titulo'), btrim(item ->> 'resumo'), btrim(item ->> 'corpo'),
        nullif(btrim(item ->> 'pratico'), ''), coalesce(item ->> 'tema', 'mercado'), nullif(btrim(item ->> 'cidade'), ''),
        btrim(item ->> 'fonte_nome'), btrim(item ->> 'fonte_url'), nullif(item ->> 'fonte_data', '')::date,
        nullif(item ->> 'foto_url', ''), left(nullif(btrim(item ->> 'foto_autor'), ''), 120),
        nullif(item ->> 'foto_autor_url', ''), nullif(item ->> 'foto_link', ''), left(nullif(btrim(item ->> 'foto_alt'), ''), 300),
        left(nullif(btrim(item ->> 'foto_fonte'), ''), 60), left(nullif(btrim(item ->> 'foto_licenca'), ''), 40),
        nullif(item ->> 'foto_licenca_url', '')
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
             foto_alt = left(nullif(btrim(f ->> 'foto_alt'), ''), 300),
             foto_fonte = left(nullif(btrim(f ->> 'foto_fonte'), ''), 60),
             foto_licenca = left(nullif(btrim(f ->> 'foto_licenca'), ''), 40),
             foto_licenca_url = nullif(f ->> 'foto_licenca_url', '')
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

revoke execute on function public.servidor_salvar_noticias(text, jsonb, text), public.servidor_fotos_noticias(text, jsonb) from public;
grant execute on function public.servidor_salvar_noticias(text, jsonb, text), public.servidor_fotos_noticias(text, jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
