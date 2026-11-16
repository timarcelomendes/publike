-- A Rota do currículo virou "Quem contrata perto" (16/11/2026, Marcelo: "o nome rota de currículo não está legal e
-- deveríamos ter uma opção de chegar logo pela home, que desperte curiosidade"). O endereço é /quem-contrata-perto, e o
-- antigo leva para ele (next.config.ts). Aqui:
--   1. os links que o banco escreve nos avisos e e-mails passam a ser o endereço novo (e os avisos já mandados também);
--   2. os nomes no Admin › E-mails;
--   3. quantos_contratam: quantos lugares a até X km costumam contratar cada função, para a chamada da home.
-- Pode rodar de novo.

-- 1. Os links ---------------------------------------------------------------------------------------------------------

do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'privado') and p.prokind = 'f' and p.prosrc like '%/rota-do-curriculo%'
  loop
    def := pg_get_functiondef(f.oid);
    execute replace(def, '/rota-do-curriculo', '/quem-contrata-perto');
  end loop;
end
$$;

update public.notificacoes
   set link = replace(link, '/rota-do-curriculo', '/quem-contrata-perto')
 where link like '/rota-do-curriculo%';

-- 2. Os nomes no Admin › E-mails (o assunto e o texto que a equipe editou ficam como estão) ---------------------------

update public.modelos_email set nome = 'Quem contrata perto: cópia aberta' where chave = 'copia_aberta';
update public.modelos_email
   set nome = 'Quem contrata perto: alguém te chamou?',
       descricao = 'Para quem procura: uma semana depois de entregar as cópias impressas, a pergunta "Alguém te chamou?".'
 where chave = 'rota_pergunta';
update public.modelos_email
   set descricao = 'Para quem contrata: uma pessoa da região tocou em "Quero trabalhar aqui" em Quem contrata perto ou no "Abriu perto de você".'
 where chave = 'interesse_local';
update public.modelos_email
   set botao = case when botao = 'Ver a minha rota' then 'Ver as minhas cópias' else botao end,
       botao_padrao = 'Ver as minhas cópias'
 where chave = 'copia_aberta' and botao_padrao = 'Ver a minha rota';

-- 3. Quantos contratam perto (a chamada da home) ----------------------------------------------------------------------

-- Para cada função (até 4), quantos lugares a até p_raio_km costumam contratá-la: os mesmos filtros de lugares_da_rota,
-- só a contagem. Sem conta também (a chamada aparece para quem visita).
create or replace function public.quantos_contratam(
  p_lat double precision, p_lng double precision, p_raio_km numeric default 2, p_cbos text[] default '{}'
)
returns table (cbo text, total integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raio numeric := least(greatest(coalesce(p_raio_km, 2), 0.5), 10);
  v_ponto extensions.geography;
  v_cbo text;
  v_cnaes text[];
  v_n integer;
begin
  if p_lat is null or p_lng is null then
    return;
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  foreach v_cbo in array coalesce(p_cbos[1:4], '{}') loop
    continue when v_cbo !~ '^[0-9]{6}$';
    select array_agg(r.cnae) into v_cnaes from privado.ramos_da_funcao(v_cbo, 12) r;
    v_n := 0;
    if v_cnaes is not null then
      select count(*)::integer into v_n
        from privado.empresas_receita e
       where e.cnae = any(v_cnaes) and e.situacao = 'ativa' and not e.mei
         and not (coalesce(e.natureza, '') = '2135' and e.razao_social is null and (e.nome = 'Empresa sem nome' or exists (select 1 from privado.ramos_do_publike rr where rr.cnae = e.cnae and rr.nome = e.nome)))
         and e.local is not null
         and extensions.st_dwithin(e.local, v_ponto, v_raio * 1000);
    end if;
    cbo := v_cbo;
    total := v_n;
    return next;
  end loop;
end
$$;

revoke execute on function public.quantos_contratam(double precision, double precision, numeric, text[]) from public;
grant execute on function public.quantos_contratam(double precision, double precision, numeric, text[])
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
