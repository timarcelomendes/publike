-- Juntar a conta nova do WhatsApp com a conta que já existe (21/11/2026; Marcelo: "acho que muita gente vai criar conta
-- nova com WhatsApp sem perceber, talvez ao percebermos o numero, abrir opção de vincular exigindo autenticação da
-- conta já existente" e "faça com cuidado").
--
-- Quem entra pelo WhatsApp com um número que está só no cadastro (contatos.whatsapp) de uma conta com e-mail ganha uma
-- conta nova (migração 20270818120000). Logo depois de entrar, o site pergunta se a outra conta é dela. Se é, ela entra
-- nessa conta (link no e-mail, senha ou rede social) e, com as duas provas no mesmo navegador (o código do WhatsApp,
-- guardado numa prova assinada pelo servidor por 15 minutos, e o login da outra conta), o número é vinculado a ela e a
-- conta nova, ainda vazia, é apagada. Sem as duas provas, nada se junta.
--
-- Pode rodar de novo.

-- 1. A origem nova do vínculo ---------------------------------------------------------------------------------------

alter table privado.whatsapp_login drop constraint if exists whatsapp_login_origem_check;
alter table privado.whatsapp_login add constraint whatsapp_login_origem_check check (origem in ('codigo', 'aceite', 'juntar'));

-- 2. A conta nova do WhatsApp, ainda vazia ---------------------------------------------------------------------------

-- Nasceu há menos de 2 horas, só com o celular (sem e-mail), e não tem nada da pessoa: vaga, candidatura, currículo,
-- conversa, mensagem, recado, comentário, avaliação, equipe, proposta ou pagamento. O que o site cria sozinho ao
-- nascer (perfil, preferências, a origem) vai junto quando a conta é apagada.
create or replace function privado.conta_nova_do_whatsapp_vazia(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u
                  where u.id = p_usuario and u.deleted_at is null
                    and coalesce(u.email, '') = '' and coalesce(u.phone, '') <> ''
                    and u.created_at > now() - interval '2 hours')
     and not exists (select 1 from public.anuncios a where a.autor_id = p_usuario)
     and not exists (select 1 from public.curtidas c where c.perfil_id = p_usuario)
     and not exists (select 1 from public.curriculos c where c.perfil_id = p_usuario)
     and not exists (select 1 from public.conversas c where c.conta_a = p_usuario or c.conta_b = p_usuario)
     and not exists (select 1 from public.mensagens m where m.autor_id = p_usuario)
     and not exists (select 1 from public.recados r where r.autor_id = p_usuario)
     and not exists (select 1 from public.comentarios c where c.autor_id = p_usuario)
     and not exists (select 1 from public.avaliacoes a where a.autor_id = p_usuario or a.profissional_id = p_usuario)
     and not exists (select 1 from public.equipe_agencia e where e.agencia_id = p_usuario or e.membro_id = p_usuario)
     and not exists (select 1 from public.propostas p where p.perfil_id = p_usuario)
     and not exists (select 1 from privado.cobrancas c where c.conta_id = p_usuario)
     and not exists (select 1 from privado.assinaturas a where a.conta_id = p_usuario)
$$;
revoke all on function privado.conta_nova_do_whatsapp_vazia(uuid) from public, anon, authenticated;

-- 3. Logo depois de entrar: dá para juntar? --------------------------------------------------------------------------

-- Para a conta da sessão (conferida no site): se é a conta nova e vazia do WhatsApp e o número está no cadastro de
-- outras contas com e-mail que podem receber o vínculo (não são da equipe nem da moderação, não estão banidas nem
-- apagadas e ainda não entram por um celular), devolve o número e os e-mails escondidos (até 2).
-- {pode: false} ou {pode: true, numero, contas: ["m•••@gmail.com"]}
create or replace function public.servidor_whatsapp_juntar_info(p_chave text, p_usuario uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text;
  v_contas jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if p_usuario is null or not privado.conta_nova_do_whatsapp_vazia(p_usuario) then
    return jsonb_build_object('pode', false);
  end if;
  select privado.telefone_do_login(u.phone) into v_tel from auth.users u where u.id = p_usuario;
  if v_tel is null then
    return jsonb_build_object('pode', false);
  end if;
  select coalesce(jsonb_agg(m.e order by m.e), '[]'::jsonb) into v_contas
    from (select distinct privado.email_mascarado(u.email) as e
            from public.contatos ct
            join auth.users u on u.id = ct.perfil_id
           where privado.telefone_do_login(ct.whatsapp) = v_tel
             and ct.perfil_id <> p_usuario
             and u.deleted_at is null
             and coalesce(u.email, '') <> ''
             and coalesce(u.phone, '') = ''
             and (u.banned_until is null or u.banned_until <= now())
             and not coalesce(u.is_anonymous, false)
             and not privado.conta_da_equipe_publike(u.id)
           limit 2) m
   where m.e is not null;
  if jsonb_array_length(v_contas) = 0 then
    return jsonb_build_object('pode', false);
  end if;
  return jsonb_build_object('pode', true, 'numero', v_tel, 'contas', v_contas);
end
$$;

-- 4. Juntar ---------------------------------------------------------------------------------------------------------

-- Chamada pelo site com a conta da sessão (p_conta, conferida no Auth) e a prova do WhatsApp (p_nova e p_numero, que o
-- site só aceita assinadas por ele e com menos de 15 minutos). Apaga a conta nova e vazia e vincula o número a
-- p_conta; se o vínculo não der certo, a conta nova fica como estava. Erros: 'numero_invalido', 'mesma_conta',
-- 'conta_nova_invalida' (não é mais a conta nova e vazia desse número) e os do vínculo ('conta_invalida',
-- 'ja_tem_outro', 'numero_em_uso').
create or replace function public.servidor_whatsapp_juntar(p_chave text, p_nova uuid, p_numero text, p_conta uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text := privado.telefone_do_login(p_numero);
  v_phone text;
  r text;
begin
  perform privado.exigir_servidor(p_chave);
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'numero_invalido');
  end if;
  if p_nova is null or p_conta is null or p_nova = p_conta then
    return jsonb_build_object('ok', false, 'erro', 'mesma_conta');
  end if;
  select u.phone into v_phone from auth.users u where u.id = p_nova for update;
  if not found or privado.telefone_do_login(v_phone) is distinct from v_tel
     or not privado.conta_nova_do_whatsapp_vazia(p_nova) then
    return jsonb_build_object('ok', false, 'erro', 'conta_nova_invalida');
  end if;
  begin
    delete from auth.users where id = p_nova;
    r := privado.ligar_whatsapp_ao_login(p_conta, v_tel, 'juntar');
    if r <> 'ligado' then
      -- desfaz o apagar: a conta nova continua de pé
      raise exception using errcode = 'P0001', message = r;
    end if;
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'erro', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'numero', v_tel);
end
$$;

revoke execute on function public.servidor_whatsapp_juntar_info(text, uuid),
  public.servidor_whatsapp_juntar(text, uuid, text, uuid) from public;
grant execute on function public.servidor_whatsapp_juntar_info(text, uuid),
  public.servidor_whatsapp_juntar(text, uuid, text, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270819120000_whatsapp_juntar_conta_nova');
