import { supabase, supabaseEnabled } from "./supabaseClient";

const LS_FAMILY_ID = "wh-family-id-v1";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** URL의 ?fam= 값을 최우선으로 쓰고(공유 링크로 들어온 경우), 없으면 저장된 값, 그것도 없으면 새로 만든다 */
export function resolveFamilyId(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("fam");
  if (fromUrl) {
    localStorage.setItem(LS_FAMILY_ID, fromUrl);
    url.searchParams.delete("fam");
    window.history.replaceState({}, "", url.toString());
    return fromUrl;
  }
  const saved = localStorage.getItem(LS_FAMILY_ID);
  if (saved) return saved;
  const created = generateId();
  localStorage.setItem(LS_FAMILY_ID, created);
  return created;
}

export function getShareUrl(familyId: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("fam", familyId);
  return url.toString();
}

export async function fetchFamilyData(familyId: string): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_family_data", { fam_id: familyId });
  if (error) { console.error("fetchFamilyData error", error); return null; }
  return (data as Record<string, unknown>) ?? {};
}

export async function saveFamilyData(familyId: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("upsert_family_data", { fam_id: familyId, new_payload: payload });
  if (error) { console.error("saveFamilyData error", error); return false; }
  return true;
}

export { supabaseEnabled };
