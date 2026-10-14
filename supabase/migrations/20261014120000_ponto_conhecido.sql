-- Ponto já conhecido de um endereço público (14/10/2026). Pode rodar de novo sem problema.
-- Muita rua de Goiânia não está no mapa aberto. Quando um comércio ou empresa publica com
-- CEP, número e o pino na porta, esse ponto já é público (aparece na vaga). Na próxima busca
-- pelo mesmo CEP e número, o Publike usa esse ponto em vez do meio do bairro.
-- Só vale o endereço público (local_exato): a casa de quem procura (tabela casas) e o local
-- de pessoa física nunca entram aqui.

create index if not exists anuncios_cep_exato_idx on public.anuncios (cep) where local_exato;

create or replace function public.ponto_conhecido(p_cep text, p_numero text)
returns table(lat double precision, lng double precision, vezes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with achados as (
    select round(extensions.st_y(a.local::extensions.geometry)::numeric, 5)::double precision as lat,
           round(extensions.st_x(a.local::extensions.geometry)::numeric, 5)::double precision as lng,
           a.criado_em
      from public.anuncios a
     where a.local_exato
       and a.cep = p_cep
       and a.endereco is not null
       and a.status in ('ativo', 'pausado', 'encerrado', 'expirado')
       -- o número só tem algarismos (e talvez uma letra): seguro dentro da expressão abaixo
       and p_cep ~ '^[0-9]{8}$'
       and p_numero ~ '^[0-9]{1,6}[A-Za-z]?$'
       and a.endereco ~* ('(^|[^0-9])' || p_numero || '([^0-9A-Za-z]|$)')
  )
  -- o mais recente; "vezes" diz quantas vagas marcaram esse endereço
  select x.lat, x.lng, (select count(*) from achados)::integer
    from achados x
   order by x.criado_em desc
   limit 1
$$;
revoke execute on function public.ponto_conhecido(text, text) from public;
grant execute on function public.ponto_conhecido(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
