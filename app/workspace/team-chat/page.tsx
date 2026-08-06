/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquareText, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { WorkspaceConversationForm, WorkspaceMessageForm } from "@/components/operations/forms";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export default async function TeamChatPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const { channel } = await searchParams;
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");
  const supabase = await createClient();
  const [channelsResult, staffResult] = await Promise.all([
    supabase.from("conversations").select("id,title,last_message_at,created_at,conversation_participants(user_id,profiles(full_name))").eq("channel_key", "workspace").eq("conversation_type", "internal").is("archived_at", null).order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("profiles").select("id,full_name").eq("account_kind", "staff").eq("activation_status", "active_staff").order("full_name"),
  ]);
  const channels = channelsResult.data ?? [];
  const activeChannelId = channels.some((item) => item.id === channel) ? channel : channels[0]?.id;
  const activeChannel = channels.find((item) => item.id === activeChannelId);
  const messagesResult = activeChannelId ? await supabase.from("messages").select("id,body,created_at,sender_id,sender:profiles!messages_sender_id_fkey(full_name)").eq("conversation_id", activeChannelId).is("deleted_at", null).order("created_at", { ascending: true }).limit(300) : { data: [] };

  return <AppShell access={access} eyebrow="التواصل الداخلي" title="محادثات فريق العمل">
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
      <nav className="h-fit divide-y divide-line rounded-md border border-line bg-surface" aria-label="مجموعات العمل">
        {channels.length ? channels.map((item:any) => {
          const names=(item.conversation_participants??[]).map((participant:any)=>Array.isArray(participant.profiles)?participant.profiles[0]?.full_name:participant.profiles?.full_name).filter(Boolean);
          return <Link key={item.id} href={`/workspace/team-chat?channel=${item.id}`} className={`block px-4 py-4 ${item.id===activeChannelId?"bg-[#eef5f1]":"hover:bg-[#fafbfa]"}`}><p className="font-bold">{item.title}</p><p className="mt-1 truncate text-xs text-muted">{names.join("، ")}</p></Link>;
        }) : <p className="px-4 py-10 text-center text-sm text-muted">لا توجد مجموعات عمل بعد.</p>}
      </nav>

      <section className="min-h-[34rem] rounded-md border border-line bg-surface">
        {activeChannel ? <><div className="border-b border-line px-5 py-4"><div className="flex items-center gap-2"><MessageSquareText className="size-5 text-brand"/><h2 className="font-bold">{activeChannel.title}</h2></div></div><div className="max-h-[32rem] space-y-3 overflow-y-auto p-5">{(messagesResult.data??[]).map((message:any)=>{const sender=Array.isArray(message.sender)?message.sender[0]:message.sender;const mine=message.sender_id===access.userId;return <article key={message.id} className={`max-w-[85%] rounded-md border px-4 py-3 ${mine?"mr-auto border-brand/20 bg-[#eef5f1]":"ml-auto border-line bg-white"}`}><p className="text-xs font-bold text-brand">{sender?.full_name??"موظف"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-7">{message.body}</p><p className="mt-1 text-[11px] text-muted">{new Intl.DateTimeFormat("ar-EG",{timeZone:"Asia/Riyadh",dateStyle:"short",timeStyle:"short"}).format(new Date(message.created_at))}</p></article>})}{!(messagesResult.data??[]).length?<p className="py-12 text-center text-sm text-muted">ابدأ أول رسالة في المجموعة.</p>:null}</div><div className="border-t border-line p-5"><WorkspaceMessageForm conversationId={activeChannel.id}/></div></>:<div className="grid min-h-[34rem] place-items-center text-sm text-muted">اختر مجموعة أو أنشئ مجموعة جديدة.</div>}
      </section>

      {access.permissions.includes("team_chats.manage") ? <aside className="h-fit rounded-md border border-line bg-surface p-5"><div className="mb-4 flex items-center gap-2"><UsersRound className="size-5 text-brand"/><h2 className="font-bold">مجموعة عمل جديدة</h2></div><WorkspaceConversationForm staff={(staffResult.data??[]).map((item)=>({id:item.id,name:item.full_name}))}/></aside> : null}
    </div>
  </AppShell>;
}
