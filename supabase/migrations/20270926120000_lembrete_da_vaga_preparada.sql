-- A vaga preparada pelo WhatsApp que não foi ao ar (25/11/2026; Marcelo, com a ANPE, que tocou em "Conferir no site"
-- e a vaga não entrou: "precisa ter um acompanhamento posterior, se o usuário conseguiu"; e "esse fluxo não aceita
-- erro"). Três partes:
--
-- 1. O lugar de fora (src/lib/fora-da-regiao.ts). A ANPE respondeu "barueri sp" e "SÃO PAULO", e a vaga ficou como
--    "barueri sp, Goiânia". servidor_whatsapp_lugar_das_vagas ganha p_fora (marca as vagas do anúncio com o lugar de
--    fora, e o "Sim, publicar" não publica) e p_trocar (a vaga de fora ganha o lugar novo inteiro: o bairro e a cidade
--    respondidos, sem o "fora"; sem o bairro na resposta, o bairro antigo sai e a pergunta do bairro vem em seguida).
--
-- 2. O tipo de contratação na conversa. De 23 a 25/11, dois dos três "Sim, publicar" que não saíram pararam no tipo de
--    contratação, que o anúncio não dizia, e iam para o site. servidor_whatsapp_regime_das_vagas guarda o tipo
--    escolhido nos botões (ou escrito) nas vagas do anúncio que ainda não têm, e o WhatsApp publica em seguida.
--
-- 3. O lembrete. O robô das filas procura a vaga preparada que ficou sem publicar há mais de 45 minutos (e há menos de
--    22 horas, dentro da janela da Meta), com a conversa no robô, de quem não disse que procura emprego, parada há 30
--    minutos, de 8h às 20h de Goiânia; a conta do número não publicou nenhuma vaga depois, nenhuma vaga da conversa saiu
--    depois e a conversa não teve lembrete nos últimos 7 dias. O servidor escolhe a mensagem (src/lib/servidor/
--    atendimento-whatsapp.ts): o "Conseguiu publicar?" com o "Sim, publicar", a pergunta do tipo de contratação, a do
--    lugar, o link do site (o que só se acerta lá) ou, na vaga de fora que tinha ido como daqui, a correção.

alter table privado.whatsapp_vagas add column if not exists lembrada_em timestamptz;

-- 1. O lugar respondido, agora com o lugar de fora e a troca --------------------------------------------------------

drop function if exists public.servidor_whatsapp_lugar_das_vagas(text, text, text, text);

create or replace function public.servidor_whatsapp_lugar_das_vagas(
  p_chave text, p_conversa text, p_bairro text default null, p_cidade text default null,
  p_fora text default null, p_trocar boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligado boolean;
  v_lote uuid;
  v_bairro text := nullif(btrim(regexp_replace(coalesce(p_bairro, ''), '\s+', ' ', 'g')), '');
  v_cidade text := nullif(btrim(coalesce(p_cidade, '')), '');
  v_fora text := nullif(btrim(regexp_replace(coalesce(p_fora, ''), '\s+', ' ', 'g')), '');
begin
  perform privado.exigir_servidor(p_chave);
  select c.ativo and coalesce(c.atendimento_ligado, false) and c.vagas_ligado and c.vagas_publicar_aqui
    into v_ligado
    from privado.config_whatsapp c where c.id;
  if not coalesce(v_ligado, false) then
    return jsonb_build_object('ligado', false, 'ok', false);
  end if;
  if v_bairro is not null and char_length(v_bairro) > 60 then
    v_bairro := left(v_bairro, 60);
  end if;

  select x.lote into v_lote
    from privado.whatsapp_vagas x
   where x.conversa = p_conversa and x.publicada_em is null and x.criado_em > now() - interval '24 hours'
   order by x.criado_em desc, x.ordem
   limit 1;
  if v_lote is null then
    return jsonb_build_object('ligado', true, 'ok', false);
  end if;

  if v_fora is not null then
    -- o lugar de fora: as vagas do anúncio ficam marcadas (o "Sim, publicar" não publica; o site avisa)
    update privado.whatsapp_vagas x
       set rascunho = x.rascunho || jsonb_build_object('fora', left(v_fora, 80))
     where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null;
  elsif p_trocar and (v_bairro is not null or v_cidade is not null) then
    -- a vaga que era de fora ganha o lugar novo inteiro
    update privado.whatsapp_vagas x
       set rascunho = (x.rascunho - 'fora')
             || jsonb_build_object('bairro', coalesce(v_bairro, ''), 'cidade', coalesce(v_cidade, ''))
     where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null;
  elsif v_bairro is not null or v_cidade is not null then
    update privado.whatsapp_vagas x
       set rascunho = x.rascunho
             || case when coalesce(btrim(x.rascunho ->> 'bairro'), '') = '' and v_bairro is not null
                     then jsonb_build_object('bairro', v_bairro) else '{}'::jsonb end
             || case when v_cidade is not null
                          and (coalesce(btrim(x.rascunho ->> 'cidade'), '') = ''
                               or (coalesce(btrim(x.rascunho ->> 'bairro'), '') = '' and v_bairro is not null))
                     then jsonb_build_object('cidade', v_cidade) else '{}'::jsonb end
     where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null;
  end if;

  return jsonb_build_object(
    'ligado', true,
    'ok', true,
    'vagas', (select coalesce(jsonb_agg(jsonb_build_object('token', x.token, 'ordem', x.ordem, 'rascunho', x.rascunho)
                                        order by x.ordem, x.criado_em), '[]'::jsonb)
                from privado.whatsapp_vagas x
               where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null));
end
$$;
revoke execute on function public.servidor_whatsapp_lugar_das_vagas(text, text, text, text, text, boolean) from public;
grant execute on function public.servidor_whatsapp_lugar_das_vagas(text, text, text, text, text, boolean)
  to anon, authenticated, service_role;

-- 2. O tipo de contratação ------------------------------------------------------------------------------------------

-- p_token: a vaga do botão (o anúncio dela); sem ele, o último anúncio ainda sem publicar da conversa (a resposta
-- escrita). Volta a primeira vaga ainda sem publicar do anúncio e quantas faltam.
create or replace function public.servidor_whatsapp_regime_das_vagas(
  p_chave text, p_conversa text, p_token text, p_regime text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lote uuid;
  v_n integer;
  v_token text;
begin
  perform privado.exigir_servidor(p_chave);
  if p_regime is null or p_regime not in ('clt', 'aprendiz', 'estagio', 'trainee', 'temporario', 'intermitente',
                                          'diaria', 'freelance', 'produtividade', 'autonomo', 'pj', 'outro') then
    return jsonb_build_object('ok', false, 'erro', 'regime');
  end if;
  if coalesce(p_token, '') <> '' then
    select x.lote into v_lote
      from privado.whatsapp_vagas x
     where x.token = p_token and x.conversa = p_conversa and x.criado_em > now() - interval '30 days';
  else
    select x.lote into v_lote
      from privado.whatsapp_vagas x
     where x.conversa = p_conversa and x.publicada_em is null and x.criado_em > now() - interval '48 hours'
     order by x.criado_em desc, x.ordem
     limit 1;
  end if;
  if v_lote is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_achou');
  end if;
  update privado.whatsapp_vagas x
     set rascunho = x.rascunho || jsonb_build_object('regime', p_regime)
   where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null
     and coalesce(btrim(x.rascunho ->> 'regime'), '') = '';
  select count(*)::integer, (array_agg(x.token order by x.ordem, x.criado_em))[1]
    into v_n, v_token
    from privado.whatsapp_vagas x
   where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null;
  return jsonb_build_object('ok', coalesce(v_n, 0) > 0, 'token', v_token, 'n', coalesce(v_n, 0));
end
$$;
revoke execute on function public.servidor_whatsapp_regime_das_vagas(text, text, text, text) from public;
grant execute on function public.servidor_whatsapp_regime_das_vagas(text, text, text, text)
  to anon, authenticated, service_role;

-- 3. O lembrete -----------------------------------------------------------------------------------------------------

create or replace function public.servidor_vagas_sem_publicar(p_chave text, p_limite integer default 5)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 20 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x)
      from (select distinct on (v.conversa)
                   v.conversa, c.numero, c.nome, v.token, v.lote, v.rascunho,
                   v.aberta_em is not null as abriu,
                   (select count(*) from privado.whatsapp_vagas l
                     where l.lote = v.lote and l.conversa = v.conversa and l.publicada_em is null)::integer as no_lote
              from privado.whatsapp_vagas v
              join privado.whatsapp_conversas c on c.chave = v.conversa
             where v.publicada_em is null and v.anuncio_id is null and v.lembrada_em is null
               and v.criado_em < now() - interval '45 minutes'
               and v.criado_em > now() - interval '22 hours'
               and c.situacao = 'robo'
               and c.perfil is distinct from 'trabalho'
               and c.ultima_da_pessoa_em > now() - interval '23 hours'
               and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                                where m.chave = c.chave and m.criado_em > now() - interval '30 minutes')
               and not exists (select 1 from privado.whatsapp_vagas o
                                where o.conversa = v.conversa
                                  and (o.lembrada_em > now() - interval '7 days' or o.publicada_em > v.criado_em))
               and not exists (select 1 from public.anuncios a
                                where a.autor_id = privado.conta_do_celular(c.numero) and a.tipo = 'vaga'
                                  and a.criado_em > v.criado_em)
             order by v.conversa, v.criado_em desc, v.ordem
             limit greatest(1, least(coalesce(p_limite, 5), 20))) x), '[]'::jsonb);
end
$$;

-- marca antes de mandar (o robô roda a cada minuto: um lembrete só)
create or replace function public.servidor_vaga_lembrada(p_chave text, p_conversa text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.whatsapp_vagas v set lembrada_em = now()
   where v.conversa = p_conversa and v.publicada_em is null and v.lembrada_em is null;
end
$$;

revoke execute on function public.servidor_vagas_sem_publicar(text, integer), public.servidor_vaga_lembrada(text, text)
  from public;
grant execute on function public.servidor_vagas_sem_publicar(text, integer), public.servidor_vaga_lembrada(text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270926120000_lembrete_da_vaga_preparada');
