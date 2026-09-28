import { redirect } from "next/navigation";

// Bookmark alias. The fan Home tab lives at `/`.
export default function TodayRedirect() {
  redirect("/");
}
