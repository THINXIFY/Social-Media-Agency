import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Composer } from "@/components/social/composer";
import { PublishingPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Edit post" };

/** Only the signed-in customer's own posts are ever loaded; anything else is a 404. */
export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PublishingPage
      render={(data) => {
        const post = data.posts.find((p) => p.id === id);
        if (!post) notFound();
        return <Composer key={post.id + post.updatedAt} data={data} post={post} />;
      }}
    />
  );
}
