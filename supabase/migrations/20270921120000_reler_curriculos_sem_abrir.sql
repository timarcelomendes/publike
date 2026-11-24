-- Os currículos que ficaram sem abrir (24/11/2026; Marcelo: "podemos pedir novamente aos que tiveram problema?").
-- Antes da migração 20270920120000, quem procura trabalho e mandou foto ou PDF ouviu "por aqui eu não consigo abrir".
-- O WhatsApp guarda o arquivo por 30 dias (privado.whatsapp_midias): o robô das filas lê agora o que essas pessoas
-- mandaram e responde com o currículo pronto e o "Conferir e salvar", uma vez por conversa, só dentro da janela de 24
-- horas da Meta (com 1 hora de folga) e com a conversa no robô (não na equipe).

create table if not exists privado.curriculos_relidos (
  chave text primary key references privado.whatsapp_conversas (chave) on delete cascade,
  em timestamptz not null default now(),
  resultado text not null
);
revoke all on privado.curriculos_relidos from public, anon, authenticated;

create or replace function public.servidor_curriculos_sem_abrir(p_chave text, p_limite integer default 3)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((
    select jsonb_agg(x)
      from (select c.chave as conversa, c.numero, c.nome,
                   (select jsonb_agg(jsonb_build_object('wamid', md.wamid, 'tipo', md.tipo, 'midia', md.midia_id,
                                                        'mime', md.mime) order by md.criado_em)
                      from (select m.* from privado.whatsapp_midias m
                             where m.conversa = c.chave
                               and m.criado_em between r.criado_em - interval '30 minutes' and r.criado_em + interval '1 minute'
                             order by m.criado_em desc limit 4) md) as midias
              from privado.whatsapp_conversas c
              cross join lateral (
                select max(cm.criado_em) as criado_em
                  from privado.whatsapp_conversa_mensagens cm
                 where cm.chave = c.chave and cm.de = 'robo'
                   and cm.texto like '%mas por aqui eu não consigo abrir%'
                   and cm.criado_em > now() - interval '30 days') r
             where r.criado_em is not null
               and c.situacao = 'robo'
               and c.ultima_da_pessoa_em > now() - interval '23 hours'
               and coalesce(c.perfil, 'trabalho') = 'trabalho'
               and not exists (select 1 from privado.curriculos_relidos l where l.chave = c.chave)
             order by r.criado_em
             limit greatest(1, least(coalesce(p_limite, 3), 10))) x), '[]'::jsonb);
end
$$;

create or replace function public.servidor_curriculo_relido(p_chave text, p_conversa text, p_resultado text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.curriculos_relidos (chave, resultado) values (p_conversa, left(coalesce(p_resultado, ''), 200))
  on conflict (chave) do update set em = now(), resultado = excluded.resultado;
end
$$;

revoke execute on function public.servidor_curriculos_sem_abrir(text, integer),
  public.servidor_curriculo_relido(text, text, text) from public;
grant execute on function public.servidor_curriculos_sem_abrir(text, integer),
  public.servidor_curriculo_relido(text, text, text) to anon, authenticated, service_role;

select privado.migracao_aplicada('20270921120000_reler_curriculos_sem_abrir');
