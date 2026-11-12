-- IndexNow (12/11/2026, pedido do Marcelo: "melhore as indexações do site nas ferramentas de busca"): o aviso na hora
-- para o Bing (que também alimenta a busca do ChatGPT, do DuckDuckGo e do Copilot), o Yandex, o Naver e o Seznam, como o
-- da Indexing API faz para o Google (20270222120000_google_vagas.sql). Vale para vagas e serviços: o anúncio que entra
-- no ar, o que sai e o editado (de novo só depois de um dia). Sem cota apertada: até 500 por rodada. A chave sai da chave
-- do servidor (lib/servidor/indexnow.ts), sem nada para configurar. Pode rodar de novo.

create table if not exists privado.indexnow_anuncios (
  anuncio_id uuid primary key,
  no_ar boolean not null,
  avisado_em timestamptz not null default now()
);
create index if not exists indexnow_anuncios_avisado on privado.indexnow_anuncios (avisado_em);
alter table privado.indexnow_anuncios enable row level security;
revoke all on privado.indexnow_anuncios from public, anon, authenticated;

create or replace function public.servidor_anuncios_para_indexnow(p_chave text, p_limite integer default 500)
returns table (anuncio_id uuid, no_ar boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select x.id, x.no_ar from (
    select a.id,
           (a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null) as no_ar
      from public.anuncios a
      left join privado.indexnow_anuncios g on g.anuncio_id = a.id
     where (g.anuncio_id is null and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null)
        or (g.anuncio_id is not null
            and g.no_ar <> (a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null))
        or (g.no_ar and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null
            and a.atualizado_em > g.avisado_em and g.avisado_em < now() - interval '1 day')
    union all
    select g.anuncio_id, false
      from privado.indexnow_anuncios g
     where g.no_ar and not exists (select 1 from public.anuncios a where a.id = g.anuncio_id)
  ) x
  order by x.no_ar
  limit least(greatest(coalesce(p_limite, 500), 1), 1000);
end
$$;

-- os avisos aceitos, de uma vez: [{"anuncio": uuid, "no_ar": bool}, ...]
create or replace function public.servidor_anuncios_avisados_ao_indexnow(p_chave text, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.indexnow_anuncios (anuncio_id, no_ar, avisado_em)
  select (i ->> 'anuncio')::uuid, (i ->> 'no_ar')::boolean, now()
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i
  on conflict (anuncio_id) do update set no_ar = excluded.no_ar, avisado_em = now();
end
$$;

-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_anuncios_para_indexnow(text, integer),
  public.servidor_anuncios_avisados_ao_indexnow(text, jsonb) from public;
grant execute on function public.servidor_anuncios_para_indexnow(text, integer),
  public.servidor_anuncios_avisados_ao_indexnow(text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
