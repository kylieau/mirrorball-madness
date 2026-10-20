import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function GuestSignInCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button render={<Link href="/login" />} nativeButton={false}>
          Sign In
        </Button>
        <Button variant="outline" render={<Link href="/sign-up" />} nativeButton={false}>
          Create Account
        </Button>
      </CardContent>
    </Card>
  );
}
