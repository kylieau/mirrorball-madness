import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signUp } from "@/app/auth/actions";
const sdk = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["origin", "https://app.example.test"]]) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: sdk.signIn, signUp: sdk.signUp } }) }));
function form() { const data=new FormData();data.set("email","synthetic@example.test");data.set("password","synthetic-password");data.set("displayName"," Synthetic Name ");data.set("next","/join/ABC123");return data; }
beforeEach(() => vi.resetAllMocks());
describe("auth continuation", () => {
  it("returns a credential error without redirecting away from the invite form, then resumes the invite on retry", async () => {
    sdk.signIn.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } }).mockResolvedValueOnce({ error: null });
    const data=form();expect(await signIn({error:null},data)).toEqual({error:"Email or password is incorrect."});
    await expect(signIn({error:null},data)).rejects.toThrow("REDIRECT:/join/ABC123");
  });
  it("does not redirect a confirmation-enabled signup into a sessionless app", async () => {
    sdk.signUp.mockResolvedValue({data:{session:null},error:null});
    const state=await signUp({error:null},form());expect(state.error).toBeNull();expect(state.notice).toMatch(/Check your email/);
    expect(sdk.signUp.mock.calls[0][0].options.emailRedirectTo).toContain("/auth/confirm?next=%2Fjoin%2FABC123");
    expect(sdk.signUp.mock.calls[0][0].options.data.display_name).toBe("Synthetic Name");
  });
  it("refuses a blank display name before creating the account", async () => {
    const data=form();data.set("displayName","   ");
    expect(await signUp({error:null},data)).toEqual({error:"Display name is required."});expect(sdk.signUp).not.toHaveBeenCalled();
  });
  it("does not accept an external continuation after successful authentication", async () => {
    sdk.signIn.mockResolvedValue({error:null});const data=form();data.set("next","//evil.example.test");
    await expect(signIn({error:null},data)).rejects.toThrow("REDIRECT:/");
  });
});
